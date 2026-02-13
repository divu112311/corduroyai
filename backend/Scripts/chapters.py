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
START_PAGE = 800

# ---------------- INIT ----------------
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------------- LOAD CHAPTERS ----------------
chapters = supabase.table("chapters").select("*").execute().data
chapters = sorted(chapters, key=lambda x: x['code'])

# ---------------- LOAD PDF ----------------
storage_client = storage.Client()
blob = storage_client.bucket(GCS_BUCKET).blob(GCS_PDF_PATH)
pdf_stream = io.BytesIO()
blob.download_to_file(pdf_stream)
pdf_stream.seek(0)
doc = fitz.open(stream=pdf_stream, filetype="pdf")

# ---------------- TABLE SIGNALS ----------------
TABLE_SIGNALS = {
    "HEADING", "SUBHEADING", "RATES OF DUTY", "UNIT", "QUANTITY",
    "ARTICLE DESCRIPTION", "STAT", "SUF", "FIX", "SPECIAL", "GENERAL"
}
TABLE_SIGNAL_THRESHOLD = 5  # number of signals to detect table start

# ---------------- PROCESS CHAPTERS ----------------
for chap in chapters:
    chapter_code = str(chap['code']).strip()
    chapter_title = chap.get('title', '').strip()
    # Strict single-line match for chapter header
    chapter_re = re.compile(rf"^\s*CHAPTER\s+{re.escape(chapter_code)}\s*$", re.I)

    print(f"\nProcessing Chapter {chapter_code} - {chapter_title}")
    in_chapter = False
    buffer = []
    rule_page_num = None
    consecutive_signals = set()

    for i in range(START_PAGE, doc.page_count):
        page = doc[i]
        page_num = i + 1
        blocks = page.get_text("blocks")

        for block in blocks:
            for line in block[4].splitlines():
                line = line.strip()
                if not line:
                    continue

                if line.startswith("Harmonized Tariff Schedule of the United States"):
                    continue    

                line_upper = line.upper()

                # ---------------- START CHAPTER ----------------
                if not in_chapter and chapter_re.match(line_upper):
                    in_chapter = True
                    rule_page_num = page_num
                    print(f"→ Found chapter start on page {page_num}: {line}")
                    continue  # start collecting from next line

                # ---------------- COLLECT CHAPTER TEXT ----------------
                if in_chapter:
                    # Count table signals
                    for signal in TABLE_SIGNALS:
                        if signal in line_upper:
                            consecutive_signals.add(signal)

                    # Stop chapter if table detected
                    if len(consecutive_signals) >= TABLE_SIGNAL_THRESHOLD:
                        in_chapter = False
                        print(f"→ Table detected with signals {consecutive_signals}, stopping chapter")
                        break

                    buffer.append(line)

        if not in_chapter and buffer:
            break  # stop scanning pages for this chapter

    chapter_text = " ".join(buffer).strip()
    if chapter_text:
        res = supabase.table(TABLE_NAME).insert({
            "page": rule_page_num,
            "doc_type": "Chapters",
            "ref_id": chapter_code,
            "parent_id": None,
            "subtype": None,
            "marker": None,
            "seq": None,
            "text": chapter_text,
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }).execute()
        print(f"✅ Inserted chapter {chapter_code} (page {rule_page_num})")
    else:
        print(f"No content found for chapter {chapter_code}")

print("\nAll chapters processed")
