from app.models import PreprocessRequest, PreprocessResponse
from app.services.llm_call import call_llm
import json
import re

def preprocess(data: PreprocessRequest) -> PreprocessResponse:
    text = data.product_description
    
    prompt = f"""You are a trade compliance assistant specializing in HTS classification.

Given this raw product input, you must:
1. Understand the user's INTENT — what physical product are they trying to classify?
2. Fix spelling errors, typos, shorthand, and slang (e.g., "cow" → "cover", "spkr" → "speaker", "tshrt" → "t-shirt")
3. Handle multiple languages — translate non-English product names to English
4. Detect AMBIGUITY — if the input could refer to multiple very different products, flag it
5. Extract structured attributes

CRITICAL RULES:
- Think like a customs broker. "cow" by itself could be a live cow (Chapter 01) or a misspelling of "cover".
  "cow for speakers" almost certainly means "cover for speakers", NOT a bovine animal near audio equipment.
- If the input is clearly a product, normalize it. Don't just pass through gibberish.
- If the input is genuinely ambiguous (could be 2+ VERY different products), set "ambiguous" to true
  and provide clarification questions.
- If the input is nonsensical or too vague to classify (e.g., "thing", "stuff", "abc"), set "too_vague" to true.

Raw input: "{text}"

Respond in this exact JSON format:
{{
    "product_name": "the corrected/normalized product name",
    "product_description": "cleaned, trade-classification-ready description of the physical product",
    "gender": "male/female/unisex or empty if not applicable",
    "material": "material type or empty if not mentioned",
    "breed": "breed type or empty if not applicable",
    "age": "age or age group or empty if not mentioned",
    "usage": "intended usage or empty if not mentioned",
    "form": "physical form (liquid/solid/powder/woven/knitted/etc.) or empty",
    "processing": "level of processing (raw/processed/assembled/etc.) or empty",
    "ambiguous": false,
    "too_vague": false,
    "corrections_made": "what you corrected and why, or empty if input was clear",
    "clarification_questions": []
}}

Examples:
- "cow for speakers" → product_name: "cover for speakers", corrections_made: "corrected 'cow' to 'cover' (likely typo)"
- "horses" → ambiguous: true, clarification_questions: ["Are you classifying live horses, horse meat, horsehair, or horse-related products?"]
- "cotton tshrt mens" → product_name: "men's cotton t-shirt", corrections_made: "expanded abbreviations"
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