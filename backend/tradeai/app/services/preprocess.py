from app.models import PreprocessRequest, PreprocessResponse
from app.services.llm_call import call_llm
import json
import re

def preprocess(data: PreprocessRequest) -> PreprocessResponse:
    text = data.product_description
    
    prompt = f"""You are a trade compliance assistant.

Given this raw product input, please:
1. Fix any spelling and grammatical errors
2. Extract the product name
3. Extract the product description  
4. Extract any attributes mentioned (gender, material, size, color, age, breed, etc.)
5. Extract the intended usage (if mentioned)

Raw input: {text}

Respond in this exact JSON format:
{{
    "product_name": "extracted product name",
    "product_description": "cleaned and normalized description",
    "gender": "male/female/unisex or empty if not applicable",
    "material": "material type or empty if not mentioned",
    "breed": "breed type or empty if not applicable",
    "age": "age or age group or empty if not mentioned",
    "usage": "intended usage or empty if not mentioned"
}}

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
            return {
                "cleaned_text": parsed.get("product_description", text.strip()),
                "product_name": parsed.get("product_name", ""),
                "gender": parsed.get("gender", ""),
                "material": parsed.get("material", ""),
                "breed": parsed.get("breed", ""),
                "age": parsed.get("age", ""),
                "usage": parsed.get("usage", ""),
                "user_id": data.user_id or ""
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
        "user_id": data.user_id or ""
    }