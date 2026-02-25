"""
build_v5.py

Builds hts_rich_docs_v5.json — single combined rich_doc per HTS code.

Inputs (local files):
  - hts_rich_docs_v4.json (base: htsno, description, chapter, section, metadata — 26,630 codes)
  - results_merged/*.json (consumer + technical data, 98 files)

Output:
  - hts_rich_docs_v5.json (26,630 entries, one rich_doc per code)

Works on both Windows and Linux/VM.
$0 cost, 0 LLM calls, ~10 seconds.
"""

import json
import os
import platform
import subprocess
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__)) or "."
V4_FILE = os.path.join(SCRIPT_DIR, "hts_rich_docs_v4.json")
MERGED_DIR = os.path.join(SCRIPT_DIR, "results_merged")
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "hts_rich_docs_v5.json")
GCS_BUCKET = "gs://corduroyai"
GCLOUD = "gcloud.cmd" if platform.system() == "Windows" else "gcloud"


def run_cmd(cmd):
    print(f"  $ {cmd}", flush=True)
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ERROR: {result.stderr.strip()[:300]}", flush=True)
        return False
    return True


def ensure_inputs():
    """Download from GCS if files not present locally."""
    if not os.path.exists(V4_FILE):
        print("Downloading hts_rich_docs_v4.json from GCS...", flush=True)
        run_cmd(f"{GCLOUD} storage cp {GCS_BUCKET}/hts_rich_docs_v4.json {V4_FILE}")

    os.makedirs(MERGED_DIR, exist_ok=True)
    existing = [f for f in os.listdir(MERGED_DIR) if f.startswith("ch_") and f.endswith(".json")]
    if len(existing) < 90:
        print(f"Downloading results_merged/ from GCS ({len(existing)} files found)...", flush=True)
        run_cmd(f"{GCLOUD} storage cp -r {GCS_BUCKET}/results_merged/* {MERGED_DIR}/")


def build_category_from_metadata(metadata):
    """Build category string from metadata parent_indent fields."""
    parts = []
    for i in range(10):
        key = f"parent_indent_{i}"
        val = metadata.get(key, "")
        if not val:
            break
        if " - " in val:
            desc = val.split(" - ", 1)[1].strip()
        else:
            desc = val.strip()
        if desc:
            parts.append(desc)
    return " > ".join(parts) if parts else ""


def build_rich_doc(v4_doc, merged_entry):
    """Build combined rich_doc string."""
    htsno = v4_doc["htsno"]
    desc = v4_doc.get("description", "")
    chapter = v4_doc.get("chapter", {})
    section = v4_doc.get("section", {})
    metadata = v4_doc.get("metadata", {})

    category = build_category_from_metadata(metadata)

    lines = []
    lines.append(f"HTS Code: {htsno}")
    lines.append(f"Description: {desc}")
    if category:
        lines.append(f"Category: {category}")
    lines.append(f"Chapter {chapter.get('code', '')}: {chapter.get('title', '')}")
    lines.append(f"Section {section.get('code', '')}: {section.get('title', '')}")

    if merged_entry:
        c = merged_entry.get("consumer", {})
        t = merged_entry.get("technical", {})

        for field, label in [
            ("products", "Products"),
            ("synonyms", "Consumer Terms"),
            ("functions", "Uses"),
            ("materials", "Consumer Materials"),
        ]:
            vals = c.get(field, [])
            if vals and isinstance(vals, list):
                joined = ", ".join(str(v) for v in vals if v)
                if joined:
                    lines.append(f"{label}: {joined}")

        for field, label in [
            ("materials", "Technical Materials"),
            ("synonyms", "Technical Terms"),
            ("functions", "Technical Functions"),
        ]:
            vals = t.get(field, [])
            if vals and isinstance(vals, list):
                joined = ", ".join(str(v) for v in vals if v)
                if joined:
                    lines.append(f"{label}: {joined}")

        for field, label in [
            ("form", "Form"),
            ("processing", "Processing"),
            ("key_properties", "Key Properties"),
        ]:
            val = t.get(field, "")
            if val and isinstance(val, str) and val.strip():
                lines.append(f"{label}: {val.strip()}")

    return "\n".join(lines)


def main():
    start = time.time()
    print("=" * 60, flush=True)
    print("BUILD V5 - Single Combined Rich Doc", flush=True)
    print(f"Started: {time.strftime('%Y-%m-%d %H:%M:%S')}", flush=True)
    print("=" * 60, flush=True)

    # Ensure inputs exist
    ensure_inputs()

    # Load v4 base
    print(f"\nLoading hts_rich_docs_v4.json...", flush=True)
    with open(V4_FILE, "r", encoding="utf-8") as f:
        v4_docs = json.load(f)
    print(f"  {len(v4_docs)} v4 codes loaded", flush=True)

    # Load results_merged
    print("Loading results_merged/...", flush=True)
    all_merged = {}
    merged_files = sorted(f for f in os.listdir(MERGED_DIR)
                         if f.startswith("ch_") and f.endswith(".json"))
    for fname in merged_files:
        with open(os.path.join(MERGED_DIR, fname), "r", encoding="utf-8") as f:
            data = json.load(f)
        for item in data:
            if isinstance(item, dict) and item.get("htsno"):
                all_merged[item["htsno"]] = item
    print(f"  {len(all_merged)} merged entries from {len(merged_files)} files", flush=True)

    # Build v5
    print("\nBuilding v5...", flush=True)
    v5_docs = []
    matched = 0
    unmatched = 0
    empty_rich_doc = 0

    for v4_doc in v4_docs:
        htsno = v4_doc["htsno"]
        merged = all_merged.get(htsno)

        if merged:
            matched += 1
        else:
            unmatched += 1

        rich_doc = build_rich_doc(v4_doc, merged)

        if not rich_doc.strip():
            empty_rich_doc += 1

        v5_docs.append({
            "htsno": htsno,
            "description": v4_doc.get("description", ""),
            "chapter": v4_doc.get("chapter", {}),
            "section": v4_doc.get("section", {}),
            "rich_doc": rich_doc,
            "metadata": v4_doc.get("metadata", {}),
        })

    # Save
    print(f"\nSaving hts_rich_docs_v5.json...", flush=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(v5_docs, f, ensure_ascii=False)
    size_mb = os.path.getsize(OUTPUT_FILE) / 1024 / 1024

    # Upload to GCS
    print(f"\nUploading to GCS...", flush=True)
    run_cmd(f"{GCLOUD} storage cp {OUTPUT_FILE} {GCS_BUCKET}/")

    # Sample
    print(f"\n{'-' * 40}", flush=True)
    print("SAMPLE (first entry):", flush=True)
    print(f"{'-' * 40}", flush=True)
    print(v5_docs[0]["rich_doc"], flush=True)

    # Report
    elapsed = time.time() - start
    print(f"\n{'=' * 60}", flush=True)
    print("BUILD V5 COMPLETE", flush=True)
    print(f"{'=' * 60}", flush=True)
    print(f"Total codes:      {len(v5_docs)}", flush=True)
    print(f"Matched merged:   {matched}", flush=True)
    print(f"Unmatched:        {unmatched}", flush=True)
    print(f"Empty rich_doc:   {empty_rich_doc}", flush=True)
    print(f"File size:        {size_mb:.1f} MB", flush=True)
    print(f"Time:             {elapsed:.1f}s", flush=True)
    print(f"{'=' * 60}", flush=True)


if __name__ == "__main__":
    main()
