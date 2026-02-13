# generate_embeddings.py - Standalone embedding generation script
import json
import os
import time
from tqdm import tqdm


#from google.cloud import storage
from embedding_service import EmbeddingService
from pinecone_service import PineconeService
import config

# ============ CONFIG ============
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
NAMESPACE = "hts-embeddings"
BATCH_SIZE = 50  # Pinecone upsert batch size
EMBEDDING_BATCH_SIZE = 100 # OpenAI embedding batch size
CHECK_INTERVAL = 30 * 60 
# Files
PROGRESS_FILE = "embedding_progress_1.json"
LOCAL_DOCS_FILE = "hts_rich_docs_v2.json"

# ============ HELPER FUNCTIONS ============


def load_docs_from_local():
    """Load rich docs from local file"""
    print(" Loading documents from local file...", flush=True)
    with open(LOCAL_DOCS_FILE, "r") as f:
        docs = json.load(f)
    print(f"   Loaded {len(docs)} documents", flush=True)
    return docs

def load_progress():
    """Load already processed HTS codes"""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r") as f:
            codes = set(json.load(f))
        print(f"Loaded {len(codes)} already embedded codes", flush=True)
        return codes
    return set()

def save_progress(processed_codes):
    """Save processed HTS codes"""
    with open(PROGRESS_FILE, "w") as f:
        json.dump(list(processed_codes), f)

def sync_with_pinecone(pinecone_service, all_codes):
    """Sync progress with what's already in Pinecone"""
    print("🔄 Syncing with Pinecone to find already embedded codes...", flush=True)
    
    existing_codes = set()
    batch_size = 1000
    
    for i in range(0, len(all_codes), batch_size):
        batch_codes = all_codes[i:i + batch_size]
        print(f"   Checking batch {i//batch_size + 1}/{(len(all_codes)-1)//batch_size + 1}...", flush=True)
        
        try:
            results = pinecone_service.index.fetch(ids=batch_codes, namespace=pinecone_service.namespace)
            existing_codes.update(results.vectors.keys())
        except Exception as e:
            print(f"   ⚠️ Error fetching batch: {e}", flush=True)
    
    print(f"✅ Found {len(existing_codes)} codes already in Pinecone", flush=True)
    return existing_codes

