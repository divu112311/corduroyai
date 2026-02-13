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
START_PAGE = 800 # start from first page

# ---------------- INIT ----------------
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------------- LOAD SECTIONS ----------------
sections = supabase.table("sections").select("*").execute().data
# Sort sections by code if needed
sections = sorted(sections, key=lambda x: x['code'])
SECTION_LINE_RE = lambda code: re.compile(
    rf"^\s*SECTION\s+{re.escape(code)}\s*$",
    re.I
)

# ---------------- LOAD PDF ----------------
storage_client = storage.Client()
blob = storage_client.bucket(GCS_BUCKET).blob(GCS_PDF_PATH)
pdf_stream = io.BytesIO()
blob.download_to_file(pdf_stream)
pdf_stream.seek(0)
doc = fitz.open(stream=pdf_stream, filetype="pdf")

# ---------------- REGEX ----------------
STOP_HEADER = re.compile(r"^\s*CHAPTER\b.*$", re.I)

# ---------------- PROCESS ----------------
for sec in sections:
    #section_code = sec['code']
    

    section_code = sec['code']    # e.g., 'I'
    #section_title = sec['title']  # e.g., 'LIVE ANIMALS'
    section_re = SECTION_LINE_RE(section_code)
    
    # Section header line in PDF
    section_line = f"SECTION {section_code}".upper()
    print("Section matching", section_line)
    in_section = False
    buffer = ""
    rule_page_num = None
    
    for i in range(START_PAGE, doc.page_count):
        page = doc[i]
        page_num = i + 1
        blocks = page.get_text("blocks")
        
        for block in blocks:
            text = block[4].strip()
            if not text:
                continue

            
            if text.startswith("Harmonized Tariff Schedule of the United States"):
                continue
        
            line_upper = text.upper()

            # Start capturing when the section header is found
            if not in_section and section_re.match(line_upper):
                in_section = True
                rule_page_num = page_num
                remainder = line_upper.split(section_line, 1)[-1].strip()
                buffer = section_line + (" " + remainder if remainder else "")
                continue

            # Collect all text until CHAPTER appears
            if in_section:
                if STOP_HEADER.match(line_upper):
                    in_section = False
                    break
                buffer += " " + " ".join(text.split())

    # Insert into DB only if buffer has text beyond header
    if buffer.strip() != section_line:
        res = supabase.table(TABLE_NAME).insert({
            "page": rule_page_num,
            "doc_type": "Sections",
            "ref_id": section_code,
            "parent_id": None,
            "subtype": None,
            "marker": None,
            "seq": None,
            "text": buffer.strip(),
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }).execute()
        print(f"Inserted section {section_code}")
    else:
        print(f"No content found for section {section_code}")

print("All sections processed")
