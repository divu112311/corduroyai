from app.services.embeddings import embed_query
from app.services.embeddings import query_pinecone


def apply_rules(parsed: dict) -> dict:
    """
    Get top HTS candidates from Pinecone using the normalized product description.
    """
    print("APPLY_RULES INPUT:")
    #for key, value in parsed.items():
    #   print(f"{key}: {value}")
    # Step 1: normalized description
    
    # Build a clean embedding input — only include trade-relevant attributes
    product = parsed.get("product", "")
    attrs = parsed.get("attributes", {})
    # Note: "usage" is excluded — it rarely affects HTS chapter (e.g., "office" pulls furniture
    # for LED bulbs). Usage-based ambiguity is handled earlier by preprocess.
    relevant_keys = ["material", "gender", "breed", "age", "form", "processing"]
    attr_parts = []
    for k in relevant_keys:
        v = attrs.get(k, "")
        if v and str(v).strip() and str(v).strip().lower() not in ("", "empty", "n/a", "none", "not mentioned", "not applicable"):
            attr_parts.append(str(v).strip())

    # For textile/apparel products, add key context to the embedding:
    # - "apparel" or "clothing" to distinguish finished garments (ch.61/62) from raw fabrics (ch.52/55/60)
    # - form (knitted/woven) to distinguish ch.61 (knitted apparel) from ch.62 (woven apparel)
    form = attrs.get("form", "").strip().lower()
    product_lower = product.lower()

    # Detect if product is clearly apparel/clothing (not raw fabric)
    apparel_keywords = ["shirt", "blouse", "jeans", "pants", "trousers", "dress", "skirt",
                        "jacket", "coat", "sweater", "hoodie", "suit", "blazer", "vest",
                        "shorts", "socks", "stockings", "tights", "onesie", "romper",
                        "bodysuit", "underwear", "bra", "pajama", "robe", "scarf",
                        "glove", "hat", "cap", "uniform", "jersey", "leggings"]
    is_apparel = any(kw in product_lower for kw in apparel_keywords)

    if form in ("knitted", "woven", "crocheted", "knit"):
        if is_apparel:
            embedding_input = f"{form} clothing apparel {product}"
        else:
            embedding_input = f"{form} {product}"
    elif is_apparel:
        embedding_input = f"clothing apparel {product}"
    else:
        embedding_input = product

    if attr_parts:
        embedding_input += " " + " ".join(attr_parts)
    print("Apply Rules — embedding input:", embedding_input)
    
    vector = embed_query(embedding_input)

    print(f"APPLY_RULES: embedding vector length -> {len(vector)}")
    print(f"APPLY_RULES: embedding vector sample -> {vector[:10]}")  # show first 10 values

    # Step 3: query Pinecone
    matches = query_pinecone(vector)
    
    # Debug: print Pinecone matches
    print(f"APPLY_RULES: number of matches returned from Pinecone -> {len(matches)}")
    for i, m in enumerate(matches):
        print(f"Match {i+1}:")
        for k, v in m.items():
            print(f"  {k}: {v}")

    

    # Step 4: extract HTS and description from metadata
    # Step 4: extract HTS and description from metadata
    refs = []
    for m in matches:
        metadata = m.get("metadata", {})
        hts = m.get("id")  # HTS code is the vector ID
        description = metadata.get("description", "")
        chapter = metadata.get("chapter", "")
        score = m.get("score", 0)

        if hts:
            # Safely extract metadata fields, ensuring they are strings where expected
            refs.append({
              "hts": str(hts),
              "description": str(metadata.get("description", description)),
              "chapter": str(metadata.get("chapter", "")),
              "chapter_code": str(metadata.get("chapter_code", "")),
              "chapter_title": str(metadata.get("chapter_title", "")),
              "section_code": str(metadata.get("section_code", "")),
              "section_title": str(metadata.get("section_title", "")),
              # Internal-only metadata cache (not sent to frontend)
              "_metadata": metadata,
              "score": float(m.get("score", 0)),
            })
    # --- DEBUG: print refs before returning ---
    print("DEBUG: refs / matched_rules to return:")
    for i, r in enumerate(refs):
        print(f"  Match {i+1}: {r}")

    return {
        "normalized":embedding_input ,
        "attributes": parsed.get("attributes", {}),
        "matched_rules": refs,
    }
