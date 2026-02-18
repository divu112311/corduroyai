"""
Classification Test Runner
Runs test scenarios against the live backend and generates a report.
"""

import json
import time
import sys
import os
import requests
from datetime import datetime

# Configuration
BACKEND_URL = os.environ.get("BACKEND_URL", "https://trade-ai-dev-947648351654.us-central1.run.app")
CLASSIFY_ENDPOINT = f"{BACKEND_URL}/classify"
SCENARIOS_FILE = os.path.join(os.path.dirname(__file__), "test_scenarios.json")
REPORT_FILE = os.path.join(os.path.dirname(__file__), "test_report.json")
REPORT_MD_FILE = os.path.join(os.path.dirname(__file__), "test_report.md")

# Rate limiting
REQUEST_DELAY = 2  # seconds between requests to avoid overwhelming the backend


def load_scenarios():
    with open(SCENARIOS_FILE, "r") as f:
        return json.load(f)


def classify(query: str, timeout: int = 60) -> dict:
    """Call the /classify endpoint."""
    try:
        resp = requests.post(
            CLASSIFY_ENDPOINT,
            json={
                "product_description": query,
                "user_id": "test-runner",
                "confidence_threshold": 0.75,
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.Timeout:
        return {"error": "timeout", "type": "error"}
    except requests.exceptions.RequestException as e:
        return {"error": str(e), "type": "error"}


def extract_result(response: dict) -> dict:
    """Extract the key fields from a classification response."""
    result = {
        "type": response.get("type"),
        "hts_code": None,
        "chapter": None,
        "heading": None,
        "description": None,
        "confidence": None,
        "clarifications": None,
        "error": response.get("error"),
    }

    if response.get("type") == "clarify":
        clarifications = response.get("clarifications", [])
        result["clarifications"] = clarifications
        return result

    if response.get("type") == "answer":
        matches = response.get("matches", {})
        matched_rules = matches.get("matched_rules", []) if isinstance(matches, dict) else []

        if matched_rules and len(matched_rules) > 0:
            top = matched_rules[0]
            hts = str(top.get("hts", ""))
            result["hts_code"] = hts
            result["chapter"] = hts[:2].replace(".", "") if len(hts) >= 2 else None
            result["heading"] = hts[:4].replace(".", "") if len(hts) >= 4 else None
            result["description"] = top.get("description", "")
            result["confidence"] = top.get("confidence", top.get("rule_confidence", top.get("score")))
        return result

    if response.get("type") == "error":
        result["error"] = response.get("message", response.get("error", "Unknown error"))

    return result


def evaluate_scenario(scenario: dict, result: dict) -> dict:
    """Evaluate whether the result matches expectations."""
    evaluation = {
        "passed": False,
        "chapter_match": None,
        "heading_match": None,
        "clarification_correct": None,
        "failure_reason": None,
    }

    # Check for errors
    if result.get("type") == "error":
        evaluation["failure_reason"] = f"Backend error: {result.get('error')}"
        return evaluation

    # If we expect clarification
    if scenario["should_clarify"]:
        if result["type"] == "clarify":
            evaluation["clarification_correct"] = True
            evaluation["passed"] = True
        else:
            evaluation["clarification_correct"] = False
            evaluation["failure_reason"] = f"Expected clarification but got {result['type']} with HTS {result.get('hts_code')}"
        return evaluation

    # If we expect a classification result
    if result["type"] == "clarify":
        evaluation["failure_reason"] = f"Expected classification but got clarification: {result.get('clarifications')}"
        return evaluation

    if result["type"] != "answer":
        evaluation["failure_reason"] = f"Unexpected response type: {result['type']}"
        return evaluation

    # Check chapter
    expected_chapter = scenario.get("expected_chapter")
    actual_chapter = result.get("chapter")
    if expected_chapter and actual_chapter:
        evaluation["chapter_match"] = actual_chapter.lstrip("0") == expected_chapter.lstrip("0") or actual_chapter == expected_chapter

    # Check heading
    expected_heading = scenario.get("expected_heading")
    actual_heading = result.get("heading")
    if expected_heading and actual_heading:
        evaluation["heading_match"] = actual_heading == expected_heading

    # Overall pass: chapter must match at minimum
    if evaluation["chapter_match"]:
        evaluation["passed"] = True
        if evaluation["heading_match"] is False:
            evaluation["failure_reason"] = f"Chapter correct ({actual_chapter}) but heading wrong: expected {expected_heading}, got {actual_heading}"
    else:
        evaluation["failure_reason"] = f"Wrong chapter: expected {expected_chapter}, got {actual_chapter} (HTS: {result.get('hts_code')}, Desc: {result.get('description', '')[:80]})"

    return evaluation


def generate_markdown_report(results: list, stats: dict):
    """Generate a markdown report."""
    lines = []
    lines.append("# Classification Test Report")
    lines.append(f"\n**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"**Backend:** {BACKEND_URL}")
    lines.append(f"**Total Scenarios:** {stats['total']}")
    lines.append(f"**Passed:** {stats['passed']} ({stats['pass_rate']:.1f}%)")
    lines.append(f"**Failed:** {stats['failed']}")
    lines.append(f"**Errors:** {stats['errors']}")
    if stats.get("avg_time"):
        lines.append(f"**Timing:** avg={stats['avg_time']}s, min={stats['min_time']}s, max={stats['max_time']}s, total={stats['total_time']}s")

    # Summary by category
    lines.append("\n## Results by Category\n")
    lines.append("| Category | Total | Passed | Failed | Pass Rate |")
    lines.append("|----------|-------|--------|--------|-----------|")

    categories = {}
    for r in results:
        cat = r["scenario"]["category"]
        if cat not in categories:
            categories[cat] = {"total": 0, "passed": 0, "failed": 0}
        categories[cat]["total"] += 1
        if r["evaluation"]["passed"]:
            categories[cat]["passed"] += 1
        else:
            categories[cat]["failed"] += 1

    for cat in sorted(categories.keys()):
        c = categories[cat]
        rate = (c["passed"] / c["total"] * 100) if c["total"] > 0 else 0
        lines.append(f"| {cat} | {c['total']} | {c['passed']} | {c['failed']} | {rate:.0f}% |")

    # Failed scenarios detail
    failures = [r for r in results if not r["evaluation"]["passed"]]
    if failures:
        lines.append(f"\n## Failed Scenarios ({len(failures)})\n")
        lines.append("| ID | Query | Expected | Got | Reason |")
        lines.append("|----|-------|----------|-----|--------|")
        for f in failures:
            s = f["scenario"]
            e = f["evaluation"]
            r = f["result"]
            expected = f"Ch.{s.get('expected_chapter', '?')}/H.{s.get('expected_heading', '?')}" if not s["should_clarify"] else "Clarify"
            got = r.get("hts_code", r.get("type", "?"))
            reason = (e.get("failure_reason") or "")[:100]
            lines.append(f"| {s['id']} | {s['query'][:40]} | {expected} | {got} | {reason} |")

    # Heading mismatches (chapter correct but heading wrong)
    heading_mismatches = [r for r in results if r["evaluation"].get("chapter_match") and r["evaluation"].get("heading_match") is False]
    if heading_mismatches:
        lines.append(f"\n## Heading Mismatches (Chapter correct, heading wrong) ({len(heading_mismatches)})\n")
        lines.append("| ID | Query | Expected Heading | Got Heading | Got HTS |")
        lines.append("|----|-------|-----------------|-------------|---------|")
        for h in heading_mismatches:
            s = h["scenario"]
            r = h["result"]
            lines.append(f"| {s['id']} | {s['query'][:40]} | {s.get('expected_heading', '?')} | {r.get('heading', '?')} | {r.get('hts_code', '?')} |")

    return "\n".join(lines)


def main():
    scenarios = load_scenarios()
    print(f"Loaded {len(scenarios)} test scenarios")
    print(f"Backend: {CLASSIFY_ENDPOINT}")
    print(f"Starting tests...\n")

    results = []
    stats = {"total": len(scenarios), "passed": 0, "failed": 0, "errors": 0}

    for i, scenario in enumerate(scenarios):
        query = scenario["query"]
        print(f"[{i+1}/{len(scenarios)}] Testing: \"{query}\"...", end=" ", flush=True)

        start_time = time.time()
        response = classify(query)
        elapsed = time.time() - start_time

        result = extract_result(response)
        evaluation = evaluate_scenario(scenario, result)

        if result.get("type") == "error":
            stats["errors"] += 1
            status = "ERROR"
        elif evaluation["passed"]:
            stats["passed"] += 1
            status = "PASS"
        else:
            stats["failed"] += 1
            status = "FAIL"

        print(f"{status} ({elapsed:.1f}s) - Got: {result.get('hts_code') or result.get('type')}" +
              (f" - {evaluation.get('failure_reason', '')[:60]}" if not evaluation["passed"] else ""))

        results.append({
            "scenario": scenario,
            "result": result,
            "evaluation": evaluation,
            "elapsed_seconds": round(elapsed, 1),
            "raw_response_type": response.get("type"),
        })

        # Rate limiting
        if i < len(scenarios) - 1:
            time.sleep(REQUEST_DELAY)

    # Print summary
    stats["pass_rate"] = (stats["passed"] / stats["total"] * 100) if stats["total"] > 0 else 0

    # Calculate timing stats
    elapsed_times = [r["elapsed_seconds"] for r in results if r.get("elapsed_seconds")]
    if elapsed_times:
        stats["avg_time"] = round(sum(elapsed_times) / len(elapsed_times), 1)
        stats["min_time"] = round(min(elapsed_times), 1)
        stats["max_time"] = round(max(elapsed_times), 1)
        stats["total_time"] = round(sum(elapsed_times), 1)

    print(f"\n{'='*60}")
    print(f"RESULTS: {stats['passed']}/{stats['total']} passed ({stats['pass_rate']:.1f}%)")
    print(f"Failed: {stats['failed']}, Errors: {stats['errors']}")
    if elapsed_times:
        print(f"Timing: avg={stats['avg_time']}s, min={stats['min_time']}s, max={stats['max_time']}s, total={stats['total_time']}s")
    print(f"{'='*60}")

    # Save JSON report locally
    try:
        with open(REPORT_FILE, "w") as f:
            json.dump({"stats": stats, "results": results}, f, indent=2)
        print(f"\nJSON report saved to: {REPORT_FILE}")
    except Exception as e:
        print(f"Could not save JSON locally: {e}")

    # Save markdown report locally
    md_report = generate_markdown_report(results, stats)
    try:
        with open(REPORT_MD_FILE, "w") as f:
            f.write(md_report)
        print(f"Markdown report saved to: {REPORT_MD_FILE}")
    except Exception as e:
        print(f"Could not save markdown locally: {e}")

    # Always print full markdown report to stdout (for Cloud Run logs)
    print("\n" + "=" * 80)
    print("FULL MARKDOWN REPORT")
    print("=" * 80)
    print(md_report)

    # Upload to GCS if bucket is configured
    gcs_bucket = os.environ.get("GCS_BUCKET", "")
    if gcs_bucket:
        try:
            from google.cloud import storage
            client = storage.Client()
            bucket = client.bucket(gcs_bucket)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")

            blob_json = bucket.blob(f"test-reports/test_report_{ts}.json")
            blob_json.upload_from_string(json.dumps({"stats": stats, "results": results}, indent=2))
            print(f"\nJSON report uploaded to: gs://{gcs_bucket}/test-reports/test_report_{ts}.json")

            blob_md = bucket.blob(f"test-reports/test_report_{ts}.md")
            blob_md.upload_from_string(md_report)
            print(f"Markdown report uploaded to: gs://{gcs_bucket}/test-reports/test_report_{ts}.md")
        except Exception as e:
            print(f"GCS upload failed (non-fatal): {e}")


if __name__ == "__main__":
    main()
