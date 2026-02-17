import json
import threading
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict

from dotenv import load_dotenv
import os

from app.services.preprocess import preprocess, preprocess_clarification
from app.services.parse import parse
from app.services.rules import apply_rules
from app.services.rulings import generate_ruling
from app.services.cbp_rulings import fetch_cbp_rulings_for_rules
from app.services.cbp_rulings import search_cbp_rulings
from app.services.bulk_orchestrator import (
    create_bulk_run,
    process_bulk_run,
    get_bulk_run,
    clarify_item,
    cancel_bulk_run,
)
from app.models import PreprocessRequest
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
PINECONE_API_KEY = os.environ.get("PINECONE_API_KEY")
PINECONE_HOST = os.environ.get("PINECONE_HOST")

app = FastAPI()


class ClassifyRequest(BaseModel):
    product_description: str
    user_id: str
    confidence_threshold: float = 0.8
    is_clarification: bool = False
    original_query: Optional[str] = None
    clarification_response: Optional[str] = None


@app.post("/classify")
def classify(req: ClassifyRequest):
    # When this is a clarification follow-up, send both original + answer
    # to a special preprocess that merges them intelligently
    if req.is_clarification and req.original_query and req.clarification_response:
        preprocessed = preprocess_clarification(
            original_query=req.original_query,
            clarification_response=req.clarification_response,
            user_id=req.user_id,
        )
    else:
        preprocessed = preprocess(
            PreprocessRequest(
                product_description=req.product_description,
                user_id=req.user_id,
            )
        )
    print("PREPROCESS OUTPUT:", preprocessed)

    # If preprocess detects ambiguity, return clarification.
    # Skip this when user is already answering a clarification.
    if preprocessed.get("needs_clarification") and not req.is_clarification:
        return {
            "type": "clarify",
            "clarifications": preprocessed.get("clarification_questions", [
                {"question": "Could you describe the product in more detail?", "options": []}
            ]),
            "partial_matches": [],
            "classification_trace": f"Preprocess flagged input as ambiguous. Corrections: {preprocessed.get('corrections_made', 'none')}",
            "normalized": preprocessed.get("cleaned_text", ""),
            "attributes": {
                "product_name": preprocessed.get("product_name", ""),
                "material": preprocessed.get("material", ""),
                "usage": preprocessed.get("usage", ""),
            },
        }

    parsed = parse(preprocessed)
    print("PARSE OUTPUT:", parsed)
    rules_out = apply_rules(parsed)
    
    print("DEBUG INPUT TO RULING:", {
         "product": parsed.get("product"),
         "attributes": parsed.get("attributes"),
         "matched_rules": rules_out.get("matched_rules", [])
    })


    ruling = generate_ruling({
        "product": parsed.get("product"),
        "attributes": parsed.get("attributes"),
        "matched_rules": rules_out.get("matched_rules", []),
        "is_clarification": req.is_clarification,
    })
    
    print(json.dumps(ruling, separators=(",", ":"), ensure_ascii=False))
    
    if ruling.get("type") == "clarify":
        return {
            "type": "clarify",
            "clarifications": ruling.get("clarifications", []),
            "partial_matches": ruling.get("partial_matches", []),
            "classification_trace": ruling.get("classification_trace", ""),
        }

    if ruling.get("type") == "answer":
        matched_rules = ruling.get("matched_rules", [])
        max_confidence = max(
        (c.get("confidence", 0) for c in matched_rules),
        default=0
        )

        if max_confidence < 0.2:  # hardcoding to see all results
            return {
            "type": "exception",
            "reason": "LOW_CONFIDENCE",
            "confidence": max_confidence,
            "data": ruling,
            }
        
        return {
            "type": "answer",
            "matches": ruling,
            "max_confidence": max_confidence,
            "classification_trace": ruling.get("classification_trace", ""),
        }
    return {
        "type": "error",
        "message": "Unhandled classification state",
    }


# ============================================================================
# Bulk Classification Endpoints
# ============================================================================

@app.post("/bulk-classify")
async def bulk_classify(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    confidence_threshold: float = Form(0.70),
):
    """
    Upload a CSV/Excel/PDF file and start bulk HTS classification.
    Returns a run_id for polling progress.
    """
    # Validate file type
    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else ""
    if ext not in ("csv", "xlsx", "xls", "pdf"):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: .{ext}")

    file_content = await file.read()
    if not file_content:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        run_meta = create_bulk_run(
            user_id=user_id,
            file_name=file.filename or "upload",
            file_type=ext,
            file_content=file_content,
            confidence_threshold=confidence_threshold,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ImportError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Start processing in background thread
    thread = threading.Thread(
        target=process_bulk_run,
        args=(run_meta["run_id"],),
        daemon=True,
    )
    thread.start()

    return run_meta


@app.get("/bulk-classify/{run_id}")
def get_bulk_run_status(run_id: str):
    """
    Poll the status of a bulk classification run.
    Returns progress, items, and results.
    """
    run = get_bulk_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Bulk run not found")
    return run


class ClarifyRequest(BaseModel):
    item_id: str
    answers: Dict[str, str]


@app.post("/bulk-classify/{run_id}/clarify")
def clarify_bulk_item(run_id: str, req: ClarifyRequest):
    """
    Submit clarification answers for an exception item.
    Re-classifies only the specific item with enhanced context.
    """
    result = clarify_item(run_id, req.item_id, req.answers)
    if not result:
        raise HTTPException(status_code=404, detail="Run or item not found")
    return result


@app.delete("/bulk-classify/{run_id}")
def delete_bulk_run(run_id: str):
    """Cancel a running bulk classification."""
    success = cancel_bulk_run(run_id)
    if not success:
        raise HTTPException(status_code=404, detail="Run not found or already completed")
    return {"success": True}
