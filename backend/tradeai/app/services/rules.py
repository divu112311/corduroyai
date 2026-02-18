from app.services.embeddings import embed_query
from app.services.embeddings import query_pinecone


# Raw material chapters → their finished product counterpart chapters.
# When Pinecone results are all raw material chapters but the product is a finished article,
# we do a supplemental query and merge results from the finished product chapters.
RAW_TO_FINISHED = {
    # Textiles: raw fibers/fabrics → apparel and home textiles
    frozenset({"50", "51", "52", "53", "54", "55", "56", "58", "59", "60"}): frozenset({"61", "62", "63"}),
    # Leather: raw hides/skins → leather articles, travel goods
    frozenset({"41"}): frozenset({"42", "43"}),
    # Wood: raw timber/lumber → furniture, basketware, wood articles
    frozenset({"44"}): frozenset({"94", "46"}),
    # Iron/Steel: raw iron/steel → articles, tools, cutlery
    frozenset({"72"}): frozenset({"73", "82", "83"}),
}


def apply_rules(parsed: dict) -> dict:
    """
    Get top HTS candidates from Pinecone using the normalized product description.
    Uses structured attributes from preprocess (material, form, processing, product_type)
    to intelligently build embeddings — no hardcoded keyword lists.
    """
    print("APPLY_RULES INPUT:")

    # Step 1: Extract product and attributes
    product = parsed.get("product", "")
    attrs = parsed.get("attributes", {})
    product_lower = product.lower()

    # Note: "usage" is excluded — it rarely affects HTS chapter (e.g., "office" pulls furniture
    # for LED bulbs). Usage-based ambiguity is handled earlier by preprocess.
    relevant_keys = ["material", "gender", "breed", "age", "form", "processing"]
    attr_parts = []
    for k in relevant_keys:
        v = attrs.get(k, "")
        if v and str(v).strip() and str(v).strip().lower() not in ("", "empty", "n/a", "none", "not mentioned", "not applicable"):
            attr_parts.append(str(v).strip())

    # Step 2: Smart embedding construction
    # Use preprocess-extracted attributes to determine if product is a finished article
    # vs raw material — no keyword lists needed.
    material = attrs.get("material", "").strip().lower()
    form = attrs.get("form", "").strip().lower()
    processing = attrs.get("processing", "").strip().lower()
    product_type = attrs.get("product_type", "").strip().lower()

    # Is this explicitly raw/unprocessed?
    is_raw = processing in ("raw", "unprocessed", "crude", "rough", "unwrought")

    # Determine if this is a finished product using multiple signals:
    # 1. processing field explicitly says finished
    is_finished_by_processing = processing in (
        "finished", "assembled", "manufactured", "processed",
        "sewn", "molded", "fabricated", "constructed"
    )
    # 2. form indicates a product form (not raw material)
    has_product_form = form in (
        "knitted", "woven", "crocheted", "knit", "molded",
        "cast", "forged", "stamped", "assembled", "sewn"
    )
    # 3. product_type from preprocess LLM explicitly says it's an article
    raw_type_words = {"raw material", "fabric", "fiber", "hide", "ore", "lumber", "timber"}
    is_article_type = bool(product_type) and product_type not in raw_type_words
    # 4. product name contains more than just the material word
    #    e.g., material="leather", product="leather wallet" → "wallet" is beyond material
    material_words = set(material.split()) if material else set()
    product_words = set(product_lower.split())
    filler_words = {"for", "of", "the", "a", "an", "in", "with", "and", "de", "para", "en"}
    has_article_beyond_material = bool(product_words - material_words - filler_words) if material else False

    is_finished_product = not is_raw and (
        is_finished_by_processing or has_product_form or is_article_type
        or (material and has_article_beyond_material)
    )

    # Build embedding input
    if is_finished_product:
        if form in ("knitted", "crocheted", "knit"):
            embedding_input = f"knitted article {product}"
        elif form == "woven":
            embedding_input = f"woven article {product}"
        else:
            embedding_input = f"finished article {product}"
    else:
        embedding_input = product

    if attr_parts:
        embedding_input += " " + " ".join(attr_parts)

    print(f"Apply Rules — embedding input: {embedding_input}")
    print(f"  is_finished_product={is_finished_product}, is_raw={is_raw}, product_type='{product_type}'")

    vector = embed_query(embedding_input)
    print(f"APPLY_RULES: embedding vector length -> {len(vector)}")

    # Step 3: query Pinecone
    matches = query_pinecone(vector)

    # Step 3b: Generic supplemental query
    # If product is a finished article but Pinecone only returned raw material chapters,
    # do a second query to pull in finished product chapter candidates.
    # This is category-agnostic — works for leather, textiles, wood, metal, etc.
    if is_finished_product and matches:
        result_chapters = set()
        for m in matches[:5]:
            hts = str(m.get("id", ""))
            if len(hts) >= 2:
                result_chapters.add(hts[:2].replace(".", ""))

        for raw_chapters, finished_chapters in RAW_TO_FINISHED.items():
            # Check if all top results are in raw material chapters
            if result_chapters and result_chapters.issubset(raw_chapters):
                # And none are already in finished product chapters
                if not (result_chapters & finished_chapters):
                    print(f"APPLY_RULES: Finished product but results are all raw material chapters {result_chapters} — supplemental query for {finished_chapters}")
                    supplemental_query = f"finished article product {product}"
                    supplemental_vector = embed_query(supplemental_query)
                    supplemental_matches = query_pinecone(supplemental_vector)
                    # Merge: keep original matches but append new finished product chapter results
                    seen_ids = {m.get("id") for m in matches}
                    for sm in supplemental_matches:
                        hts = str(sm.get("id", ""))
                        ch = hts[:2].replace(".", "") if len(hts) >= 2 else ""
                        if sm.get("id") not in seen_ids and ch in finished_chapters:
                            matches.append(sm)
                            seen_ids.add(sm.get("id"))
                    print(f"APPLY_RULES: After supplemental query, total matches: {len(matches)}")
                    break  # Only one supplemental query per request

    # Debug: print Pinecone matches
    print(f"APPLY_RULES: number of matches returned from Pinecone -> {len(matches)}")
    for i, m in enumerate(matches):
        print(f"Match {i+1}:")
        for k, v in m.items():
            print(f"  {k}: {v}")

    # Step 4: extract HTS and description from metadata
    refs = []
    for m in matches:
        metadata = m.get("metadata", {})
        hts = m.get("id")  # HTS code is the vector ID
        description = metadata.get("description", "")
        chapter = metadata.get("chapter", "")
        score = m.get("score", 0)

        if hts:
            refs.append({
              "hts": str(hts),
              "description": str(metadata.get("description", description)),
              "chapter": str(metadata.get("chapter", "")),
              "chapter_code": str(metadata.get("chapter_code", "")),
              "chapter_title": str(metadata.get("chapter_title", "")),
              "section_code": str(metadata.get("section_code", "")),
              "section_title": str(metadata.get("section_title", "")),
              "_metadata": metadata,
              "score": float(m.get("score", 0)),
            })

    # Debug: print refs before returning
    print("DEBUG: refs / matched_rules to return:")
    for i, r in enumerate(refs):
        print(f"  Match {i+1}: {r}")

    return {
        "normalized": embedding_input,
        "attributes": parsed.get("attributes", {}),
        "matched_rules": refs,
    }
