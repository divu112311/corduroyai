import fitz, io, re
import os
from google.cloud import storage
from supabase import create_client
from datetime import datetime

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
TABLE_NAME = "hts_entries"

GCS_BUCKET = "corduroyai"
GCS_PDF_PATH = "tradedataraw/usitchts/finalCopy_2026HTSBasic.pdf"
START_PAGE = 25

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

GRI_HEADER = re.compile(r"GENERAL RULES OF INTERPRETATION", re.I)
STOP_HEADER = re.compile(r"Additional U\.S\. Rules of Interpretation", re.I)
RULE = re.compile(r"^\(?(\d+)\)?[\.\-]?\s+(.*)")

storage_client = storage.Client()
blob = storage_client.bucket(GCS_BUCKET).blob(GCS_PDF_PATH)
pdf = io.BytesIO()
blob.download_to_file(pdf)
pdf.seek(0)

doc = fitz.open(stream=pdf, filetype="pdf")

in_gri = False
current_rule = None
buffer = ""

for i in range(START_PAGE, doc.page_count):
    page = doc[i]
    page_num = i + 1
    for line in [l.strip() for l in page.get_text().split("\n") if l.strip()]:

        if not in_gri and GRI_HEADER.search(line):
            in_gri = True
            continue

        if in_gri and STOP_HEADER.search(line):
            if buffer:
                supabase.table(TABLE_NAME).insert({
                    "page": page_num,
                    "doc_type": "GRI",
                    "ref_id": current_rule,
                    "parent_id": None,
                    "subtype": None,
                    "marker": current_rule,
                    "seq": None,
                    "text": buffer.strip(),
                    "last_updated":datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }).execute()
            exit(0)

        if not in_gri:
            continue

        m = RULE.match(line)
        if m:
            if buffer:
                supabase.table(TABLE_NAME).insert({
                    "page": page_num,
                    "doc_type": "GRI",
                    "ref_id": current_rule,
                    "parent_id": None,
                    "subtype": None,
                    "marker": current_rule,
                    "seq": None,
                    "text": buffer.strip(),
                    "last_updated":datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }).execute()
            current_rule = m.group(1)
            buffer = m.group(2)
        else:
            buffer += " " + line
