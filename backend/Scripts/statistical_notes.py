import fitz, io, re
from google.cloud import storage
from supabase import create_client
from datetime import datetime
import os

# ---------------- CONFIG ----------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

TABLE_NAME = "hts_entries"

GCS_BUCKET = "corduroyai"
GCS_PDF_PATH = "tradedataraw/usitchts/finalCopy_2026HTSBasic.pdf"
START_PAGE = 20

# ---------------- INIT ----------------
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------------- REGEX ----------------
ADDRULES_HEADER = re.compile(r"GENERAL STATISTICAL NOTES", re.I)
STOP_HEADER = re.compile(r"NOTICE TO EXPORTERS", re.I)
MAIN_RULE = re.compile(r"^(\d+)\.$")          # 1. 2. 3.
SUB_RULE  = re.compile(r"^\(([a-zA-Z])\)$")   # (a) (b) (c)
TERT_RULE = re.compile(r"^\(([ivxlcdm]+)\)$", re.I)  # (i) (ii) (iii)
PAGE_HEADER = re.compile(
    r"Harmonized Tariff Schedule of the United States\s*\(2026\)|Annotated for Statistical Reporting Purposes",
    re.I
)

# ---------------- LOAD PDF ----------------
storage_client = storage.Client()
blob = storage_client.bucket(GCS_BUCKET).blob(GCS_PDF_PATH)

pdf_stream = io.BytesIO()
blob.download_to_file(pdf_stream)
pdf_stream.seek(0)

doc = fitz.open(stream=pdf_stream, filetype="pdf")

# ---------------- STATE ----------------
in_gri = False
current_main = None
current_sub = None
buffer = ""
stop_doc = False 
current_parent = None
current_main_ref = None
current_main_id = None
buffer_parent_id = None     
rule_page_num = None
inserted_id = None

# ---------------- PROCESS ----------------
for i in range(START_PAGE, doc.page_count):
    if stop_doc:
        break  
    page = doc[i]
    page_num = i + 1

    blocks = page.get_text("blocks")
    for block in blocks:
        text = block[4].strip()
        if not text:
            continue

        # skip header
        if text.startswith("Harmonized Tariff Schedule of the United States"):
            continue

        # detect notes start
        if not in_gri and ADDRULES_HEADER.search(text):
            in_gri = True
            continue

        # detect end
        if in_gri and STOP_HEADER.search(text):
            if buffer:
                supabase.table(TABLE_NAME).insert({
                    "page": rule_page_num,
                    "doc_type": "Statistical Notes",
                    "ref_id": current_main_ref,
                    "parent_id": buffer_parent_id,
                    "subtype": None,
                    "marker": current_main_ref,
                    "seq": None,
                    "text": buffer.strip(),
                    "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }).execute()
            stop_doc = True
            break

        if not in_gri:
            continue

        # skip page headers
        if PAGE_HEADER.search(text):
            continue

        m_main = MAIN_RULE.match(text)
        m_sub = SUB_RULE.match(text)
        m_tert = TERT_RULE.match(text)

        if m_main:
            # save previous buffer
            if buffer:
                supabase.table(TABLE_NAME).insert({
                    "page": rule_page_num,
                    "doc_type": "Statistical Notes",
                    "ref_id": current_main_ref,
                    "parent_id": buffer_parent_id,
                    "subtype": None,
                    "marker": current_main_ref,
                    "seq": None,
                    "text": buffer.strip(),
                    "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }).execute()

            current_main = m_main.group(1)
            current_main_ref = current_main
            rule_page_num = page_num
            buffer = text
            buffer_parent_id = None
            continue

        if m_sub:
            buffer += " " + text
            continue

        if m_tert:
            buffer += " " + text
            continue

        buffer += " " + text

print("Statistical Notes ingestion complete!")
