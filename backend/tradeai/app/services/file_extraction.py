"""
File Extraction Service - LLM-based smart column mapping and product data extraction.
Uses LLM to intelligently map non-standard column names to standard product fields
and extract structured product attributes from each row.
"""

import json
import re
from typing import List, Dict, Any, Optional

from app.services.llm_call import call_llm
from app.services.file_parser import get_headers, get_sample_rows


# Standard fields we expect for classification
STANDARD_FIELDS = [
    "product_name",
    "description",
    "materials",
    "country_of_origin",
    "quantity",
    "unit_value",
    "vendor",
    "category",
    "intended_use",
]

# Common synonyms for auto-detection before LLM fallback
COMMON_SYNONYMS = {
    "product_name": [
        "product name", "product", "item name", "item", "name", "sku name",
        "product title", "title", "goods", "commodity",
    ],
    "description": [
        "description", "desc", "product description", "item description",
        "details", "product details", "notes",
    ],
    "materials": [
        "materials", "material", "composition", "material composition",
        "fabric", "content", "made of", "components",
    ],
    "country_of_origin": [
        "country of origin", "origin", "country", "coo", "made in",
        "source country", "manufacturing country", "origin country",
    ],
    "quantity": [
        "quantity", "qty", "amount", "units", "count", "pcs", "pieces",
    ],
    "unit_value": [
        "unit value", "value", "price", "unit price", "cost", "unit cost",
        "fob value", "fob price", "declared value",
    ],
    "vendor": [
        "vendor", "supplier", "manufacturer", "factory", "seller",
        "exporter", "shipper",
    ],
    "category": [
        "category", "type", "product type", "classification", "class",
        "product category", "group",
    ],
    "intended_use": [
        "intended use", "use", "usage", "purpose", "end use",
        "application", "function",
    ],
}


def _normalize_header(h: str) -> str:
    """Normalize a column header: lowercase, replace separators with spaces, collapse whitespace."""
    normalized = h.lower().strip()
    normalized = re.sub(r'[_\-./]+', ' ', normalized)  # Replace _, -, ., / with spaces
    normalized = re.sub(r'\s+', ' ', normalized).strip()  # Collapse multiple spaces
    return normalized


def detect_column_mapping(headers: List[str]) -> Dict[str, str]:
    """
    Try to map column headers to standard fields using synonym matching.
    Returns a dict of {standard_field: original_column_name}.
    """
    mapping = {}
    normalized_headers = {h: _normalize_header(h) for h in headers}

    for standard_field, synonyms in COMMON_SYNONYMS.items():
        for header, normalized in normalized_headers.items():
            if normalized in synonyms:
                mapping[standard_field] = header
                break

    return mapping


def detect_and_map_columns(
    headers: List[str],
    sample_rows: List[Dict[str, Any]],
) -> Dict[str, str]:
    """
    Smart column mapping: first tries synonym matching, then falls back to LLM
    for non-standard column names.
    Returns a dict of {standard_field: original_column_name}.
    """
    # Step 1: Try synonym-based mapping
    mapping = detect_column_mapping(headers)

    # If we mapped at least product_name or description, we're good enough
    if "product_name" in mapping or "description" in mapping:
        return mapping

    # Step 2: Fall back to LLM for non-standard columns
    return _llm_column_mapping(headers, sample_rows)


def _llm_column_mapping(
    headers: List[str],
    sample_rows: List[Dict[str, Any]],
) -> Dict[str, str]:
    """Use LLM to intelligently map non-standard columns to standard fields."""
    prompt = f"""You are a data analyst. Given these spreadsheet column headers and sample data,
map each column to the most appropriate standard product field.

COLUMN HEADERS: {json.dumps(headers)}

SAMPLE DATA (first 3 rows):
{json.dumps(sample_rows, indent=2)}

STANDARD FIELDS to map to:
- product_name: The name or title of the product
- description: A description of the product
- materials: What the product is made of (fabric, metal, plastic, etc.)
- country_of_origin: Where the product was manufactured
- quantity: How many units
- unit_value: Price per unit
- vendor: Supplier/manufacturer name
- category: Product category or type
- intended_use: What the product is used for (purpose, application, end use)

Respond with ONLY a JSON object mapping standard field names to the original column header.
Only include fields where you're confident about the mapping.
Example: {{"product_name": "Item Name", "materials": "Composition", "country_of_origin": "COO"}}

If a column doesn't clearly map to any standard field, skip it.
Respond ONLY with JSON."""

    try:
        result = call_llm(
            provider="openai",
            model="gpt-4o-mini",
            prompt=prompt,
            temperature=0,
            max_tokens=256,
        )
        text = result.get("text", "")
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            mapping = json.loads(match.group())
            # Validate that mapped values actually exist in headers
            return {k: v for k, v in mapping.items() if v in headers}
    except Exception as e:
        print(f"LLM column mapping error: {e}")

    # Last resort: positional mapping (first col = product_name, second = description)
    fallback = {}
    if len(headers) >= 1:
        fallback["product_name"] = headers[0]
    if len(headers) >= 2:
        fallback["description"] = headers[1]
    return fallback


