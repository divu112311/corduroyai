import fitz, io, re
import os
from google.cloud import storage
from supabase import create_client
from datetime import datetime
import roman

# ---------------- CONFIG ----------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

TABLE_NAME = "hts_entries"
GCS_BUCKET = "corduroyai"
GCS_PDF_PATH = "tradedataraw/usitchts/finalCopy_2026HTSBasic.pdf"
START_PAGE = 20

SKIP_RANGES = [
    (77, 188),
    (214, 296),
    (304, 381),
    (412, 475),
    (488, 568),
    (618, 679),
    (839, 898)
]

START_SKIP_LINE = "Change in tariff classification rules"
START_SKIP_LINE1= "Product-specific rules"

def page_role(page_num):
    for start, end in SKIP_RANGES:
        if page_num == start:
            return "START"
        if page_num == end:
            return "END"
        if start < page_num < end:
            return "MIDDLE"
    return None

def is_resume_marker(line: str) -> bool:
    """Only resume on Chapter 98 or 99"""
    return bool(re.match(r"^Chapter\s+(98|99)\b", line, re.I))

# ---------------- INIT ----------------
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
storage_client = storage.Client()
blob = storage_client.bucket(GCS_BUCKET).blob(GCS_PDF_PATH)

pdf_stream = io.BytesIO()
blob.download_to_file(pdf_stream)
pdf_stream.seek(0)
doc = fitz.open(stream=pdf_stream, filetype="pdf")

# ---------------- FETCH GENERAL NOTE HEADERS ----------------
gn_resp = supabase.table("general_note").select("general_note_number,name").execute()

def normalize_gn_number(s: str) -> str:
    return s.rstrip(".").strip()

general_notes_headers = {
    normalize_gn_number(str(item["general_note_number"])): item["name"].strip()
    for item in gn_resp.data
}
sorted_headers = sorted(general_notes_headers.items(), key=lambda x: int(x[0]))
print("Number of general note items:", len(sorted_headers))
for key, value in sorted_headers:
    print(key, value)

# ---------------- NESTING REGEX PATTERNS ----------------
LEVEL_PATTERN_TUPLES = [
    (2, re.compile(r"^\(([ivxl]+)\)\s*", re.I | re.UNICODE)),  # Only (i), (ii), (iii)...
    (1, re.compile(r"^\(([a-z])\)\s*", re.UNICODE)),           # Only (a), (b), (c)...
]

# ---------------- STATE ----------------
resume_found = False
skip_rest_of_page = False
current_level_stack = []
current_marker_stack = []
current_id_stack = []
buffer = ""
current_page = None
prev_line = None
in_general_notes = False

