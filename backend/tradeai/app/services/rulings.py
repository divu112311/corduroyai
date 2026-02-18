from app.services.cbp_rulings import fetch_cbp_rulings_for_rules
from app.services.cbp_rulings import search_cbp_rulings
from app.services.llm_call import call_llm
from app.services.rule_engine import RuleEngine
from app.services.supabase import supabase as supabase_client
from concurrent.futures import ThreadPoolExecutor, as_completed
from google.cloud import storage
import json
import os
import re

METADATA_LOOKUP = {}

def load_metadata_lookup():
    global METADATA_LOOKUP
    if METADATA_LOOKUP:
        return METADATA_LOOKUP
    
    try:
        # Try local file first
        if os.path.exists("hts_metadata_lookup.json"):
            with open("hts_metadata_lookup.json", "r") as f:
                METADATA_LOOKUP = json.load(f)
        else:
            # Load from GCS
            client = storage.Client()
            bucket = client.bucket("corduroyai")
            blob = bucket.blob("hts_metadata_lookup.json")
            content = blob.download_as_text()
            METADATA_LOOKUP = json.loads(content)
        print(f"Loaded metadata for {len(METADATA_LOOKUP)} HTS codes")
    except Exception as e:
        print(f"Failed to load metadata lookup: {e}")
    
    return METADATA_LOOKUP


def generate_rationale(product: str, attributes: dict, matched_rules: list) -> list:
    """
    Use LLM to select top 3 HTS codes and provide rationales.
    """
    if not matched_rules:
        return matched_rules
    
    # Build context for LLM
    rules_summary = []
    for i, rule in enumerate(matched_rules):
        line = f"{i+1}. HTS {rule.get('hts')} - {rule.get('description')} (Score: {rule.get('score', 0):.2f})"
        rv = rule.get("rule_verification")
        if rv:
            line += f"\n   Rule Status: {rv.get('status', 'unknown')}"
            if rv.get("checks_passed"):
                line += f" | Passed: {', '.join(rv['checks_passed'][:3])}"
            if rv.get("checks_failed"):
                line += f" | Failed: {', '.join(rv['checks_failed'][:3])}"
            if rv.get("gri_applied"):
                line += f" | GRI: {', '.join(rv['gri_applied'])}"
            if rv.get("reasoning"):
                line += f"\n   Rule Reasoning: {rv['reasoning']}"
        rules_summary.append(line)
    
    prompt = f"""You are a trade compliance expert.

Product: {product}
Attributes: {json.dumps(attributes)}

Top HTS code matches:
{chr(10).join(rules_summary)}

Select the BEST 3 HTS codes from the list and explain in 1-2 sentences:
1. Why it matches the product
2. What makes the top result the best match
3. Provide a confidence adjustment (0.00 to 0.15) for each match.
   This adjustment will be added to the Pinecone score (never decrease it).

IMPORTANT:
- Use the HTS codes EXACTLY as provided below.
- Do NOT shorten, truncate, normalize, reformat, change the HTS codes.
- Preserve all dots and digits.
- The HTS value in your response MUST exactly match one of the HTS codes listed.


Respond in this JSON format as the example provided:
{{
    "top_matches": [
        {{"hts": "0102.31.00.10", "rationale": "explanation for why this matches", "confidence_adjustment": 0.08}},
        {{"hts": "0102.29.40.54", "rationale": "explanation for why this matches", "confidence_adjustment": 0.05}},
        {{"hts": "0102.11.00.00", "rationale": "explanation for why this matches", "confidence_adjustment": 0.03}}
    ],
    "best_match_reason": "why the top result is the best match"
}}

Respond ONLY with JSON.
"""
    
    try:
        result = call_llm(
            provider="openai",
            model="gpt-4o",
            prompt=prompt,
            temperature=0,
            max_tokens=1500,
        )
        
        print("Result from LLM:", result)
        text = result['text']

        # Remove ```json ... ``` or ``` ... ``` markers
        cleaned_text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.DOTALL).strip()
        parsed = json.loads(cleaned_text)
        
        #parsed = result
        
        
        top_matches = parsed.get("top_matches", [])
        rationales = {
            r.get("hts"): r.get("rationale")
            for r in top_matches
            if r.get("hts")
        }
        adjustments = {
            r.get("hts"): r.get("confidence_adjustment", 0)
            for r in top_matches
            if r.get("hts")
        }

        print("Rationales:", rationales)

        # Keep only the top 3 matches in the order returned by the LLM
        order = {r.get("hts"): i for i, r in enumerate(top_matches)}
        filtered = [r for r in matched_rules if r.get("hts") in order]
        filtered.sort(key=lambda r: order.get(r.get("hts"), 999))

        for rule in filtered:
            hts = rule.get("hts")
            rule["rationale"] = rationales.get(
                hts, "Matched via vector similarity"
            )

        # set once, outside loop
        if filtered:
            filtered[0]["best_match_reason"] = parsed.get("best_match_reason", "")
        # Adjust confidence: prefer rule_confidence if available, else use Pinecone + adjustment
        for rule in filtered:
            if rule.get("rule_confidence") and rule["rule_confidence"] > 0:
                rule["confidence"] = float(rule["rule_confidence"])
                rule["similarity_score"] = float(rule.get("score", 0))
            else:
                adj = adjustments.get(rule.get("hts"), 0)
                try:
                    adj = float(adj)
                except Exception:
                    adj = 0
                adj = max(0.0, min(0.15, adj))
                pinecone_conf = float(rule.get("score", 0))
                rule["confidence"] = min(1.0, max(pinecone_conf, pinecone_conf + adj))
                rule["similarity_score"] = pinecone_conf

        return filtered[:3]
    
    except Exception as e:
        print(f"Rationale generation error: {e}")
        for rule in matched_rules[:3]:
            rule["rationale"] = "Matched via vector similarity (Pinecone)"
            # If rule_confidence was set by the rule engine, use it instead of raw Pinecone score
            if rule.get("rule_confidence") and rule["rule_confidence"] > 0:
                rule["confidence"] = float(rule["rule_confidence"])
                rule["similarity_score"] = float(rule.get("score", 0))

    return matched_rules[:3]




