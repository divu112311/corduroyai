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
- A SINGLE word is ONLY ambiguous if it could refer to genuinely DIFFERENT HTS chapters:
  "cow" → could be live cattle (ch.01), beef (ch.02), or cowhide (ch.41) — different chapters, so ASK.
  "horses" → could be live (ch.01), meat (ch.02), or horsehair (ch.05) — different chapters, so ASK.
  "apple" → could be fresh fruit (ch.08), apple chips (ch.20), or Apple electronics (ch.84/85) — ASK.
- A SINGLE word that always maps to ONE product type is NOT ambiguous, even if sub-variants exist:
  "vodka" → always a distilled spirit (ch.22), whether flavored or unflavored — NOT ambiguous.
  "beer" → always a fermented beverage (ch.22) — NOT ambiguous.
  "cement" → always a building material (ch.25) — NOT ambiguous.
  "sugar" → always a sweetener (ch.17) — NOT ambiguous.
  "shrimp" → always seafood (ch.03 or ch.16) — NOT ambiguous, classify with best guess.
- MULTIPLE WORDS that together describe a specific product are almost NEVER ambiguous:
  "men's denim jeans" → specific apparel (gender + material + item) — NOT ambiguous.
  "frozen shrimp" → seafood + processing state — NOT ambiguous.
  "LED bulb for office" → specific lighting product — NOT ambiguous.
  "baby cotton onesie" → specific baby apparel — NOT ambiguous.
- If the user provides context that makes it clear, it is NOT ambiguous. Do NOT ask.
  "cow for meat" = bovine meat. "horse hair" = horsehair. "live cow" = live bovine. "cow leather" = cowhide.
- If the input is nonsensical or too vague (e.g., "thing", "stuff", "abc"), set "too_vague" to true.
- BRAND NAMES: If the input contains a brand name alongside a product description, the brand REINFORCES
  the product category — it does NOT create ambiguity. Focus on the product type, not the brand name.
  A brand name + product type that are in the same product category = NOT ambiguous.
  "ChapStick lip balm" → both refer to lip care cosmetics → NOT ambiguous.
  "Band-Aid bandages" → both refer to adhesive bandages → NOT ambiguous.
  "Tylenol pain reliever" → both refer to medication → NOT ambiguous.
- When in doubt, ASK. But if the user gave you enough context to determine the product category, just classify it.

Raw input: "{text}"

Respond in this exact JSON format:
{{
    "product_name": "the product name as the user gave it (only fix obvious abbreviations)",
    "product_description": "cleaned description of the physical product, or the raw input if unclear",
    "gender": "male/female/unisex or empty if not applicable",
    "material": "material type or empty if not mentioned",
    "breed": "breed type or empty if not applicable",
    "age": "age or age group or empty if not mentioned",
    "product_type": "broad product category (e.g., apparel, footwear, leather article, furniture, electronics, cosmetics, food/beverage, raw material, fabric, machinery, jewelry, toy, vehicle, etc.)",
    "usage": "intended usage or empty if not mentioned",
    "form": "physical form (liquid/solid/powder/woven/knitted/crocheted/etc.) or empty. IMPORTANT for textiles: baby/infant apparel (onesies, rompers, bodysuits), socks, stockings, tights, t-shirts, sweaters, sweatshirts, and hosiery are typically KNITTED. Jeans, dress shirts, suits, blazers, trousers are typically WOVEN.",
    "processing": "level of processing (raw/processed/assembled/etc.) or empty",
    "ambiguous": false,
    "too_vague": false,
    "corrections_made": "what you corrected and why, or empty if nothing was changed",
    "clarification_questions": []
}}

IMPORTANT: When ambiguous or too_vague is true, provide ONE clarification question with selectable options.
Format each question as an object: {{"question": "...", "options": ["option A", "option B", ...]}}
- The question should be simple and in plain English
- Options should be 2-4 concrete product categories the user can pick from
- Only ask about the PHYSICAL PRODUCT — never about HTS codes, chapter notes, or tariff details

Examples of when TO flag as ambiguous (spans different chapters):
- "cow for speakers" → ambiguous: true (confusing combination — cow is animal, speakers are electronics)
- "horses" → ambiguous: true (live ch.01 vs meat ch.02 vs horsehair ch.05)
- "cow" → ambiguous: true (live ch.01 vs beef ch.02 vs leather ch.41)
- "apple" → ambiguous: true (fruit ch.08 vs apple chips ch.20 vs Apple electronics ch.84/85)

Examples of when NOT to flag as ambiguous:
- "men's denim jeans" → NOT ambiguous (multi-word: gender + material + item = specific apparel)
- "frozen shrimp" → NOT ambiguous (product + processing = clearly seafood)
- "vodka" → NOT ambiguous (always distilled spirit ch.22)
- "beer" → NOT ambiguous (always fermented beverage ch.22)
- "cement" → NOT ambiguous (always building material ch.25)
- "LED bulb for office" → NOT ambiguous (specific lighting product)
- "baby cotton onesie" → NOT ambiguous (specific baby apparel)
- "bluetooth speaker" → NOT ambiguous (specific electronics)
- "cow for meat" → NOT ambiguous (user specified "for meat")
- "live horses for racing" → NOT ambiguous (user specified "live" and "for racing")
- "horse meat" → NOT ambiguous (clearly horse meat)
- "chapstick lip gloss" → NOT ambiguous (brand + product type, both cosmetics ch.33)
- "Band-Aid bandages" → NOT ambiguous (brand + product type, both medical ch.30)
- "Nike running shoes" → NOT ambiguous (brand + product type, footwear ch.64)

Corrections example:
- "cotton tshrt mens" → product_name: "men's cotton t-shirt", corrections_made: "expanded 'tshrt' to 't-shirt'"

Too vague:
- "xyz123" → too_vague: true
- "thing" → too_vague: true
- "stuff for home" → too_vague: true

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
                    "product_type": parsed.get("product_type", ""),
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
                "product_type": parsed.get("product_type", ""),
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
        "product_type": "",
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