def extract_product_from_row(
    row: Dict[str, Any],
    column_mapping: Dict[str, str],
) -> Dict[str, Any]:
    """
    Extract structured product data from a single row using the column mapping.
    Returns a normalized product dict ready for classification.
    """
    product = {}

    for standard_field, original_column in column_mapping.items():
        value = row.get(original_column, "")
        if value and str(value).strip():
            product[standard_field] = str(value).strip()

    # Build a product description for classification if not explicit
    if "description" not in product and "product_name" in product:
        parts = [product["product_name"]]
        if "materials" in product:
            parts.append(f"made of {product['materials']}")
        if "country_of_origin" in product:
            parts.append(f"from {product['country_of_origin']}")
        product["description"] = ", ".join(parts)

    # Store the row number
    product["__row_number"] = row.get("__row_number", 0)

    return product


def extract_products_from_raw_text(raw_text: str) -> List[Dict[str, Any]]:
    """
    Use LLM to extract product data from unstructured text (e.g., PDF without tables).
    """
    prompt = f"""You are a trade compliance data extraction assistant.
Extract all product information from this text. For each product found, extract:
- product_name
- description
- materials (if mentioned)
- country_of_origin (if mentioned)
- quantity (if mentioned)
- unit_value (if mentioned)

TEXT:
{raw_text[:3000]}

Respond with ONLY a JSON array of product objects.
Example: [{{"product_name": "Cotton T-Shirt", "description": "Men's crew neck t-shirt", "materials": "100% cotton", "country_of_origin": "India"}}]

If no products can be extracted, respond with an empty array: []
Respond ONLY with JSON."""

    try:
        result = call_llm(
            provider="openai",
            model="gpt-4o-mini",
            prompt=prompt,
            temperature=0,
            max_tokens=1024,
        )
        text = result.get("text", "")
        match = re.search(r"\[.*\]", text, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as e:
        print(f"LLM text extraction error: {e}")

    return []


def extract_all_products(
    rows: List[Dict[str, Any]],
    file_name: str,
) -> Dict[str, Any]:
    """
    Main entry point: extract structured product data from parsed rows.
    Handles both tabular data (with column mapping) and raw text (PDF fallback).

    Returns a dict with:
      - "products": List of extracted product dicts
      - "metadata": {detected_columns, column_mapping, total_rows}
    """
    if not rows:
        return {"products": [], "metadata": {"detected_columns": [], "column_mapping": {}, "total_rows": 0}}

    # Check if rows contain raw text (PDF without tables)
    if "__raw_text" in rows[0]:
        products = []
        for row in rows:
            raw_text = row.get("__raw_text", "")
            if raw_text:
                extracted = extract_products_from_raw_text(raw_text)
                for i, p in enumerate(extracted):
                    p["__row_number"] = len(products) + i + 1
                    products.append(p)
        return {
            "products": products,
            "metadata": {
                "detected_columns": [],
                "column_mapping": {},
                "total_rows": len(rows),
            },
        }

    # Tabular data: detect column mapping, then extract
    headers = [k for k in rows[0].keys() if not k.startswith("__")]
    sample = [{k: v for k, v in r.items() if not k.startswith("__")} for r in rows[:3]]

    column_mapping = detect_and_map_columns(headers, sample)
    print(f"Column mapping for {file_name}: {column_mapping}")

    products = []
    for row in rows:
        product = extract_product_from_row(row, column_mapping)
        # Only include rows that have at least a product name or description
        if product.get("product_name") or product.get("description"):
            products.append(product)

    return {
        "products": products,
        "metadata": {
            "detected_columns": list(column_mapping.values()),
            "column_mapping": column_mapping,
            "total_rows": len(rows),
        },
    }