def main():
    print("=" * 80, flush=True)
    print("EMBEDDING GENERATION SCRIPT", flush=True)
    print("=" * 80, flush=True)
    print(f"Started at: {time.strftime('%Y-%m-%d %H:%M:%S')}", flush=True)
    
    # ============ LOAD DOCUMENTS ============
    if os.path.exists(LOCAL_DOCS_FILE):
        all_docs = load_docs_from_local()
        print(f"   Saved to {LOCAL_DOCS_FILE} for faster access", flush=True)
    
    # ============ INITIALIZE SERVICES ============
    print("\n🔧 Initializing services...", flush=True)
    
    try:
        embedding_service = EmbeddingService(api_key=OPENAI_API_KEY)
    except Exception as e:
        print(f"❌ Failed to initialize embedding service: {e}", flush=True)
        return
    
    try:
        pinecone = PineconeService(api_key=PINECONE_API_KEY, namespace=NAMESPACE)
        pinecone.create_index_if_not_exists()
        pinecone.connect_to_index()
        print("   ✓ Connected to Pinecone", flush=True)
    except Exception as e:
        print(f"❌ Failed to connect to Pinecone: {e}", flush=True)
        return
    
    # ============ SYNC PROGRESS ============
    # First load from progress file
    processed_codes = load_progress()
    
    # If progress file is empty or doesn't exist, sync with Pinecone
    if len(processed_codes) == 0:
        all_codes = [doc['htsno'] for doc in all_docs]
        processed_codes = sync_with_pinecone(pinecone, all_codes)
        save_progress(processed_codes)
        print(f"💾 Synced progress saved to {PROGRESS_FILE}", flush=True)
    
    # Filter remaining docs
    remaining_docs = [doc for doc in all_docs if doc['htsno'] not in processed_codes]
    print(f"\n📊 Progress: {len(processed_codes)} / {len(all_docs)} done", flush=True)
    print(f"📊 Remaining: {len(remaining_docs)}", flush=True)
    
    if len(remaining_docs) == 0:
        print("\n✅ All embeddings already complete!", flush=True)
        return
    
    # ============ GENERATE EMBEDDINGS IN BATCHES ============
    print(f"\n🚀 Starting embedding generation...", flush=True)
    print(f"   Embedding batch size: {EMBEDDING_BATCH_SIZE}", flush=True)
    print(f"   Pinecone upsert batch size: {BATCH_SIZE}", flush=True)
    
    total_batches = (len(remaining_docs) - 1) // EMBEDDING_BATCH_SIZE + 1
    
    for batch_idx in range(0, len(remaining_docs), EMBEDDING_BATCH_SIZE):
        batch_docs = remaining_docs[batch_idx:batch_idx + EMBEDDING_BATCH_SIZE]
        current_batch = batch_idx // EMBEDDING_BATCH_SIZE + 1
        
        print(f"\n📦 Batch {current_batch}/{total_batches} ({len(batch_docs)} docs)", flush=True)
        print(f"   Time: {time.strftime('%Y-%m-%d %H:%M:%S')}", flush=True)
        
        # Extract texts for embedding
        texts = [doc['rich_doc'] for doc in batch_docs]
        
        # Generate embeddings with retry
        max_retries = 3
        embeddings = None
        
        for attempt in range(max_retries):
            try:
                print("   ⏳ Generating embeddings...", flush=True)
                start_time = time.time()
                embeddings = embedding_service.encode_batch(texts)
                elapsed = time.time() - start_time
                print(f"   ✓ Generated {len(embeddings)} embeddings in {elapsed:.1f}s", flush=True)
                break
            except Exception as e:
                print(f"   ⚠️ Attempt {attempt + 1} failed: {e}", flush=True)
                if attempt < max_retries - 1:
                    wait_time = 60 * (attempt + 1)
                    print(f"   ⏳ Waiting {wait_time}s before retry...", flush=True)
                    time.sleep(wait_time)
                else:
                    print("   ❌ All retries failed. Saving progress and exiting...", flush=True)
                    save_progress(processed_codes)
                    return
        
        if embeddings is None:
            print("   ❌ Failed to generate embeddings. Exiting...", flush=True)
            save_progress(processed_codes)
            return
        
        # Prepare vectors for Pinecone
        vectors = []
        for i, doc in enumerate(batch_docs):
            vectors.append({
            'id': doc['htsno'],
            'values': embeddings[i],
            'metadata': doc.get('metadata', {})  # Use the precomputed metadata in the JSON
            })
        # Upsert to Pinecone in smaller batches with retry
        for attempt in range(max_retries):
            try:
                print("   ⏳ Uploading to Pinecone...", flush=True)
                for i in range(0, len(vectors), BATCH_SIZE):
                    pinecone_batch = vectors[i:i + BATCH_SIZE]
                    pinecone.upsert_batch(pinecone_batch)
                print(f"   ✓ Uploaded {len(vectors)} vectors", flush=True)
                break
            except Exception as e:
                print(f"   ⚠️ Pinecone attempt {attempt + 1} failed: {e}", flush=True)
                if attempt < max_retries - 1:
                    wait_time = 60 * (attempt + 1)
                    print(f"   ⏳ Waiting {wait_time}s before retry...", flush=True)
                    time.sleep(wait_time)
                else:
                    print("   ❌ All retries failed. Saving progress and exiting...", flush=True)
                    save_progress(processed_codes)
                    return
        
        # Update progress
        for doc in batch_docs:
            processed_codes.add(doc['htsno'])
        
        # Save progress after each batch
        save_progress(processed_codes)
        print(f"   💾 Progress saved: {len(processed_codes)}/{len(all_docs)}", flush=True)
        
        # Small delay between batches
        time.sleep(2)
    
    print("\n" + "=" * 80, flush=True)
    print("✅ EMBEDDING GENERATION COMPLETE!", flush=True)
    print(f"   Total embedded: {len(processed_codes)}", flush=True)
    print(f"   Finished at: {time.strftime('%Y-%m-%d %H:%M:%S')}", flush=True)
    print("=" * 80, flush=True)

if __name__ == "__main__":
    while True:
        try:
            print(f"\n🕒 Starting embedding check at {time.strftime('%Y-%m-%d %H:%M:%S')}")
            main()  # your existing main() function
            print(f"✅ Embedding check complete. Sleeping for {CHECK_INTERVAL//60} minutes...\n")
        except Exception as e:
            print(f"❌ Error during embedding run: {e}")
        
        time.sleep(CHECK_INTERVAL)