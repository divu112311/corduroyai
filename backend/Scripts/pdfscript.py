import fitz  # PyMuPDF
from google.cloud import storage
from supabase import create_client, Client
import os
import json
import io
import re

# ---------------- CONFIG ----------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
TABLE_NAME = "hts_entries"
CHUNK_SIZE = 1000  # characters per row for embeddings
PROGRESS_FILE = "progress.json"  # to resume ingestion
GCS_BUCKET = "corduroyai"
GCS_PDF_PATH = "tradedataraw/usitchts/finalCopy_2026HTSBasic.pdf"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------------- PROGRESS ----------------
if os.path.exists(PROGRESS_FILE):
    with open(PROGRESS_FILE, "r") as f:
        progress = json.load(f)
        last_page = progress.get("last_page", 0)
        
else:
    last_page = 0

def save_progress(page_num):
    with open(PROGRESS_FILE, "w") as f:
        json.dump({"last_page": page_num}, f)

# ---------------- REGEX ----------------
CHAPTER_PATTERN = re.compile(r"Chapter\s+(\d+)\s*–\s*(.+)", re.IGNORECASE)
GRI_PATTERN = re.compile(r"GRI\s+(\d+)(?:\s*\(Chapter\s*(\d+)\))?", re.IGNORECASE)
FOOTNOTE_PATTERN = re.compile(r"^\d+\s+")  # simple footnote line start

def extract_chunks(text, chunk_size=CHUNK_SIZE):
    text = text.strip()
    if len(text) <= chunk_size:
        return [text]
    return [text[i:i+chunk_size] for i in range(0, len(text), chunk_size)]

# ---------------- GCS PDF STREAM ----------------
storage_client = storage.Client()
bucket = storage_client.bucket(GCS_BUCKET)
blob = bucket.blob(GCS_PDF_PATH)
pdf_stream = io.BytesIO()
blob.download_to_file(pdf_stream)
pdf_stream.seek(0)

# ---------------- OPEN PDF ----------------
doc = fitz.open(stream=pdf_stream, filetype="pdf")

# ---------------- PROCESS PAGES ----------------
for page_num in range(last_page, doc.page_count):
    page = doc[page_num]
    text = page.get_text()
    lines = [line.strip() for line in text.split("\n") if line.strip()]

    chapter = None
    gri = None
    rows_to_insert = []

    for line in lines:
        # Detect chapter
        chap_match = CHAPTER_PATTERN.search(line)
        if chap_match:
            chapter = f"{chap_match.group(1)} – {chap_match.group(2)}"
            continue

        # Detect GRI
        gri_match = GRI_PATTERN.search(line)
        if gri_match:
            gri = f"GRI {gri_match.group(1)}"
            if gri_match.group(2):
                gri += f" (Chapter {gri_match.group(2)})"
            continue

        # Detect footnote
        footnote = None
        if FOOTNOTE_PATTERN.match(line):
            footnote = line

        # Split long lines into chunks
        chunks = extract_chunks(line)
        for chunk in chunks:
            row = {
                "page": page_num + 1,
                "chapter": chapter,
                "gri": gri,
                "footnote": footnote,
                "text": chunk
            }
            rows_to_insert.append(row)

    # ---------------- BATCH INSERT ----------------
    if rows_to_insert:
        try:
            supabase.table(TABLE_NAME).insert(rows_to_insert).execute()
        except Exception as e:
            print(f"Error inserting page {page_num+1}: {e}")

    # Save progress
    save_progress(page_num + 1)


    print(f"Processed page {page_num+1}/{doc.page_count}")

print("HTS PDF ingestion complete!")
