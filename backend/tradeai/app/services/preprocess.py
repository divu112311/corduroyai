from app.models import PreprocessRequest, PreprocessResponse
from app.services.llm_call import call_llm
import json
import re


def preprocess_clarification(original_query: str, clarification_response: str, user_id: str = "") -> dict:
    """
    Preprocess a clarification follow-up. The user originally typed something
    ambiguous, was asked a question, and responded. We need BOTH pieces to
    understand what they want.

    Examples:
      original="cow for speakers", clarification="cow for meat"
        → user corrected entirely, product is "cow for meat" (bovine for meat)
      original="cow for speakers", clarification="meat"
        → user answered the question, product is "cow for meat" (bovine for meat)
      original="horses", clarification="live horses for racing"
        → user specified, product is "live horses for racing"
    """
    prompt = f"""You are a trade compliance assistant. A user is clarifying what product they want to classify.

ORIGINAL INPUT (was flagged as ambiguous):
"{original_query}"

USER'S CLARIFICATION RESPONSE:
"{clarification_response}"

Your job: combine these two pieces to understand what single physical product the user wants to classify.

Rules:
- The clarification REFINES or CORRECTS the original. Trust the clarification over the original.
- If the clarification is a full product description, use it (the user corrected themselves).
- If the clarification is a short answer (like "meat" or "live"), combine it with context from the original to build the full product description.
- Extract all attributes you can from BOTH inputs combined.
- Do NOT set ambiguous to true. The user already clarified. Just do your best to extract the product.
- Only set too_vague to true if even after combining both inputs you truly cannot determine any product.

Respond in this exact JSON format:
{{
    "product_name": "the resolved product name",
    "product_description": "clear description combining original context + clarification",
    "gender": "male/female/unisex or empty",
    "material": "material type or empty",
    "breed": "breed type or empty",
    "age": "age or age group or empty",
    "usage": "intended usage or empty",
    "form": "physical form or empty",
    "processing": "level of processing or empty",
    "ambiguous": false,
    "too_vague": false,
    "corrections_made": "how you combined the original + clarification",
    "clarification_questions": []
}}

Respond ONLY with JSON.
"""
    try:
        result = call_llm(
            provider="openai",
            model="gpt-4o",
            prompt=prompt,
            temperature=0,
        )
        llm_text = result.get("text", "")
        print("Clarification preprocess output:", llm_text)

        match = re.search(r'\{.*\}', llm_text, re.DOTALL)
        if match:
            parsed = json.loads(match.group())
            return {
                "cleaned_text": parsed.get("product_description", clarification_response.strip()),
                "product_name": parsed.get("product_name", ""),
                "gender": parsed.get("gender", ""),
                "material": parsed.get("material", ""),
                "breed": parsed.get("breed", ""),
                "age": parsed.get("age", ""),
                "usage": parsed.get("usage", ""),
                "form": parsed.get("form", ""),
                "processing": parsed.get("processing", ""),
                "user_id": user_id,
                "needs_clarification": False,
                "corrections_made": parsed.get("corrections_made", ""),
            }
    except Exception as e:
        print(f"Clarification preprocess error: {e}")

    # Fallback: just use the clarification response
    return {
        "cleaned_text": clarification_response.strip(),
        "product_name": clarification_response.strip(),
        "gender": "",
        "material": "",
        "breed": "",
        "age": "",
        "usage": "",
        "form": "",
        "processing": "",
        "user_id": user_id,
        "needs_clarification": False,
    }


