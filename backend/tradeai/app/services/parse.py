from app.models import ParseRequest, ParseResponse

def parse(data: dict) -> dict:
    # Get fields from preprocess output
    cleaned_text = data.get("cleaned_text", "")
    product_name = data.get("product_name", "")
    gender = data.get("gender", "")
    material = data.get("material", "")
    breed = data.get("breed", "")
    age = data.get("age", "")
    usage = data.get("usage", "")
    form = data.get("form", "")
    processing = data.get("processing", "")
    user_id = data.get("user_id", "")

    # Use product_name if available, else cleaned_text
    product = product_name if product_name else cleaned_text if cleaned_text else "unknown_product"

    # Attributes dictionary
    attributes = {
        "raw_text": cleaned_text,
        "product_name": product_name,
        "gender": gender,
        "material": material,
        "breed": breed,
        "age": age,
        "usage": usage,
        "form": form,
        "processing": processing,
        "contains_digits": any(char.isdigit() for char in cleaned_text)
    }

    return {
        "product": product,
        "attributes": attributes,
        "user_id": user_id
    }