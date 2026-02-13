import os
import io
import json
from tqdm import tqdm
from google.cloud import storage
import fitz  # PyMuPDF
from openai import OpenAI
import pinecone

# ---------------- CONFIG ----------------
GCS_BUCKET = "corduroyai"
GCS_PDF_PATH = "tradedataraw/usitchts/finalCopy_2026HTSBasic.pdf"

PINECONE_INDEX = "hts-embeddings"
EMBED_MODEL = "text-embedding-3-large"

CHUNK_SIZE = 1200
CHUNK_OVERLAP = 200

PROGRESS_FILE = "hts_pdf_progress.json"
# ---------------------------------------

# Clients
openai = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

pinecone.init(
    api_key=os.getenv("PINECONE_API_KEY"),
    environment=os.getenv("PINECONE_ENVIRONMENT")
)
index = pinecone.Index(PINECONE_INDEX)

storage_client = storage.Client()

# ---------- Progress ----------
if os.path.exists(PROGRESS_FILE):
    with open(PROGRESS_FILE, "r") as f:
        progress = json.load(f)
        start_page = progress.get("page", 0)
else:
    start_page = 0

def save_progress(page):
    with open(PROGRESS_FILE, "w") as f:
        json.dump({"page": page}, f)

# ---------- Helpers ----------
def chunk_text(text):
    chunks = []
    start = 0
    text = text.strip()
    while start < len(text):
        end = start + CHUNK_SIZE
        chunks.append(text[start:end])
        start = end - CHUNK_OVERLAP
    return chunks

def embed_batch(texts):
    resp = openai.embeddings.create(
        model=EMBED_MODEL,
        input=texts
    )
    return [r.embedding for r in resp.data]

# ---------- Load PDF from GCS ----------
print("Downloading PDF from GCS...")
bucket = storage_client.bucket(GCS_BUCKET)
blob = bucket.blob(GCS_PDF_PATH)
pdf_bytes = blob.download_as_bytes()

doc = fitz.open(stream=pdf_bytes, filetype="pdf")

print(f"PDF loaded. Total pages: {doc.page_count}")
print(f"Resuming from page: {start_page + 1}")

# ---------- Main Loop ----------
for page_num in range(start_page, doc.page_count):
    page = doc[page_num]
    text = page.get_text("text").strip()

    if not text:
        save_progress(page_num + 1)
        continue

    chunks = chunk_text(text)

    vectors = []
    embeddings = embed_batch(chunks)

    for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        vector_id = f"hts-p{page_num+1}-c{i}"
        vectors.append({
            "id": vector_id,
            "values": emb,
            "metadata": {
                "page": page_num + 1,
                "chunk": i,
                "source": "HTS 2026 PDF",
                "text": chunk
            }
        })

    index.upsert(vectors=vectors)
    save_progress(page_num + 1)

    print(f"Embedded page {page_num + 1}/{doc.page_count}")

print("HTS PDF embedding complete.")
