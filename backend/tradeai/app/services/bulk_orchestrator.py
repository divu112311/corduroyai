"""
Bulk Classification Orchestrator - Manages batch processing of multiple products.
Handles parallel classification, progress tracking, and error isolation.
"""

import uuid
import asyncio
import traceback
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from concurrent.futures import ThreadPoolExecutor

from app.services.file_parser import parse_file
from app.services.file_extraction import extract_all_products
from app.services.preprocess import preprocess, preprocess_clarification
from app.services.parse import parse
from app.services.rules import apply_rules
from app.services.rulings import generate_ruling
from app.models import PreprocessRequest


# In-memory store for bulk runs (MVP — replace with Supabase in production)
BULK_RUNS: Dict[str, Dict[str, Any]] = {}

MAX_CONCURRENT = 5  # Max parallel classification workers


def create_bulk_run(
    user_id: str,
    file_name: str,
    file_type: str,
    file_content: bytes,
    confidence_threshold: float = 0.70,
    file_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create a new bulk classification run:
    1. Parse the uploaded file
    2. Extract product data from rows
    3. Initialize tracking state
    4. Return run metadata (processing happens async)
    """
    # Parse file into raw rows
    rows = parse_file(file_content, file_name)
    if not rows:
        raise ValueError("File contains no data or could not be parsed")

    # Extract structured product data (returns dict with products + metadata)
    extraction_result = extract_all_products(rows, file_name)
    products = extraction_result["products"]
    file_metadata = extraction_result["metadata"]

    if not products:
        raise ValueError("No products could be extracted from the file")

    run_id = str(uuid.uuid4())
    total_items = len(products)

    # Initialize run state
    run = {
        "run_id": run_id,
        "user_id": user_id,
        "file_name": file_name,
        "file_type": file_type,
        "file_url": file_url,
        "status": "processing",
        "total_items": total_items,
        "progress_current": 0,
        "progress_total": total_items,
        "results_summary": {"completed": 0, "exceptions": 0, "errors": 0},
        "items": [],
        "products": products,  # Keep for re-classification
        "file_metadata": file_metadata,
        "confidence_threshold": confidence_threshold,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "error_message": None,
    }

    # Initialize items
    for i, product in enumerate(products):
        item = {
            "id": str(uuid.uuid4()),
            "run_id": run_id,
            "row_number": product.get("__row_number", i + 1),
            "extracted_data": {k: v for k, v in product.items() if not k.startswith("__")},
            "status": "pending",
            "classification_result": None,
            "error": None,
            "clarification_questions": None,
            "clarification_answers": None,
        }
        run["items"].append(item)

    BULK_RUNS[run_id] = run
    return {
        "run_id": run_id,
        "status": "processing",
        "total_items": total_items,
        "file_metadata": file_metadata,
    }


def classify_single_product(product_data: Dict[str, Any], confidence_threshold: float) -> Dict[str, Any]:
    """
    Classify a single product through the existing pipeline.
    Returns the classification result or exception info.
    """
    # Build product description for classification
    description_parts = []
    if product_data.get("product_name"):
        description_parts.append(product_data["product_name"])
    if product_data.get("description"):
        description_parts.append(product_data["description"])
    if product_data.get("materials"):
        description_parts.append(f"Material: {product_data['materials']}")
    if product_data.get("country_of_origin"):
        description_parts.append(f"Origin: {product_data['country_of_origin']}")
    if product_data.get("intended_use"):
        description_parts.append(f"Intended use: {product_data['intended_use']}")

    product_description = ". ".join(description_parts)

    if not product_description.strip():
        return {
            "type": "error",
            "error": "No product description available for classification",
        }

    try:
        # Step 1: Preprocess
        preprocessed = preprocess(
            PreprocessRequest(product_description=product_description)
        )

        # If preprocess flags ambiguity, return as exception with questions
        if preprocessed.get("needs_clarification"):
            return {
                "type": "exception",
                "reason": "NEEDS_CLARIFICATION",
                "clarification_questions": preprocessed.get("clarification_questions", []),
                "partial_data": preprocessed,
            }

        # Step 2: Parse
        parsed = parse(preprocessed)

        # Step 3: Apply rules
        rules_out = apply_rules(parsed)

        # Step 4: Generate ruling
        ruling = generate_ruling({
            "product": parsed.get("product"),
            "attributes": parsed.get("attributes"),
            "matched_rules": rules_out.get("matched_rules", []),
            "is_clarification": False,
        })

        if ruling.get("type") == "clarify":
            return {
                "type": "exception",
                "reason": "NEEDS_CLARIFICATION",
                "clarification_questions": ruling.get("clarifications", []),
                "partial_data": ruling,
            }

        if ruling.get("type") == "answer":
            matched_rules = ruling.get("matched_rules", [])
            max_confidence = max(
                (c.get("confidence", 0) for c in matched_rules),
                default=0,
            )

            if max_confidence < confidence_threshold:
                return {
                    "type": "exception",
                    "reason": "LOW_CONFIDENCE",
                    "confidence": max_confidence,
                    "data": ruling,
                    "clarification_questions": [
                        {
                            "question": f"The classification confidence is {max_confidence:.0%}. Can you provide more details about this product?",
                            "options": [],
                        }
                    ],
                }

            return {
                "type": "answer",
                "data": ruling,
                "max_confidence": max_confidence,
            }

        return {
            "type": "error",
            "error": "Unhandled classification state",
        }

    except Exception as e:
        print(f"Classification error: {traceback.format_exc()}")
        return {
            "type": "error",
            "error": str(e),
        }


def _process_item(run_id: str, item_index: int) -> None:
    """Process a single item within a bulk run. Updates run state in-place."""
    run = BULK_RUNS.get(run_id)
    if not run or run["status"] == "cancelled":
        return

    item = run["items"][item_index]
    item["status"] = "processing"

    try:
        result = classify_single_product(
            item["extracted_data"],
            run["confidence_threshold"],
        )

        if result["type"] == "answer":
            item["status"] = "completed"
            item["classification_result"] = result.get("data")
            run["results_summary"]["completed"] += 1
        elif result["type"] == "exception":
            item["status"] = "exception"
            item["classification_result"] = result.get("data") or result.get("partial_data")
            item["clarification_questions"] = result.get("clarification_questions")
            run["results_summary"]["exceptions"] += 1
        else:
            item["status"] = "error"
            item["error"] = result.get("error", "Unknown error")
            run["results_summary"]["errors"] += 1

    except Exception as e:
        item["status"] = "error"
        item["error"] = str(e)
        run["results_summary"]["errors"] += 1

    # Update progress
    run["progress_current"] += 1
    run["updated_at"] = datetime.now(timezone.utc).isoformat()


def process_bulk_run(run_id: str) -> None:
    """
    Process all items in a bulk run using a thread pool.
    Called in the background after creating the run.
    """
    run = BULK_RUNS.get(run_id)
    if not run:
        return

    try:
        with ThreadPoolExecutor(max_workers=MAX_CONCURRENT) as executor:
            futures = []
            for i in range(len(run["items"])):
                if run["status"] == "cancelled":
                    break
                futures.append(executor.submit(_process_item, run_id, i))

            # Wait for all to complete
            for f in futures:
                f.result()  # Re-raises exceptions

        # Mark as complete
        if run["status"] != "cancelled":
            run["status"] = "completed"
            run["completed_at"] = datetime.now(timezone.utc).isoformat()

    except Exception as e:
        run["status"] = "failed"
        run["error_message"] = str(e)

    run["updated_at"] = datetime.now(timezone.utc).isoformat()


def get_bulk_run(run_id: str) -> Optional[Dict[str, Any]]:
    """Get the current state of a bulk run."""
    run = BULK_RUNS.get(run_id)
    if not run:
        return None

    # Return a clean copy without internal fields
    return {
        "run_id": run["run_id"],
        "user_id": run["user_id"],
        "file_name": run["file_name"],
        "file_type": run["file_type"],
        "status": run["status"],
        "total_items": run["total_items"],
        "progress_current": run["progress_current"],
        "progress_total": run["progress_total"],
        "results_summary": run["results_summary"],
        "file_metadata": run.get("file_metadata"),
        "items": [
            {
                "id": item["id"],
                "row_number": item["row_number"],
                "extracted_data": item["extracted_data"],
                "status": item["status"],
                "classification_result": item["classification_result"],
                "error": item["error"],
                "clarification_questions": item["clarification_questions"],
                "clarification_answers": item["clarification_answers"],
            }
            for item in run["items"]
        ],
        "error_message": run["error_message"],
        "created_at": run["created_at"],
        "updated_at": run["updated_at"],
        "completed_at": run["completed_at"],
    }


def clarify_item(run_id: str, item_id: str, answers: Dict[str, str]) -> Optional[Dict[str, Any]]:
    """
    Re-classify a single item with clarification answers.
    Only re-runs the specific item, not the entire batch.
    """
    run = BULK_RUNS.get(run_id)
    if not run:
        return None

    # Find the item
    item = None
    item_index = None
    for i, it in enumerate(run["items"]):
        if it["id"] == item_id:
            item = it
            item_index = i
            break

    if not item:
        return None

    # Build the clarification response from answers
    answer_text = ". ".join(f"{k}: {v}" for k, v in answers.items())

    # Build original description
    product_data = item["extracted_data"]
    description_parts = []
    if product_data.get("product_name"):
        description_parts.append(product_data["product_name"])
    if product_data.get("description"):
        description_parts.append(product_data["description"])
    original_query = ". ".join(description_parts)

    try:
        # Re-run classification with clarification context
        preprocessed = preprocess_clarification(
            original_query=original_query,
            clarification_response=answer_text,
        )

        parsed = parse(preprocessed)
        rules_out = apply_rules(parsed)
        ruling = generate_ruling({
            "product": parsed.get("product"),
            "attributes": parsed.get("attributes"),
            "matched_rules": rules_out.get("matched_rules", []),
            "is_clarification": True,
        })

        if ruling.get("type") == "answer":
            matched_rules = ruling.get("matched_rules", [])
            max_confidence = max(
                (c.get("confidence", 0) for c in matched_rules),
                default=0,
            )

            # Update item
            item["status"] = "completed"
            item["classification_result"] = ruling
            item["clarification_answers"] = answers

            # Update run summary
            run["results_summary"]["exceptions"] -= 1
            run["results_summary"]["completed"] += 1
            run["updated_at"] = datetime.now(timezone.utc).isoformat()

            return {
                "item_id": item_id,
                "status": "completed",
                "classification_result": ruling,
                "max_confidence": max_confidence,
            }

        # Still needs more info
        item["clarification_answers"] = answers
        if ruling.get("clarifications"):
            item["clarification_questions"] = ruling["clarifications"]

        return {
            "item_id": item_id,
            "status": "exception",
            "clarification_questions": ruling.get("clarifications", []),
        }

    except Exception as e:
        item["status"] = "error"
        item["error"] = str(e)
        run["results_summary"]["exceptions"] -= 1
        run["results_summary"]["errors"] += 1
        return {
            "item_id": item_id,
            "status": "error",
            "error": str(e),
        }


def cancel_bulk_run(run_id: str) -> bool:
    """Cancel a running bulk classification."""
    run = BULK_RUNS.get(run_id)
    if not run:
        return False

    if run["status"] in ("processing", "pending"):
        run["status"] = "cancelled"
        run["updated_at"] = datetime.now(timezone.utc).isoformat()
        return True

    return False
