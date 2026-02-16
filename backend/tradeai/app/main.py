import json
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional

from dotenv import load_dotenv
import os

from app.services.preprocess import preprocess, preprocess_clarification
from app.services.parse import parse
from app.services.rules import apply_rules
from app.services.rulings import generate_ruling
from app.services.cbp_rulings import fetch_cbp_rulings_for_rules
from app.services.cbp_rulings import search_cbp_rulings
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
                "Could you describe the product in more detail?"
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
