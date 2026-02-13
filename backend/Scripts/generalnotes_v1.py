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
#general_notes_headers = {str(item["general_note_number"]): item["name"].strip() for item in gn_resp.data}

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
# We'll list tuples (level_number, regex) in order from most-specific to least-specific.
# Level numbering: 1 = GN, 2 = a), 3 = i), 4 = A), 5 = 1), 6 = I)
LEVEL_PATTERN_TUPLES = [
    (6, re.compile(r"^\(?([IVXL]+)\)\s*", re.UNICODE)),   # Level 6: I), II)
    (5, re.compile(r"^\(?(\d+)\)\s*", re.UNICODE)),          # Level 5: 1), 2)
    (4, re.compile(r"^\(?([A-Z])\)\s*", re.UNICODE)),        # Level 4: A), B)
    (3, re.compile(r"^\(?([ivxl]+)\)\s*", re.I | re.UNICODE)),  # Level 3: i), ii)
    (2, re.compile(r"^\(?([a-z])\)\s*", re.UNICODE)),        # Level 2: a), b)
]

# ---------------- STATE ----------------
current_level_stack = []
current_marker_stack = []   # e.g. ['3', 'a', 'i']
current_id_stack = []       # parallel list of DB ids for the markers (placeholders until flushed)
buffer = ""                 # accumulating text for the current leaf node
current_page = None
prev_line = None
in_general_notes = False

# ---------------- HELPERS ----------------
def normalize_line(s: str) -> str:
    """Normalize whitespace, remove dash variants, remove zero-width chars."""
    s = s.replace('\u200b', '')
    s = re.sub(r'[–—-]', ' ', s)   # normalize ALL dash types
    s = re.sub(r'\s+', ' ', s)
    return s.strip()

def is_ignored_editorial_line(line: str) -> bool:
    l = line.lower()
    return (
        "subdivision deleted" in l
        or "were transferred and designated as subdivisions" in l
    )

def roman_value(s: str) -> int:
    """Return integer value of roman numeral string (upper or lower case)."""
    try:
        return roman.fromRoman(s.upper())
    except roman.InvalidRomanNumeralError:
        return -1

def get_prev_sibling_marker(marker_stack, level_stack, candidate_level):
    """
    Return the previous marker at the same level, or None if this is the first at this level.
    marker_stack: list of current markers
    level_stack: parallel list of levels for each marker
    candidate_level: level of the candidate marker
    """
    # search backwards in stack
    for i in reversed(range(len(marker_stack))):
        if level_stack[i] == candidate_level:
            return marker_stack[i]
    return None  # no previous sibling at this level


def is_immediate_successor(prev_marker, next_marker, level):
    """
    Return True if next_marker is valid successor for given level.
    Handles letters, digits, and Roman numerals.
    prev_marker may be None (first item at level)
    """
    if prev_marker is None:
        return True  # first marker at this level is always valid

    if level in [2, 4]:  # letters
        return ord(next_marker) == ord(prev_marker) + 1
    elif level == 5:  # digits
        return int(next_marker) == int(prev_marker) + 1
    elif level in [3, 6]:  # roman numerals
        return roman_value(next_marker) == roman_value(prev_marker) + 1
    else:
        return True  # GN / Level 1 always valid

def find_accept_parent_index(marker_stack, candidate_level):
    """Return highest index in stack that can be parent for candidate_level."""
    for idx in reversed(range(len(marker_stack))):
        parent_level = idx + 1  # stack[0] = Level 1, etc.
        if parent_level < candidate_level:
            return idx
    return None

