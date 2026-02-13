import fitz, io, re
import os
from google.cloud import storage
from supabase import create_client
from datetime import datetime

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
general_notes_headers = {str(item["general_note_number"]): item["name"] for item in gn_resp.data}
print("Number of general note items:", len(general_notes_headers))
#sorted_gn_numbers = sorted(general_notes_headers.keys(), key=int)
current_gn_index = 0  # start with the first general note
# Sort headers numerically to process in order
sorted_headers = sorted(general_notes_headers.items(), key=lambda x: int(x[0]))

# ---------------- NESTING REGEX PATTERNS (Level 2+) ----------------
LEVEL_PATTERNS = [
    re.compile(r"^-?\s*([a-z])\)?\s*"),           # Level 2: a) or - a
    re.compile(r"^([ivxlcdm]+)\)?\s*", re.I),     # Level 3: small Roman i)
    re.compile(r"^([A-Z])\)?\s*"),                # Level 4: A)
    re.compile(r"^(\d+)\)?\s*"),                  # Level 5: 1)
    re.compile(r"^([IVXLCDM]+)\)?\s*")            # Level 6: I)
]

# ---------------- STATE ----------------
current_marker_stack = []  # Stack of markers (e.g., ['3','a','i'])
current_level_stack = []   # Stack of DB ids for parent-child
buffer = ""
current_page = None
inserted_id = None
in_general_notes = False
prev_line=None

# ---------------- PROCESS ----------------
for i in range(START_PAGE, doc.page_count):
    page = doc[i]
    page_num = i + 1
    blocks = page.get_text("blocks")

    for block in blocks:
        text = block[4].strip()
               
        if not text:
            continue
        
        for line in text.splitlines():
            line = line.strip()
            print("line text", line)
            
            if not line:
                continue
        
            matched_note = None
            matched_title = None
            if prev_line is not None:
             # --- LEVEL 1: GENERALNOTE HEADER ---
                for gn_num, gn_title in sorted_headers:
                    print("Printing GNnum and GN Title", gn_num, gn_title)
                    print("Prev line", prev_line)
                
                    if prev_line == gn_num and line.startswith(gn_title):  # allow partial match
                        matched_note = gn_num
                        matched_title = gn_title
                        break
   
        
            if matched_note:
                print("in matched note")   
            
                if buffer:
                        
                    parent_id = current_level_stack[-1] if current_level_stack else None
                    marker = "-".join(current_marker_stack)
                    res = supabase.table(TABLE_NAME).insert({
                        "page": current_page,
                        "doc_type": "General Note",
                        "ref_id": current_marker_stack[-1] if current_marker_stack else gn_num,
                        "parent_id": parent_id,
                        "subtype": None,
                        "marker": marker,
                        "seq": None,
                        "text": buffer.strip(),
                        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }).execute()
                
                    inserted_id = res.data[0]["id"]
                    buffer = ""

                # Start new General Note
                current_note_num = matched_note
                current_marker_stack = [gn_num]
                current_level_stack = [None]  # top-level has no parent
                buffer = line.strip()
                current_page = page_num
                general_notes = True
                current_gn_index += 1
                break  # matched Level 1

            #if not in_general_notes:
             #   continue

        # --- Normal nested detection / append to buffer ---
        # LEVEL_PATTERNS logic goes here
            buffer += " " + line
            current_page = page_num

            prev_line = line   
        
        # --- LEVEL 2+ NESTED DETECTION ---
            
        matched_level = None
        matched_marker = None
            
        for lvl, pattern in enumerate(LEVEL_PATTERNS, start=1):  # start=1 because Level 1 is header
            m = pattern.match(line)
            if m:
                matched_level = lvl
                matched_marker = m.group(1)
                break

            if matched_level is not None:
                # Insert previous buffer before updating stacks
                if buffer:
                    parent_id = current_level_stack[matched_level - 1] if matched_level > 0 else None
                    marker = "-".join(current_marker_stack[:matched_level])
                    res = supabase.table(TABLE_NAME).insert({
                        "page": current_page,
                        "doc_type": "General Note",
                        "ref_id": current_marker_stack[matched_level - 1] if matched_level > 0 else current_marker_stack[0],
                        "parent_id": parent_id,
                        "subtype": None,
                        "marker": marker,
                        "seq": None,
                        "text": buffer.strip(),
                        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }).execute()
                    inserted_id = res.data[0]["id"]
                    buffer = ""

                # Trim stacks to current level
                if len(current_marker_stack) > matched_level:
                    current_marker_stack = current_marker_stack[:matched_level]
                    current_level_stack = current_level_stack[:matched_level]

                # Push new level
                current_marker_stack.append(matched_marker)
                current_level_stack.append(inserted_id)

                # Remove marker from line for buffer
                buffer = line[m.end():].strip()
                current_page = page_num
            
            else:
                # Append text to current buffer
                buffer += " " + line
                current_page = page_num

# --- INSERT FINAL BUFFER ---
if buffer:
    parent_id = current_level_stack[-1] if current_level_stack else None
    marker = "-".join(current_marker_stack)
    supabase.table(TABLE_NAME).insert({
        "page": current_page,
        "doc_type": "General Note",
        "ref_id": current_marker_stack[-1] if current_marker_stack else None,
        "parent_id": parent_id,
        "subtype": None,
        "marker": marker,
        "seq": None,
        "text": buffer.strip(),
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }).execute()

print("✅ General Notes ingestion complete")
