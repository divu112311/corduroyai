# build_documents.py - Build rich documents for HTS embedding 

import json
import os
import time
import re
from tqdm import tqdm
from openai import OpenAI
from google.cloud import storage

from secrets import get_secret
from database import SupabaseDatabase
import config

from concurrent.futures import ThreadPoolExecutor, as_completed
#import time
import threading
import copy


# ============ CONFIG ============
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
PROGRESS_FILE = "build_docs_progress.json"
OUTPUT_FILE = "hts_rich_docs_v2.json"
TARIFF_2025_FILE = "tariff_database_2025.json"
GCS_OUTPUT_PATH = "hts_rich_docs_v2.json"

# OpenAI rate limit handling
CALLS_PER_MINUTE = 400  # stay under 500 RPM limit
DELAY_BETWEEN_CALLS = 60.0 / CALLS_PER_MINUTE  # ~0.15s per call
MAX_RETRIES = 5
SAVE_EVERY = 50  # save progress every N codes

openai_client = OpenAI(api_key=OPENAI_API_KEY)
all_docs_lock = threading.Lock()
processed_codes_lock = threading.Lock()
MAX_THREADS = 5        # safe concurrency (OpenAI ~400 RPM)
SAVE_EVERY = 200       # save every 200 docs

# ============ LOAD DATA ============

def normalize_hts(htsno: str) -> str:
    return htsno.replace(".", "")

def load_2026_from_gcs():
    """Load 2026 HTS JSON from GCS"""
    print("Loading 2026 HTS JSON from GCS...", flush=True)
    client = storage.Client(project=config.GCP_PROJECT_ID)
    bucket = client.bucket(config.GCS_BUCKET_NAME)
    blob = bucket.blob(config.GCS_JSON_PATH)
    content = blob.download_as_text()
    data = json.loads(content)
    print(f"  Loaded {len(data)} entries from 2026 JSON", flush=True)
    return data


def load_2025_lookup():
    """Build lookup dict from 2025 tariff: {hts_code: brief_description}"""
    print(f"Loading 2025 tariff from {TARIFF_2025_FILE}...", flush=True)
    with open(TARIFF_2025_FILE, "r") as f:
        data = json.load(f)

    lookup = {}
    for entry in data:
        dotted = entry.get("hts_code", "").strip()
        desc = entry.get("brief_description", "").strip()
    
        if not dotted:
            continue

        undotted = dotted.replace(".", "")
        lookup[dotted] = desc
        lookup[undotted] = desc

    print(f"  Built lookup with {len(lookup)} entries", flush=True)
    return lookup


def load_progress():
    """Load already processed HTS codes"""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r") as f:
            data = json.load(f)
        print(f"  Resuming: {len(data['processed_codes'])} codes already done", flush=True)
        return set(data["processed_codes"]), data.get("docs", [])
    return set(), []


def save_progress(processed_codes, docs):
    payload = {
        "processed_codes": list(processed_codes),
        "docs": docs
    }
    
    """Save progress to file"""
    with open(PROGRESS_FILE, "w") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    # Final output file (always valid)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(docs, f, ensure_ascii=False, indent=2)

def save_to_gcs(docs):
    """Save final docs to GCS"""
    print(f"Saving {len(docs)} docs to GCS...", flush=True)
    client = storage.Client(project=config.GCP_PROJECT_ID)
    bucket = client.bucket(config.GCS_BUCKET_NAME)
    blob = bucket.blob(GCS_OUTPUT_PATH)
    blob.chunk_size = 5 * 1024 * 1024
    blob.upload_from_string(
        json.dumps(docs, ensure_ascii=False, indent=2),
        content_type="application/json"
    )
    print(f"  Saved to gs://{config.GCS_BUCKET_NAME}/{GCS_OUTPUT_PATH}", flush=True)


# ============ OPENAI CALL ============