# ---------------- HELPERS ----------------
def normalize_line(s: str) -> str:
    s = s.replace('\u200b', '')
    s = re.sub(r'[–—-]', ' ', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip()

def is_ignored_editorial_line(line: str) -> bool:
    l = line.lower()
    return (
        "subdivision deleted" in l
        or "were transferred and designated as subdivisions" in l
    )

def roman_value(s: str) -> int | None:
    if not s:
        return None
    try:
        return roman.fromRoman(s.upper())
    except Exception:
        return None

def get_prev_sibling_marker(marker_stack, level_stack, candidate_level):
    for i in range(len(marker_stack) - 1, 0, -1):
        level_idx = i - 1
        if level_idx < len(level_stack) and level_stack[level_idx] == candidate_level:
            return marker_stack[i]
    return None

def is_immediate_successor(prev_marker, next_marker, level):
    if prev_marker is None:
        # Only accept if it's the FIRST marker (a or i)
        if level == 1:
            return next_marker == 'a'
        elif level == 2:
            return next_marker == 'i'
        return False
    
    if level == 1:  # lowercase letters
        return ord(next_marker) == ord(prev_marker) + 1
    elif level == 2:  # lowercase roman
        pv = roman_value(prev_marker)
        nv = roman_value(next_marker)
        if pv is None or nv is None:
            return False
        return nv == pv + 1
    else:
        return False

def find_accept_parent_index(marker_stack, candidate_level):
    """
    Simple 2-level logic:
    - Level 1 (a, b, c): parent is root (GN number)
    - Level 2 (i, ii, iii): parent is the last level 1 item
    """
    if candidate_level == 1:
        # Level 1 attaches to root
        return 0
    elif candidate_level == 2:
        # Level 2 attaches to last level 1 item
        for i in range(len(current_level_stack) - 1, -1, -1):
            if current_level_stack[i] == 1:
                return i + 1
        # If no level 1 found, attach to root
        return 0
    return 0

def flush_current_node():
    global buffer, current_marker_stack, current_id_stack, current_page
    MAX_CHUNK_SIZE = 5000
    if not current_marker_stack:
        return None
    text_to_insert = (buffer or "").strip()
    if not text_to_insert:
        return None
    parent_id = current_id_stack[-2] if len(current_id_stack) >= 2 else None
    marker = "-".join(current_marker_stack)
    
    # Extract the general note number and its header
    general_note_number = current_marker_stack[0] if current_marker_stack else None
    general_note_header = general_notes_headers.get(general_note_number, None) if general_note_number else None
    
    start = 0
    main_id = None
    first_chunk = text_to_insert[start:start + MAX_CHUNK_SIZE]
    payload = {
        "page": current_page,
        "doc_type": "General Note",
        "ref_id": current_marker_stack[-1] if current_marker_stack else None,
        "parent_id": parent_id,
        "subtype": general_note_number,
        "marker": marker,
        "seq": None,
        "text": first_chunk.strip(),
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    try:
        res = supabase.table(TABLE_NAME).insert(payload).execute()
        print("Insert first chunk",res)
    except Exception as e:
        print("Insert failed for first chunk:", first_chunk[:200])
        raise e
    try:
        if res and hasattr(res, "data") and res.data:
            main_id = res.data[0].get("id")
    except Exception:
        main_id = None
    start += MAX_CHUNK_SIZE
    while start < len(text_to_insert):
        chunk = text_to_insert[start:start + MAX_CHUNK_SIZE]
        payload = {
            "page": current_page,
            "doc_type": "General Note",
            "ref_id": current_marker_stack[-1] if current_marker_stack else None,
            "parent_id": main_id,
            "subtype": general_note_number,
            "marker": marker,
            "seq": None,
            "text": chunk.strip(),
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        try:
            p=supabase.table(TABLE_NAME).insert(payload).execute()
            print("Insert remaining chunks",p)
        except Exception as e:
            print("Insert failed for chunk:", chunk[:200])
            raise e
        start += MAX_CHUNK_SIZE
    if current_id_stack:
        current_id_stack[-1] = main_id
    return main_id

# ------- PROCESS PDF -------
for i in range(START_PAGE, doc.page_count):
    page = doc[i]
    page_num = i + 1
    
    role = page_role(page_num)
    skip_rest_of_page = False 
    
    # skip entire middle pages immediately
    if role == "MIDDLE":
        print(f"[SKIP FULL PAGE] {page_num}")
        continue
    
    blocks = page.get_text("blocks")
    
    for block in blocks:
        if skip_rest_of_page:
            continue
        
        text = block[4]
        if not text:
            prev_line = None
            continue
        prev_line = None
        
        if text.startswith("Harmonized Tariff Schedule of the United States"):
            continue
        
        for raw_line in text.splitlines():
            line = normalize_line(raw_line)
            print("raw line", line)   
            
            if line.upper() == "GENERAL STATISTICAL NOTES":
                if in_general_notes and current_marker_stack:
                    flush_current_node()
                in_general_notes = False
                current_marker_stack = []
                current_level_stack = []
                current_id_stack = []
                buffer = ""
                continue
            
            if not line:
                prev_line = None
                continue
            
            # ---------- START PAGE PARTIAL SKIP ----------
            if role == "START":
                if line == START_SKIP_LINE or line == START_SKIP_LINE1:
                    if in_general_notes and current_marker_stack and buffer:
                        flush_current_node()
                        buffer = ""
                    print(f"[START PARTIAL SKIP] page {page_num}, line: {line}")
                    skip_rest_of_page = True
                    break

            # ---------- END PAGE PARTIAL SKIP ----------
            if role == "END":
                if not resume_found:
                    if is_resume_marker(line):
                        resume_found = True
                        print(f"[RESUME FOUND] page {page_num}")
                    else:
                        continue
                
            normalized_line = normalize_line(line)
            
            if is_ignored_editorial_line(line):
                prev_line = line
                continue
            
            matched_gn = None
            prev_norm = normalize_gn_number(prev_line) if prev_line else None
            if prev_norm in general_notes_headers:
                gn_title = normalize_line(general_notes_headers[prev_norm]).lower()
                if normalized_line.lower().startswith(gn_title):
                    matched_gn = prev_norm
            else:
                m = re.match(r'^(\d+)\.?\s+(.*)$', normalized_line)
                if m:
                    gn_num = normalize_gn_number(m.group(1))
                    if gn_num in general_notes_headers:
                        gn_title = normalize_line(general_notes_headers[gn_num]).lower()
                        if m.group(2).lower().startswith(gn_title):
                            matched_gn = gn_num
            
            if matched_gn:
                print(f"[GN MATCH] GN={matched_gn} page={page_num} preview={line[:120]!r}")
                if current_marker_stack:
                    flush_current_node()
                current_marker_stack = [matched_gn]
                current_level_stack = []
                current_id_stack = [None]
                buffer = line
                current_page = page_num
                in_general_notes = True
            else:
                if in_general_notes and current_marker_stack:
                    matched_level = None
                    matched_marker = None
                    marker_span_end = None
                    for level_num, pattern in LEVEL_PATTERN_TUPLES:
                        m = pattern.match(line)
                        if m:
                            matched_level = level_num
                            matched_marker = m.group(1)
                            marker_span_end = m.end()
                            break
                    
                    if matched_level is not None:
                        print(f"[NESTED DETECT] candidate level={matched_level} marker={matched_marker} page={page_num}")
                        prev_marker_at_same_level = get_prev_sibling_marker(current_marker_stack, current_level_stack, matched_level)
                        if is_immediate_successor(prev_marker_at_same_level, matched_marker, matched_level):
                            flush_current_node()
                            parent_index = find_accept_parent_index(current_marker_stack, matched_level)
                            current_marker_stack = current_marker_stack[: parent_index + 1]
                            current_level_stack = current_level_stack[: parent_index]
                            current_id_stack = current_id_stack[: parent_index + 1]
                            current_marker_stack.append(matched_marker)
                            current_level_stack.append(matched_level)
                            current_id_stack.append(None)
                            buffer = line[marker_span_end:].strip() if marker_span_end < len(line) else ""
                        else:
                            buffer += " " + line
                    else:
                        buffer += " " + line
                    
                    current_page = page_num
            prev_line = line

if current_marker_stack:
    flush_current_node()

print("✅ General Notes ingestion complete")