def flush_current_node():
    """Insert the current leaf node into Supabase in smaller chunks and store its inserted id."""
    global buffer, current_marker_stack, current_id_stack, current_page

    MAX_CHUNK_SIZE = 5000

    if not current_marker_stack:
        return None

    text_to_insert = (buffer or "").strip()
    if not text_to_insert:
        return None

    # Parent of this node (the "real" parent in the hierarchy)
    parent_id = current_id_stack[-2] if len(current_id_stack) >= 2 else None
    marker = "-".join(current_marker_stack)

    start = 0
    main_id = None

    # Insert the first chunk and capture its id
    first_chunk = text_to_insert[start:start + MAX_CHUNK_SIZE]
    payload = {
        "page": current_page,
        "doc_type": "General Note",
        "ref_id": current_marker_stack[-1] if current_marker_stack else None,
        "parent_id": parent_id,
        "subtype": None,
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

    # extract the id of the main record if available
    try:
        if res and hasattr(res, "data") and res.data:
            main_id = res.data[0].get("id")
    except Exception:
        main_id = None

    # move pointer past first chunk
    start += MAX_CHUNK_SIZE

    # Insert remaining chunks as children of main_id (if any)
    while start < len(text_to_insert):
        chunk = text_to_insert[start:start + MAX_CHUNK_SIZE]
        payload = {
            "page": current_page,
            "doc_type": "General Note",
            "ref_id": current_marker_stack[-1] if current_marker_stack else None,
            # make the chunk a child of the main record so the sequence is preserved
            "parent_id": main_id,
            "subtype": None,
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

    # write back the new id into the current leaf slot
    if current_id_stack:
        current_id_stack[-1] = main_id

    return main_id

# ------- PROCESS PDF -------
for i in range(START_PAGE, doc.page_count):
    page = doc[i]
    page_num = i + 1
    blocks = page.get_text("blocks")

    for block in blocks:
        text = block[4]
        if not text:
            prev_line = None
            continue
        
        #print("I am in Block", block)  
        # reset prev_line at start of block to avoid matching headers/footers across blocks
        prev_line = None

        if text.startswith("Harmonized Tariff Schedule of the United States"):
            continue
        
                
        for raw_line in text.splitlines():
            line = normalize_line(raw_line)
            if not line:
                prev_line = None
                continue
            
            # IGNORE editorial / non-structural lines
            
            
            print("raw line", line)    
            
            normalized_line = normalize_line(line)
            
            if is_ignored_editorial_line(line):
                prev_line = line
                continue
            
            matched_gn = None

           # Case 1: GN number on previous line (with optional dot)
            prev_norm = normalize_gn_number(prev_line) if prev_line else None
            if prev_norm in general_notes_headers:
                gn_title = normalize_line(general_notes_headers[prev_norm]).lower()
                if normalized_line.lower().startswith(gn_title):
                    matched_gn = prev_norm

            # Case 2: GN number + title on SAME line (e.g. "4. Rates of Duty")
            else:
                m = re.match(r'^(\d+)\.?\s+(.*)$', normalized_line)
                if m:
                    gn_num = normalize_gn_number(m.group(1))
                    if gn_num in general_notes_headers:
                        gn_title = normalize_line(general_notes_headers[gn_num]).lower()
                        if m.group(2).lower().startswith(gn_title):
                            matched_gn = gn_num

            if matched_gn:
                # debug
                print(f"[GN MATCH] GN={matched_gn} page={page_num} preview={line[:120]!r}")

                # flush existing leaf (if any) for correct parent-child linkage
                if current_marker_stack:
                    flush_current_node()

                # reset stacks for new GN root (do not immediately insert — wait until leaf flush)
                current_marker_stack = [matched_gn]
                #current_level_stack = [matched_gn]
                current_id_stack = [None]
                buffer = line
                current_page = page_num
                in_general_notes = True
            else:
                # ---------- NESTED LEVEL DETECTION ----------
                if in_general_notes and current_marker_stack:
                    matched_level = None
                    matched_marker = None
                    marker_span_end = None

                    # iterate pattern tuples and match; matched_level is the actual level number
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
                            parent_index = find_accept_parent_index(current_level_stack, matched_level)
                            current_marker_stack = current_marker_stack[: parent_index + 1]
                            current_level_stack = current_level_stack[: parent_index + 1]
                            current_id_stack = current_id_stack[: parent_index + 1]
                            current_marker_stack.append(matched_marker)
                            current_level_stack.append(matched_level)
                            current_id_stack.append(None)
                            buffer = line[marker_span_end:].strip() if marker_span_end < len(line) else ""
                        else:
                            buffer += " " + line

                        current_page = page_num

                else:
                    
                    pass
            prev_line = line

if current_marker_stack:
    flush_current_node()

print("General Notes ingestion complete")
