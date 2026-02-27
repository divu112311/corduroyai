"""
compare_v2_v5.py — Compare v2 vs v5 embedding quality

Embeds 30 product queries, queries BOTH Pinecone indexes, uses GPT-4o-mini
to pick the best HTS code from each, and compares results.

Cost estimate: ~$0.03 total (30 embeddings + 60 GPT-4o-mini calls)

Run on VM:
  1. Upload: gcloud storage cp compare_v2_v5.py gs://corduroyai/
  2. On VM:  gcloud storage cp gs://corduroyai/compare_v2_v5.py .
  3. On VM:  python3 compare_v2_v5.py

Run locally (Windows):
  1. Set env vars in .env or export them
  2. py compare_v2_v5.py
"""

import json
import os
import subprocess
import sys
import time
import requests

# ============ CONFIG ============
OLD_HOST = "https://hts-embeddings-wsprb2o.svc.aped-4627-b74a.pinecone.io"
OLD_NAMESPACE = "hts-embeddings"

NEW_NAMESPACE = "hts-v5"

EMBED_MODEL = "text-embedding-3-small"
LLM_MODEL = "gpt-4o-mini"  # cheap — we're comparing embeddings, not LLM quality

GCP_PROJECT = "project-1fe125c4-7788-4a50-8cf"

# ============ TEST CASES ============
# (query, expected_chapter_2digit, expected_hts_prefix, description_of_expected)
TEST_CASES = [
    # Chapter 01-05: Live animals, meat, fish
    ("live breeding horse", "01", "0101.21", "Purebred breeding horses"),
    ("frozen shrimp", "03", "0306", "Frozen crustaceans"),
    ("fresh salmon fillet", "03", "0304", "Fresh fish fillets"),
    # Chapter 06-10: Plants, vegetables, cereals
    ("fresh cut roses", "06", "0603", "Cut flowers"),
    ("roasted coffee beans", "09", "0901.2", "Roasted coffee"),
    ("white rice", "10", "1006", "Rice"),
    # Chapter 11-15: Milling, fats, oils
    ("olive oil", "15", "1509", "Olive oil"),
    # Chapter 16-24: Food preparations, beverages, tobacco
    ("canned tuna", "16", "1604", "Prepared fish"),
    ("dog food", "23", "2309", "Pet food"),
    ("cigarettes", "24", "2402", "Cigarettes"),
    # Chapter 25-38: Minerals, chemicals
    ("table salt", "25", "2501", "Salt"),
    ("aspirin tablets", "30", "3004", "Medicaments"),
    # Chapter 39-40: Plastics, rubber
    ("plastic water bottle", "39", "3923", "Plastic containers"),
    ("car tires", "40", "4011", "Pneumatic tires"),
    # Chapter 44-49: Wood, paper
    ("plywood sheets", "44", "4412", "Plywood"),
    ("wallpaper", "48", "4814", "Wallpaper"),
    # Chapter 50-63: Textiles
    ("cotton t-shirt", "61", "6109", "Cotton knitted t-shirts"),
    ("silk scarf", "62", "6214", "Silk scarves"),
    ("cotton bed sheets", "63", "6302", "Cotton bed linen"),
    # Chapter 64-67: Footwear
    ("running shoes rubber sole", "64", "6404", "Sports footwear"),
    # Chapter 68-71: Stone, ceramics, glass, jewelry
    ("ceramic dinner plates", "69", "6912", "Ceramic tableware"),
    ("diamond engagement ring gold", "71", "7113", "Gold jewelry with gems"),
    # Chapter 72-83: Metals
    ("stainless steel pipe", "73", "7306", "Steel tubes/pipes"),
    ("aluminum beverage cans", "76", "7612", "Aluminum containers"),
    # Chapter 84-85: Machinery, electronics
    ("laptop computer", "84", "8471", "Portable computers"),
    ("electric motor 5kw", "85", "8501", "Electric motors"),
    ("solar panel photovoltaic", "85", "8541", "Photovoltaic cells"),
    # Chapter 86-89: Vehicles
    ("bicycle", "87", "8712", "Bicycles"),
    # Chapter 90-97: Instruments, furniture, misc
    ("wooden dining table", "94", "9403", "Wooden furniture"),
    ("fishing rod carbon fiber", "95", "9507", "Fishing rods"),
]