def generate_ruling(data: dict) -> dict:
    matched_rules = data.get("matched_rules", [])
    product = data.get("product")
    attributes = data.get("attributes", {})

    if not matched_rules:
        return {
            "type": "clarify",
            "clarifications": [
                "What is the material of the product?",
                "What is the intended use?",
                "Where was it manufactured?"
            ],
        }

    # Load metadata lookup
    # metadata_lookup = load_metadata_lookup()
    
    for rule in matched_rules:
        # --- Normalize HTS ---
        hts = rule.get("hts")
        if hts:
            hts_str = str(hts)
            if hts_str.isdigit() and len(hts_str) == 7:
                hts_str = "0" + hts_str
            rule["hts"] = hts_str
        
        # --- Enrich with full metadata ---
        # meta = metadata_lookup.get(hts_str, {})
        # rule["description"] = meta.get("description", rule.get("description", ""))
        # rule["chapter_code"] = meta.get("chapter_code", "")
        # rule["chapter_title"] = meta.get("chapter_title", "")
        # rule["section_code"] = meta.get("section_code", "")
        # rule["section_title"] = meta.get("section_title", "")
        # rule["general_rate"] = meta.get("general_rate", "")
        # rule["special_rate"] = meta.get("special_rate", "")
        # rule["units"] = meta.get("units", [])
        # rule["indent"] = meta.get("indent", "")

        rule["confidence"] = float(rule.get("score", 0))
        rule["rationale"] = "Matched via vector similarity (Pinecone)"

        # CBP rulings are fetched in parallel after normalization
        rule["cbp_rulings"] = []

    # ── Rule Engine Verification ──
    # Enriches candidates with GRI analysis. Can also trigger clarification
    # when candidates span genuinely different categories (e.g., "cow" maps
    # to live animal, beef, and cowhide — different chapters). This is
    # different from preprocess clarification which catches bad/nonsensical input.
    classification_trace = ""
    try:
        rule_engine = RuleEngine(supabase_client)
        verification = rule_engine.verify_candidates(attributes, matched_rules)
        classification_trace = verification.get("trace", "")

        # Check if candidates span multiple chapters — this means the product
        # is clear but the HTS classification is genuinely ambiguous
        chapters_seen = set()
        for r in matched_rules[:5]:
            hts = str(r.get("hts", ""))
            if len(hts) >= 2:
                chapters_seen.add(hts[:2].replace(".", ""))
        candidates_span_chapters = len(chapters_seen) >= 2

        # Only ask for clarification when:
        # 1. The rule engine flagged it as not confident, AND
        # 2. The top candidates span 2+ different chapters, AND
        # 3. The user hasn't already clarified (no double-asking)
        # This means the product itself is ambiguous in classification terms
        # (e.g., "cow" could be chapter 01, 02, or 41)
        is_clarification = data.get("is_clarification", False)
        rule_questions = verification.get("questions", [])
        if (not verification.get("confident")
                and candidates_span_chapters
                and rule_questions
                and not is_clarification):
            # Normalize questions for frontend — extract question text
            clarification_list = []
            for q in rule_questions:
                if isinstance(q, dict):
                    clarification_list.append(q)
                elif isinstance(q, str):
                    clarification_list.append({"question": q, "options": []})
            return {
                "type": "clarify",
                "clarifications": clarification_list,
                "partial_matches": [
                    {"hts": r.get("hts"), "description": r.get("description"), "score": r.get("score", 0)}
                    for r in matched_rules[:5]
                ],
                "classification_trace": classification_trace,
            }

        # Merge rule verification data into matched_rules (always happens)
        verified_map = {
            v.get("hts"): v for v in verification.get("verified_candidates", [])
        }
        for rule in matched_rules:
            hts = rule.get("hts")
            if hts in verified_map:
                v = verified_map[hts]
                rule["rule_verification"] = {
                    "status": v.get("status", "unknown"),
                    "checks_passed": v.get("checks_passed", []),
                    "checks_failed": v.get("checks_failed", []),
                    "missing_info": v.get("missing_info", []),
                    "reasoning": v.get("reasoning", ""),
                    "gri_applied": v.get("gri_applied", []),
                    "applicable_notes": v.get("applicable_notes", []),
                }
                rule["rule_confidence"] = verification.get("rule_confidence", 0)

        # Remove candidates explicitly excluded by chapter notes
        matched_rules = [
            r for r in matched_rules
            if verified_map.get(r.get("hts"), {}).get("status") != "excluded"
        ]

    except Exception as e:
        print(f"Rule engine error (non-fatal): {e}")
        classification_trace = f"Rule verification unavailable: {e}"

    def _fetch_cbp_rulings_for_rule(rule: dict) -> list:
        try:
            raw_desc = rule.get("description", "")
            # Use product name if available; otherwise a very short description (2 words)
            base_text = (product or "").strip() or raw_desc
            short_words = base_text.split()[:2]
            # Add one usage word if available
            usage_text = (attributes.get("usage", "") if isinstance(attributes, dict) else "").strip()
            usage_word = usage_text.split()[:1]
            if usage_word:
                short_words = short_words + usage_word
            short_text = " ".join(short_words).strip()
            clean_short = re.sub(r'[^a-zA-Z0-9\s]', '', short_text)

            rulings = search_cbp_rulings(
                query=clean_short,
                max_pages=1,
                page_size=5
            )
            return rulings[:5]
        except Exception as e:
            print(f"Failed to fetch CBP rulings for HTS {rule.get('hts')}: {e}")
            return []

    # Fetch CBP rulings in parallel
    if matched_rules:
        max_workers = min(4, len(matched_rules))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_map = {executor.submit(_fetch_cbp_rulings_for_rule, rule): rule for rule in matched_rules}
            for future in as_completed(future_map):
                rule = future_map[future]
                try:
                    rule["cbp_rulings"] = future.result()
                except Exception as e:
                    print(f"CBP rulings future error for HTS {rule.get('hts')}: {e}")
                    rule["cbp_rulings"] = []

    matched_rules = generate_rationale(product, attributes, matched_rules)
    print("FINAL:", json.dumps(matched_rules))
    # Remove internal-only metadata before returning to frontend
    for rule in matched_rules:
        rule.pop("_metadata", None)
    return {
        "type": "answer",
        "product": product,
        "attributes": attributes,
        "matched_rules": matched_rules,
        "classification_trace": classification_trace,
    }