def get_materials_functions_synonyms(hts_code, description, parents, chapter_title, section_title):
    """
    Call OpenAI to extract materials, functions, synonyms for a single HTS code.
    Includes retry with exponential backoff.
    """
    parent_lines = ""
    for indent_key in sorted(parents.keys()):
        p = parents[indent_key]
        parent_lines += f"  {indent_key}: {p['htsno']} - {p['description']}\n"

    prompt = f"""You are an expert in HTS (Harmonized Tariff Schedule) classification.

HTS Code: {hts_code}
Description: {description}
Parent hierarchy:
{parent_lines}
Chapter: {chapter_title}
Section: {section_title}

Extract three lists for this specific HTS code:

1. "materials" - specific tangible materials or substances this code covers.
   Be precise. Example: "cotton fabric", "stainless steel pipe", NOT "products" or "items".

2. "functions" - common uses, purposes, or applications.
   Example: "clothing", "construction", "food packaging".

3. "synonyms" - alternative names, trade names, or related terms someone might search for.
   Example: "t-shirt" for knitted cotton garments, "laptop" for portable data processing machines.

Requirements:
- Return ONLY valid JSON in lowercase with no duplicates.
- Be specific to THIS code, not the entire chapter.
- 5-15 items per list.

Respond ONLY with JSON:
{{"materials": [...], "functions": [...], "synonyms": [...]}}"""

    for attempt in range(MAX_RETRIES):
        try:
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You extract materials, functions, and synonyms for HTS tariff codes. Always respond with valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=500,
                temperature=0
            )

            raw = response.choices[0].message.content.strip()
            match = re.search(r"\{.*\}", raw, re.DOTALL)
            if match:
                result = json.loads(match.group())
                return result

            print(f"  No JSON in response for {hts_code}, attempt {attempt + 1}", flush=True)

        except Exception as e:
            error_str = str(e)

            # Rate limit hit
            if "rate_limit" in error_str.lower() or "429" in error_str:
                wait = 30 * (attempt + 1)
                print(f"  Rate limit hit for {hts_code}. Waiting {wait}s (attempt {attempt + 1})", flush=True)
                time.sleep(wait)
            else:
                wait = 5 * (attempt + 1)
                print(f"  Error for {hts_code}: {e}. Retrying in {wait}s (attempt {attempt + 1})", flush=True)
                time.sleep(wait)

    print(f"  FAILED all retries for {hts_code}, using empty values", flush=True)
    return {"materials": [], "functions": [], "synonyms": []}


# ============ BUILD RICH DOC ============

def build_rich_doc_text(hts_code, description, parents, chapter, section, materials, functions, synonyms, units):
    """Build the rich document text string for embedding"""
    parts = []

    parts.append(f"HTS Code: {hts_code}")
    parts.append(f"Description: {description}")

    # Parent chain as category breadcrumb
    parent_descs = []
    for key in sorted(parents.keys()):
        desc = parents[key].get("description")
        if desc:
            parent_descs.append(desc)
        #parent_descs.append(parents[key]["description"])
    if parent_descs:
        parts.append(f"Category: {' > '.join(parent_descs)}")

    # Chapter and section
    if chapter.get("title"):
        parts.append(f"Chapter {chapter['code']}: {chapter['title']}")
    if section.get("title"):
        parts.append(f"Section {section['code']}: {section['title']}")

    # Materials, functions, synonyms
    if materials:
        parts.append(f"Materials: {', '.join(materials)}")
    if functions:
        parts.append(f"Functions: {', '.join(functions)}")
    if synonyms:
        parts.append(f"Related Terms: {', '.join(synonyms)}")

    # Units
    if units:
        if isinstance(units, list):
            parts.append(f"Units: {', '.join(units)}")
        else:
            parts.append(f"Units: {units}")

    return "\n".join(parts)

