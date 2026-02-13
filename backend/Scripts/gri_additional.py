import fitz  # PyMuPDF
from google.cloud import storage
from supabase import create_client, Client
import os
import io
import json
import re

# ---------------- CONFIG ----------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
TABLE_NAME = "hts_entries"
PROGRESS_FILE = "progress.json"

GCS_BUCKET = "corduroyai"
GCS_PDF_PATH = "tradedataraw/usitchts/finalCopy_2026HTSBasic.pdf"

START_PAGE = 20  # skip TOC

# ---------------- INIT ----------------
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------------- LOAD GENERAL NOTES FROM DB ----------------
gn_rows = supabase.table("general_note") \
    .select("general_note_number, name") \
    .execute() \
    .data

GENERAL_NOTE_LOOKUP = {
    row["general_note_number"]: row["name"].strip()
    for row in gn_rows
}

GENERAL_NOTE_NAME_SET = {
    row["name"].strip().lower()
    for row in gn_rows
}

# ---------------- PROGRESS ----------------
if os.path.exists(PROGRESS_FILE):
    with open(PROGRESS_FILE, "r") as f:
        last_page = json.load(f).get("last_page", START_PAGE)
else:
    last_page = START_PAGE

def save_progress(page_num):
    with open(PROGRESS_FILE, "w") as f:
        json.dump({"last_page": page_num}, f)

# ---------------- REGEX ----------------
GRI_HEADER = re.compile(r"GENERAL RULES OF INTERPRETATION", re.I)
ADDITIONAL_HEADER = re.compile(r"Additional U\.S\. Rules of Interpretation", re.I)
SECTION_HEADER = re.compile(r"^Section\s+([IVXLCDM]+)", re.I)
CHAPTER_HEADER = re.compile(r"^Chapter\s+(\d+)", re.I)
NUMBERED_RULE = re.compile(r"^\(?([0-9]+[a-zA-Z]?)\)?[\.\-]?\s+(.*)")

# ---------------- GCS PDF ----------------
storage_client = storage.Client()
bucket = storage_client.bucket(GCS_BUCKET)
blob = bucket.blob(GCS_PDF_PATH)

pdf_stream = io.BytesIO()
blob.download_to_file(pdf_stream)
pdf_stream.seek(0)

doc = fitz.open(stream=pdf_stream, filetype="pdf")

# ---------------- STATE ----------------
state = None  # GRI / ADDITIONAL / GENERAL_NOTE / SECTION / CHAPTER
current_parent = None
buffer = ""

# ---------------- FLUSH ----------------
def flush(page, doc_type, marker, parent_id):
    global buffer
    if not buffer.strip():
        return

    supabase.table(TABLE_NAME).insert({
        "page": page,
        "doc_type": doc_type,
        "ref_id": marker,
        "parent_id": parent_id,
        "subtype": None,
        "marker": marker,
        "seq": None,
        "text": buffer.strip()
    }).execute()

    buffer = ""

# ---------------- PROCESS ----------------
for i in range(last_page, doc.page_count):
    page_num = i + 1
    lines = [l.strip() for l in doc[i].get_text().split("\n") if l.strip()]
    print(f"📄 Page {page_num}")

    for line in lines:
        lower_line = line.lower()

        # -------- HEADERS --------
        if GRI_HEADER.search(line):
            flush(page_num, state, current_parent, current_parent)
            state = "GRI"
            current_parent = None
            continue

        if ADDITIONAL_HEADER.search(line):
            flush(page_num, state, current_parent, current_parent)
            state = "ADDITIONAL"
            current_parent = None
            continue

        # -------- GENERAL NOTE (DB-DRIVEN) --------
        if lower_line in GENERAL_NOTE_NAME_SET:
            flush(page_num, state, current_parent, current_parent)

            matched_number = next(
                k for k, v in GENERAL_NOTE_LOOKUP.items()
                if v.lower() == lower_line
            )

            state = "GENERAL_NOTE"
            current_parent = f"GN_{matched_number}"
            buffer = ""
            continue

        # -------- SECTION / CHAPTER END GENERAL NOTES --------
        if SECTION_HEADER.match(line) or CHAPTER_HEADER.match(line):
            if state == "GENERAL_NOTE":
                flush(page_num, state, current_parent, current_parent)
                state = None
                current_parent = None

        # -------- NUMBERED RULES --------
        m = NUMBERED_RULE.match(line)
        if m and state in ("GRI", "ADDITIONAL"):
            flush(page_num, state, current_parent, current_parent)
            current_parent = m.group(1)
            buffer = m.group(2)
            continue

        # -------- CONTINUATION --------
        if state:
            buffer += " " + line

    flush(page_num, state, current_parent, current_parent)
    save_progress(page_num)

print("✅ DONE")