# ============ API KEY LOADING ============
def get_secret(secret_name):
    """Load from env first, then GCP Secret Manager."""
    val = os.getenv(secret_name, "")
    if val:
        return val
    try:
        cmd = f'gcloud secrets versions access latest --secret="{secret_name}" --project="{GCP_PROJECT}"'
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return ""


# ============ EMBED ============
def embed_query(text, api_key):
    """Get embedding vector from OpenAI."""
    resp = requests.post(
        "https://api.openai.com/v1/embeddings",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"model": EMBED_MODEL, "input": text},
        timeout=30,
    )
    if resp.status_code == 200:
        return resp.json()["data"][0]["embedding"]
    raise RuntimeError(f"Embedding failed: {resp.status_code} {resp.text[:200]}")


# ============ PINECONE QUERY ============
def query_pinecone(vector, host, namespace, api_key, top_k=10):
    """Query a Pinecone index and return matches."""
    url = f"{host}/query"
    payload = {
        "vector": vector,
        "topK": top_k,
        "namespace": namespace,
        "includeMetadata": True,
    }
    try:
        resp = requests.post(
            url,
            headers={"Api-Key": api_key, "Content-Type": "application/json"},
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json().get("matches", [])
    except Exception as e:
        print(f"  Pinecone error ({host[:40]}...): {e}")
        return []


# ============ LLM PICK BEST ============
def llm_pick_best(query, matches, api_key):
    """Use GPT-4o-mini to pick the best HTS code from candidates."""
    if not matches:
        return {"hts": "NO_MATCHES", "confidence": 0, "rationale": "No candidates returned"}

    candidates = []
    for i, m in enumerate(matches[:10]):
        meta = m.get("metadata", {})
        score = m.get("score", 0)
        desc = meta.get("description", "")
        chapter = meta.get("chapter", "")
        hts = m.get("id", "")
        candidates.append(f"{i+1}. HTS {hts} — {desc} (ch.{chapter}, score={score:.3f})")

    prompt = f"""You are a trade classification expert. Pick the BEST HTS code for this product.

Product: {query}

Candidates:
{chr(10).join(candidates)}

Reply with ONLY this JSON (no markdown):
{{"hts": "the best HTS code exactly as listed", "rationale": "1 sentence why"}}
"""
    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": LLM_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0,
                "max_tokens": 150,
            },
            timeout=30,
        )
        if resp.status_code != 200:
            return {"hts": matches[0].get("id", "?"), "confidence": matches[0].get("score", 0),
                    "rationale": f"LLM failed ({resp.status_code}), using top Pinecone match"}

        text = resp.json()["choices"][0]["message"]["content"]
        text = text.strip().strip("`").strip()
        if text.startswith("json"):
            text = text[4:].strip()
        parsed = json.loads(text)
        # Find the score for the picked HTS
        picked_hts = parsed.get("hts", "")
        score = 0
        for m in matches:
            if m.get("id") == picked_hts:
                score = m.get("score", 0)
                break
        return {"hts": picked_hts, "confidence": score, "rationale": parsed.get("rationale", "")}

    except Exception as e:
        # Fallback: just use top Pinecone match
        return {"hts": matches[0].get("id", "?"), "confidence": matches[0].get("score", 0),
                "rationale": f"LLM parse error, using top match"}