def process_single_hts(entry, lookup_2025, chapters, parents_by_indent, processed_codes):
    
    htsno = entry.get("htsno", "").strip()
      
    indent = int(entry.get("indent", 0))
        #print("indent", indent)
    description_2026 = entry.get("description", "").strip()
        #print("description", description_2026)
    superior = entry.get("superior") 

        # Update parents_by_indent for ALL rows (including empty htsno)
    parents_by_indent[indent] = {
        "htsno": htsno,
        "description": description_2026,
        "superior": superior
        }
    print("parents_by_indent:", parents_by_indent)
    # Clear deeper indents
    for deeper in list(parents_by_indent.keys()):
        #print("Deeper", deeper)
        if deeper > indent:
            parents_by_indent.pop(deeper)

        # Normalize htsno
    norm = normalize_hts(htsno)
    #print("norm:", norm)
    # Skip non-target rows
    if not norm or superior:
        return None

    # Only process 8-digit and 10-digit codes
    if len(norm) not in (8, 10):   
        return None
    
    #total_indent_2_3 += 1
    #total_indent_2_3 += 1
# --- Build parent chain for this code ---
    code_parents = {}
    for p_indent in sorted(parents_by_indent.keys()):
        if p_indent < indent:
            p_entry = parents_by_indent[p_indent]
            code_parents[f"indent_{p_indent}"] = {
                "htsno": p_entry.get("htsno", ""),
                "description": p_entry.get("description", "")
            }

        #print("code parents",code_parents)
    if len(norm) == 8:
        # 8-digit: prefer 2025 lookup, fallback to 2026 description
        description = lookup_2025.get(htsno) or lookup_2025.get(norm) or description_2026
        #print("description", description,"htso",htsno,"norm",norm)

    elif len(norm) == 10:
        last_8_digit_desc = ""
        last_8_digit_indent = -1
        base_8 = norm[:8]                         # truncate
        base_desc = lookup_2025.get(base_8, "")
        print ("base_desc",base_desc)
        for ind, parent in sorted(parents_by_indent.items(), reverse= True):
            if ind < indent:
                parent = parents_by_indent[ind]
                parent_norm = normalize_hts(parent.get("htsno", ""))
                if len(parent_norm) == 8:
                    last_8_digit_indent = ind
                    last_8_digit_desc = parent.get("description", "")
                    break
                
                #parent_norm = normalize_hts(parent.get("htsno", ""))
                #if len(parent_norm) == 8:
                #   last_8_digit_desc = lookup_2025.get(parent_norm) or ""
                #   last_8_digit_indent = ind

        # Collect all headings (superior = true) between 8-digit ancestor and current 10-digit code
            
        intermediate_descs = []
        for ind in range(last_8_digit_indent + 1, indent):
            parent = parents_by_indent.get(ind)
            if parent and parent.get("description") and str(parent.get("superior")).lower() == "true":
                intermediate_descs.append(parent["description"])

        # Build full description with fallbacks for missing 2025 data
        if not base_desc:
            base_desc = last_8_digit_desc

        description = base_desc or ""
        if intermediate_descs:
            if description:
                description += " > " + " > ".join(intermediate_descs)
            else:
                description = " > ".join(intermediate_descs)
        if description_2026:
            if description:
                description += f" - {description_2026}"
            else:
                description = description_2026
           #print("Description 11", description)
            
            #total_indent_2_3 += 1

            # Skip if already processed
    #if htsno in processed_codes:
     #   return None
     #   skipped += 1
      #  continue
        
        
    # --- Chapter and section ---
    chapter_code = htsno[:2]
    normalized_code = str(int(chapter_code))
    chapter_data = chapters.get(normalized_code, {})
    chapter_info = {
        "code": chapter_code,
        "title": chapter_data.get("title", "")
    }

    section_info = {"code": "", "title": ""}
    section = chapter_data.get("section")
    if section:
        section_info = {
            "code": section.get("code", ""),
            "title": section.get("title", "")
        }

        # --- OpenAI call for materials/functions/synonyms ---
    time.sleep(DELAY_BETWEEN_CALLS)
    mfs = get_materials_functions_synonyms(
        htsno, description, code_parents,
        chapter_info.get("title", ""),
        section_info.get("title", "")
    )
    #api_call_count += 1

    materials = mfs.get("materials", [])
    functions = mfs.get("functions", [])
    synonyms = mfs.get("synonyms", [])
    # --- Build rich doc text ---
    units = entry.get("units", [])
    rich_doc = build_rich_doc_text(
        htsno, description, code_parents,
        chapter_info, section_info,
        materials, functions, synonyms, units
    )

        # --- Build metadata ---
    metadata = {
        "hts_code": htsno,
        "description": description,
        "indent": indent,
        "chapter_code": chapter_code,
        "chapter_title": chapter_info["title"],
        "section_code": section_info["code"],
        "section_title": section_info["title"],
        "units": ", ".join(units) if isinstance(units, list) else str(units)
    }

    for p_key, p_val in code_parents.items():
        metadata[f"parent_{p_key}"] = f"{p_val['htsno']} - {p_val['description']}"
       # --- Append doc ---
    doc = {
        "htsno": htsno,
        "indent": indent,
        "description": description,
        "parents": code_parents,
        "chapter": chapter_info,
        "section": section_info,
        "materials": materials,
        "functions": functions,
        "synonyms": synonyms,
        "units": units,
        "rich_doc": rich_doc,
        "metadata": metadata
    }

    return doc
