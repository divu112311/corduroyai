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
    relevant_keys = ["material", "usage", "gender", "breed", "age", "form", "processing"]
    attr_parts = []
    for k in relevant_keys:
        v = attrs.get(k, "")
        if v and str(v).strip() and str(v).strip().lower() not in ("", "empty", "n/a", "none", "not mentioned", "not applicable"):
            attr_parts.append(str(v).strip())

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