# ============ MAIN ============
def main():
    start_time = time.time()
    print("=" * 70)
    print("  EMBEDDING COMPARISON: v2 (5,800 codes) vs v5 (26,630 codes)")
    print("=" * 70)

    # Load keys
    openai_key = get_secret("OPENAI_API_KEY")
    pinecone_key = get_secret("PINECONE_API_KEY")
    new_host = get_secret("PINECONE_HOST_V5")

    if not openai_key:
        print("ERROR: OPENAI_API_KEY not found"); return
    if not pinecone_key:
        print("ERROR: PINECONE_API_KEY not found"); return
    if not new_host:
        # Try alternate name
        new_host = get_secret("PINECONE_HOST")
        if not new_host:
            print("ERROR: PINECONE_HOST_V5 not found"); return
        print(f"  WARNING: Using PINECONE_HOST as new host (no PINECONE_HOST_V5 found)")

    print(f"  Old index host: {OLD_HOST[:50]}...")
    print(f"  New index host: {new_host[:50]}...")
    print(f"  Old namespace:  {OLD_NAMESPACE}")
    print(f"  New namespace:  {NEW_NAMESPACE}")
    print(f"  LLM model:      {LLM_MODEL}")
    print(f"  Test cases:     {len(TEST_CASES)}")
    print()

    # Quick connectivity test
    print("Testing connectivity...", flush=True)
    test_vec = embed_query("test", openai_key)
    old_test = query_pinecone(test_vec, OLD_HOST, OLD_NAMESPACE, pinecone_key, top_k=1)
    new_test = query_pinecone(test_vec, new_host, NEW_NAMESPACE, pinecone_key, top_k=1)
    print(f"  Old index: {'OK' if old_test else 'EMPTY/ERROR'} ({len(old_test)} results)")
    print(f"  New index: {'OK' if new_test else 'EMPTY/ERROR'} ({len(new_test)} results)")
    print()

    # Run all test cases
    results = []
    total_embed_tokens = 0

    for i, (query, exp_ch, exp_hts, exp_desc) in enumerate(TEST_CASES):
        print(f"[{i+1}/{len(TEST_CASES)}] {query}", flush=True)

        # 1. Embed once
        vector = embed_query(query, openai_key)
        total_embed_tokens += len(query.split()) / 0.75  # rough estimate

        # 2. Query both indexes with SAME vector
        old_matches = query_pinecone(vector, OLD_HOST, OLD_NAMESPACE, pinecone_key)
        new_matches = query_pinecone(vector, new_host, NEW_NAMESPACE, pinecone_key)

        # 3. LLM picks best from each
        old_pick = llm_pick_best(query, old_matches, openai_key)
        new_pick = llm_pick_best(query, new_matches, openai_key)

        # 4. Check correctness (chapter-level)
        old_hts = str(old_pick["hts"])
        new_hts = str(new_pick["hts"])

        old_ch = old_hts[:2].replace(".", "").zfill(2) if old_hts != "NO_MATCHES" else "--"
        new_ch = new_hts[:2].replace(".", "").zfill(2) if new_hts != "NO_MATCHES" else "--"

        old_ch_correct = old_ch == exp_ch
        new_ch_correct = new_ch == exp_ch

        # Check if expected HTS prefix appears in top matches
        old_prefix_hit = any(str(m.get("id", "")).startswith(exp_hts) for m in old_matches)
        new_prefix_hit = any(str(m.get("id", "")).startswith(exp_hts) for m in new_matches)

        old_top_score = old_matches[0]["score"] if old_matches else 0
        new_top_score = new_matches[0]["score"] if new_matches else 0

        result = {
            "query": query,
            "expected_ch": exp_ch,
            "expected_hts": exp_hts,
            "old_pick": old_hts,
            "old_score": old_pick["confidence"],
            "old_ch_correct": old_ch_correct,
            "old_prefix_hit": old_prefix_hit,
            "old_top_score": old_top_score,
            "old_n_matches": len(old_matches),
            "new_pick": new_hts,
            "new_score": new_pick["confidence"],
            "new_ch_correct": new_ch_correct,
            "new_prefix_hit": new_prefix_hit,
            "new_top_score": new_top_score,
            "new_n_matches": len(new_matches),
            "old_rationale": old_pick["rationale"],
            "new_rationale": new_pick["rationale"],
        }
        results.append(result)

        # Status indicator
        old_icon = "✓" if old_ch_correct else "✗"
        new_icon = "✓" if new_ch_correct else "✗"
        print(f"  v2: {old_icon} {old_hts[:13]:13s} (score={old_top_score:.3f})  |  "
              f"v5: {new_icon} {new_hts[:13]:13s} (score={new_top_score:.3f})")

        # Small delay to avoid rate limits
        time.sleep(0.3)

    # ============ REPORT ============
    elapsed = time.time() - start_time

    print("\n" + "=" * 70)
    print("  RESULTS COMPARISON")
    print("=" * 70)

    # Header
    print(f"\n{'Query':<30} {'Exp Ch':<7} {'v2 Pick':<15} {'v2':<4} {'v5 Pick':<15} {'v5':<4} {'Winner'}")
    print("-" * 95)

    old_correct = 0
    new_correct = 0
    both_correct = 0
    v5_improved = 0
    v5_regressed = 0

    for r in results:
        old_mark = "✓" if r["old_ch_correct"] else "✗"
        new_mark = "✓" if r["new_ch_correct"] else "✗"

        if r["old_ch_correct"]:
            old_correct += 1
        if r["new_ch_correct"]:
            new_correct += 1
        if r["old_ch_correct"] and r["new_ch_correct"]:
            both_correct += 1

        if r["new_ch_correct"] and not r["old_ch_correct"]:
            winner = "v5 ▲"
            v5_improved += 1
        elif r["old_ch_correct"] and not r["new_ch_correct"]:
            winner = "v2 ▼"
            v5_regressed += 1
        elif r["old_ch_correct"] and r["new_ch_correct"]:
            winner = "tie"
        else:
            winner = "both ✗"

        print(f"{r['query']:<30} ch.{r['expected_ch']:<4} {r['old_pick'][:14]:<15} {old_mark:<4} "
              f"{r['new_pick'][:14]:<15} {new_mark:<4} {winner}")

    # Summary stats
    total = len(results)
    print("\n" + "=" * 70)
    print("  SUMMARY")
    print("=" * 70)
    print(f"  Total test queries:     {total}")
    print(f"  v2 chapter accuracy:    {old_correct}/{total} ({100*old_correct/total:.0f}%)")
    print(f"  v5 chapter accuracy:    {new_correct}/{total} ({100*new_correct/total:.0f}%)")
    print(f"  Both correct:           {both_correct}/{total}")
    print(f"  v5 improved (v2✗→v5✓): {v5_improved}")
    print(f"  v5 regressed (v2✓→v5✗):{v5_regressed}")
    print(f"  Time:                   {elapsed:.0f}s")
    print(f"  Est. cost:              ~${(total_embed_tokens * 0.02/1e6) + (total * 2 * 0.15 * 800/1e6) + (total * 2 * 0.6 * 150/1e6):.3f}")
    print()

    # Top score comparison
    old_avg_score = sum(r["old_top_score"] for r in results) / total
    new_avg_score = sum(r["new_top_score"] for r in results) / total
    print(f"  v2 avg top Pinecone score: {old_avg_score:.4f}")
    print(f"  v5 avg top Pinecone score: {new_avg_score:.4f}")
    print()

    # Detailed failures
    v5_failures = [r for r in results if not r["new_ch_correct"]]
    if v5_failures:
        print("  v5 FAILURES (wrong chapter):")
        for r in v5_failures:
            print(f"    {r['query']}: expected ch.{r['expected_ch']}, got {r['new_pick']} — {r['new_rationale'][:60]}")
    else:
        print("  v5: ALL CORRECT! 🎉")

    v2_failures = [r for r in results if not r["old_ch_correct"]]
    if v2_failures:
        print(f"\n  v2 FAILURES ({len(v2_failures)}):")
        for r in v2_failures:
            print(f"    {r['query']}: expected ch.{r['expected_ch']}, got {r['old_pick']}")

    # Save full results to JSON
    output_file = "comparison_v2_v5_results.json"
    with open(output_file, "w") as f:
        json.dump({
            "summary": {
                "total": total,
                "v2_correct": old_correct,
                "v5_correct": new_correct,
                "v5_improved": v5_improved,
                "v5_regressed": v5_regressed,
                "v2_avg_score": old_avg_score,
                "v5_avg_score": new_avg_score,
                "elapsed_seconds": elapsed,
            },
            "results": results,
        }, f, indent=2)
    print(f"\n  Full results saved to: {output_file}")

    # Upload results to GCS
    print("  Uploading results to GCS...", flush=True)
    try:
        upload_cmd = f'gcloud storage cp {output_file} gs://corduroyai/{output_file}'
        result_upload = subprocess.run(upload_cmd, shell=True, capture_output=True, text=True)
        if result_upload.returncode == 0:
            print(f"  Uploaded to gs://corduroyai/{output_file}")
        else:
            print(f"  GCS upload failed: {result_upload.stderr[:200]}")
    except Exception as e:
        print(f"  GCS upload error: {e}")

    print("=" * 70)


if __name__ == "__main__":
    main()