# ============ MAIN ============

def main():
    print("=" * 80, flush=True)
    print("BUILD RICH DOCUMENTS FOR HTS EMBEDDING", flush=True)
    print(f"Started: {time.strftime('%Y-%m-%d %H:%M:%S')}", flush=True)
    print("=" * 80, flush=True)

    # Load data sources
    hts_2026 = load_2026_from_gcs()

    hts_lookup = {}
    for e in hts_2026:
        code = e.get("htsno", "").strip()
        if code:
            hts_lookup[normalize_hts(code)] = e
    
    lookup_2025 = load_2025_lookup()

    # Supabase for chapters/sections
    print("Connecting to Supabase...", flush=True)
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_KEY", "")
    db = SupabaseDatabase(supabase_url, supabase_key)
    chapters = db.get_chapters()
    print(f"  Loaded {len(chapters)} chapters", flush=True)

    # Load progress
    processed_codes, all_docs = load_progress()
    print(f"  Already have {len(all_docs)} docs built", flush=True)

    # Track parents as we iterate
    parents_by_indent = {}  # {0: {htsno, description}, 1: {...}, ...}
    # Counters
    total_indent_2_3 = 0
    skipped = 0
    newly_processed = 0
    api_call_count = 0

    #for entry in tqdm(hts_2026, desc="Processing"):
    with ThreadPoolExecutor(max_workers=MAX_THREADS) as executor:
        futures = {executor.submit(process_single_hts, e, lookup_2025, chapters, copy.deepcopy(parents_by_indent), processed_codes): e for e in hts_2026}
        for future in tqdm(as_completed(futures), total=len(futures), desc="Processing"):
            doc = future.result()
            if doc:
                all_docs.append(doc)
                processed_codes.add(doc["htsno"])
                newly_processed += 1
                total_indent_2_3 += 1  # moved from thread
                api_call_count += 1  

            if newly_processed % SAVE_EVERY == 0:
                save_progress(processed_codes, all_docs)
                print(f"\nSaved progress: {len(processed_codes)} codes processed.")          
       

    # Final save
    #save_progress(processed_codes, all_docs)

    # Save to local file
    with open(OUTPUT_FILE, "w") as f:
        json.dump(all_docs, f, ensure_ascii=False, indent=2)
    print(f"\nSaved {len(all_docs)} docs to {OUTPUT_FILE}", flush=True)

    # Save to GCS
    save_to_gcs(all_docs)

    print("\n" + "=" * 80, flush=True)
    print("COMPLETE", flush=True)
    print(f"  Total indent 2/3 codes: {total_indent_2_3}", flush=True)
    print(f"  Newly processed: {newly_processed}", flush=True)
    print(f"  Skipped (resumed): {skipped}", flush=True)
    print(f"  API calls made: {api_call_count}", flush=True)
    print(f"  Finished: {time.strftime('%Y-%m-%d %H:%M:%S')}", flush=True)
    print("=" * 80, flush=True)


if __name__ == "__main__":
    main()