def preprocess(data: PreprocessRequest) -> PreprocessResponse:
    text = data.product_description
    
    prompt = f"""You are a trade compliance assistant specializing in HTS classification.

Given this raw product input, you must:
1. Understand the user's INTENT — what physical product are they trying to classify?
2. Only fix OBVIOUS abbreviations and shorthand (e.g., "tshrt" → "t-shirt", "spkr" → "speaker", "alum" → "aluminum")
3. Handle multiple languages — translate non-English product names to English
4. Detect AMBIGUITY — if the input is unclear, doesn't make sense as a product, or could mean multiple things, ASK the user
5. Extract structured attributes

CRITICAL RULES:
- NEVER guess or auto-correct a real word into a different word. If someone types "cow", that IS a cow.
  Do NOT change it to "cover" or anything else. Only correct obvious non-word typos and abbreviations.
- If the combination of words doesn't make clear sense as a single product (e.g., "cow for speakers"
  is confusing — a cow is an animal, speakers are electronics), set "ambiguous" to true and ASK what they mean.
- If a single word could refer to multiple product categories, set "ambiguous" to true.
  Example: "horses" could be live horses, horse meat, horsehair — ask which one.
- If the input is nonsensical or too vague (e.g., "thing", "stuff", "abc"), set "too_vague" to true.
- When in doubt, ASK. Never assume.

Raw input: "{text}"

Respond in this exact JSON format:
{{
    "product_name": "the product name as the user gave it (only fix obvious abbreviations)",
    "product_description": "cleaned description of the physical product, or the raw input if unclear",
    "gender": "male/female/unisex or empty if not applicable",
    "material": "material type or empty if not mentioned",
    "breed": "breed type or empty if not applicable",
    "age": "age or age group or empty if not mentioned",
    "usage": "intended usage or empty if not mentioned",
    "form": "physical form (liquid/solid/powder/woven/knitted/etc.) or empty",
    "processing": "level of processing (raw/processed/assembled/etc.) or empty",
    "ambiguous": false,
    "too_vague": false,
    "corrections_made": "what you corrected and why, or empty if nothing was changed",
    "clarification_questions": []
}}

Examples:
- "cow for speakers" → ambiguous: true, clarification_questions: ["Your input 'cow for speakers' is unclear. Did you mean a cover/case for speakers, or something else? Please describe the product you want to classify."]
- "horses" → ambiguous: true, clarification_questions: ["Are you classifying live horses, horse meat, horsehair, or horse-related products like saddles?"]
- "cotton tshrt mens" → product_name: "men's cotton t-shirt", corrections_made: "expanded 'tshrt' to 't-shirt'"
- "bluetooth speaker" → product_name: "bluetooth speaker", ambiguous: false
- "xyz123" → too_vague: true, clarification_questions: ["Could you describe the physical product you want to classify?"]

Respond ONLY with JSON.
"""
    
    preprocessedllm_result = call_llm(
        provider="openai",
        model="gpt-4o",
        prompt=prompt,
        temperature=0,
    )
    llm_text = preprocessedllm_result.get("text", "")
    print("Cleaning Output in Preprocessed by LLM Call", preprocessedllm_result)
    print("Preprocessed LLM Output:", llm_text)
    
    try:
        match = re.search(r'\{.*\}', llm_text, re.DOTALL)
        if match:
            parsed = json.loads(match.group())

            # If input is too vague or ambiguous, return early with questions
            is_ambiguous = parsed.get("ambiguous", False)
            is_too_vague = parsed.get("too_vague", False)
            questions = parsed.get("clarification_questions", [])

            if (is_ambiguous or is_too_vague) and questions:
                return {
                    "cleaned_text": parsed.get("product_description", text.strip()),
                    "product_name": parsed.get("product_name", ""),
                    "gender": parsed.get("gender", ""),
                    "material": parsed.get("material", ""),
                    "breed": parsed.get("breed", ""),
                    "age": parsed.get("age", ""),
                    "usage": parsed.get("usage", ""),
                    "form": parsed.get("form", ""),
                    "processing": parsed.get("processing", ""),
                    "user_id": data.user_id or "",
                    "needs_clarification": True,
                    "clarification_questions": questions,
                    "corrections_made": parsed.get("corrections_made", ""),
                }

            corrections = parsed.get("corrections_made", "")
            if corrections:
                print(f"Preprocess corrections: {corrections}")

            return {
                "cleaned_text": parsed.get("product_description", text.strip()),
                "product_name": parsed.get("product_name", ""),
                "gender": parsed.get("gender", ""),
                "material": parsed.get("material", ""),
                "breed": parsed.get("breed", ""),
                "age": parsed.get("age", ""),
                "usage": parsed.get("usage", ""),
                "form": parsed.get("form", ""),
                "processing": parsed.get("processing", ""),
                "user_id": data.user_id or "",
                "needs_clarification": False,
                "corrections_made": corrections,
            }
    except Exception as e:
        print(f"Preprocess parse error: {e}")
    
    return {
        "cleaned_text": text.strip(),
        "product_name": "",
        "gender": "",
        "material": "",
        "breed": "",
        "age": "",
        "usage": "",
        "form": "",
        "processing": "",
        "user_id": data.user_id or "",
        "needs_clarification": False,
    }