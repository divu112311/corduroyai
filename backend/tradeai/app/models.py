from pydantic import BaseModel
from typing import Dict, Any, List, Optional


# ---------- Preprocess ----------
class PreprocessRequest(BaseModel):
    product_description: str
    user_id: Optional[str] = None


class PreprocessResponse(BaseModel):
    cleaned_text: str
    product_name: Optional[str] = ""
    gender: Optional[str] = ""
    material: Optional[str] = ""
    breed: Optional[str] = ""
    age: Optional[str] = ""
    usage: Optional[str] = ""
    user_id: Optional[str] = ""


# ---------- Parse ----------

class ParseRequest(BaseModel):
    cleaned_text: str
    product_name: Optional[str] = ""
    gender: Optional[str] = ""
    material: Optional[str] = ""
    breed: Optional[str] = ""
    age: Optional[str] = ""
    usage: Optional[str] = ""
    user_id: Optional[str] = ""

class ParseResponse(BaseModel):
    product: str
    attributes: Dict[str, Any]
    user_id: Optional[str] = ""

# ---------- Rules ----------
class RulesRequest(BaseModel):
    product: str
    attributes: Dict[str, Any]

class RulesResponse(BaseModel):
    normalized: str
    attributes: Dict[str, Any]
    matched_rules: List[Dict[str, Any]]



# ---------- Rulings ----------

class RulingsRequest(BaseModel):
    product: str
    attributes: Dict[str, Any]
    matched_rules: List[str]

class MatchedRule(BaseModel):
    hts: str
    description: str
    score: float
    confidence: float
    rationale: str

class RulingsResponse(BaseModel):
    type: str  # "answer" | "clarify"
    # present only when type == "answer"
    product: Optional[str] = None
    attributes: Optional[Dict[str, Any]] = None
    matched_rules: Optional[List[MatchedRule]] = None
    # present only when type == "clarify"
    clarifications: Optional[List[str]] = None