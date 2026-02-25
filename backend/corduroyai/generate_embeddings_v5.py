"""
generate_embeddings_v5.py — VM script

Self-contained: downloads v5 from GCS, embeds with OpenAI, upserts to NEW Pinecone index.
Old index 'hts-embeddings' stays untouched as backup.

Run on VM:
  1. Upload:  gcloud.cmd storage cp generate_embeddings_v5.py gs://corduroyai/
  2. On VM:   gcloud storage cp gs://corduroyai/generate_embeddings_v5.py .
  3. On VM:   nohup python3 generate_embeddings_v5.py > embed_v5.log 2>&1 &
  4. Monitor: tail -f embed_v5.log

Requires on VM: pip install openai pinecone-client
API keys: loaded from GCP Secret Manager

Cost estimate: ~$0.07 (26,630 codes x ~120 tokens x $0.02/1M tokens)
Time estimate: ~20 minutes
"""

import json
import os
import subprocess
import time

# ============ CONFIG ============
INDEX_NAME = "hts-embeddings-v5"
NAMESPACE = "hts-v5"
DIMENSION = 1536
METRIC = "cosine"
CLOUD = "aws"
REGION = "us-east-1"
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_BATCH_SIZE = 100  # OpenAI batch size
PINECONE_BATCH_SIZE = 50    # Pinecone upsert batch size
MAX_RETRIES = 3

GCS_BUCKET = "gs://corduroyai"
V5_FILE = "hts_rich_docs_v5.json"
PROGRESS_FILE = "embedding_progress_v5.json"

GCP_PROJECT = "project-1fe125c4-7788-4a50-8cf"


# ============ API KEY LOADING ============
def get_secret(secret_name):
    """Load secret from GCP Secret Manager."""
    cmd = f'gcloud secrets versions access latest --secret="{secret_name}" --project="{GCP_PROJECT}"'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        # Fallback to env var
        env_val = os.getenv(secret_name, "")
        if env_val:
            print(f"  Loaded {secret_name} from env var", flush=True)
            return env_val
        raise RuntimeError(f"Failed to get secret {secret_name}: {result.stderr.strip()}")
    return result.stdout.strip()


# ============ DOWNLOAD FROM GCS ============
def ensure_v5_file():
    """Download v5 from GCS if not present locally."""
    if os.path.exists(V5_FILE):
        size_mb = os.path.getsize(V5_FILE) / 1024 / 1024
        print(f"  {V5_FILE} already exists ({size_mb:.1f} MB)", flush=True)
        return
    print(f"  Downloading {V5_FILE} from GCS...", flush=True)
    result = subprocess.run(
        f"gcloud storage cp {GCS_BUCKET}/{V5_FILE} .",
        shell=True, capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"Failed to download: {result.stderr.strip()}")
    size_mb = os.path.getsize(V5_FILE) / 1024 / 1024
    print(f"  Downloaded ({size_mb:.1f} MB)", flush=True)


# ============ PROGRESS TRACKING ============
def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r") as f:
            codes = set(json.load(f))
        print(f"  Loaded {len(codes)} already-embedded codes from progress file", flush=True)
        return codes
    return set()


def save_progress(processed_codes):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(list(processed_codes), f)


# ============ MAIN ============
def main():
    start_time = time.time()
    print("=" * 60, flush=True)
    print("EMBEDDING GENERATION V5", flush=True)
    print(f"Index: {INDEX_NAME}  |  Namespace: {NAMESPACE}", flush=True)
    print(f"Model: {EMBEDDING_MODEL}  |  Dimension: {DIMENSION}", flush=True)
    print(f"Started: {time.strftime('%Y-%m-%d %H:%M:%S')}", flush=True)
    print("=" * 60, flush=True)

    # Step 1: Download v5
    print("\n--- Step 1: Load data ---", flush=True)
    ensure_v5_file()

    with open(V5_FILE, "r", encoding="utf-8") as f:
        all_docs = json.load(f)
    print(f"  {len(all_docs)} codes loaded", flush=True)

    # Step 2: Load API keys
    print("\n--- Step 2: Load API keys ---", flush=True)
    openai_key = get_secret("OPENAI_API_KEY")
    pinecone_key = get_secret("PINECONE_API_KEY")
    print(f"  OpenAI key: ...{openai_key[-6:]}", flush=True)
    print(f"  Pinecone key: ...{pinecone_key[-6:]}", flush=True)

    # Step 3: Initialize OpenAI
    print("\n--- Step 3: Initialize OpenAI ---", flush=True)
    from openai import OpenAI
    client = OpenAI(api_key=openai_key)
    # Quick test
    test_resp = client.embeddings.create(model=EMBEDDING_MODEL, input="test")
    print(f"  OpenAI OK (dim={len(test_resp.data[0].embedding)})", flush=True)

    # Step 4: Initialize Pinecone
    print("\n--- Step 4: Initialize Pinecone ---", flush=True)
    from pinecone import Pinecone, ServerlessSpec
    pc = Pinecone(api_key=pinecone_key)

    existing_indexes = pc.list_indexes().names()
    print(f"  Existing indexes: {existing_indexes}", flush=True)

    if INDEX_NAME not in existing_indexes:
        print(f"  Creating new index: {INDEX_NAME}...", flush=True)
        pc.create_index(
            name=INDEX_NAME,
            dimension=DIMENSION,
            metric=METRIC,
            spec=ServerlessSpec(cloud=CLOUD, region=REGION),
        )
        print("  Waiting for index to be ready...", flush=True)
        time.sleep(15)
        print(f"  Index '{INDEX_NAME}' created", flush=True)
    else:
        print(f"  Index '{INDEX_NAME}' already exists", flush=True)

    index = pc.Index(INDEX_NAME)
    stats = index.describe_index_stats()
    print(f"  Index stats: {stats.total_vector_count} total vectors", flush=True)

    # Step 5: Filter already-processed codes
    print("\n--- Step 5: Check progress ---", flush=True)
    processed_codes = load_progress()
    remaining_docs = [doc for doc in all_docs if doc["htsno"] not in processed_codes]
    print(f"  Already done: {len(processed_codes)}/{len(all_docs)}", flush=True)
    print(f"  Remaining: {len(remaining_docs)}", flush=True)

    if not remaining_docs:
        print("\n  All embeddings already complete!", flush=True)
        return

    # Step 6: Embed + upsert
    print(f"\n--- Step 6: Embed + upsert ({len(remaining_docs)} codes) ---", flush=True)
    total_batches = (len(remaining_docs) - 1) // EMBEDDING_BATCH_SIZE + 1
    total_tokens_est = 0

    for batch_idx in range(0, len(remaining_docs), EMBEDDING_BATCH_SIZE):
        batch_docs = remaining_docs[batch_idx:batch_idx + EMBEDDING_BATCH_SIZE]
        batch_num = batch_idx // EMBEDDING_BATCH_SIZE + 1
        elapsed = time.time() - start_time

        print(f"\n  Batch {batch_num}/{total_batches} ({len(batch_docs)} docs) "
              f"[{elapsed:.0f}s elapsed]", flush=True)

        texts = [doc["rich_doc"] for doc in batch_docs]
        total_tokens_est += sum(len(t.split()) / 0.75 for t in texts)

        # Embed with retry
        embeddings = None
        for attempt in range(MAX_RETRIES):
            try:
                resp = client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
                sorted_data = sorted(resp.data, key=lambda x: x.index)
                embeddings = [item.embedding for item in sorted_data]
                print(f"    Embedded {len(embeddings)} docs", flush=True)
                break
            except Exception as e:
                print(f"    Embed attempt {attempt + 1} failed: {e}", flush=True)
                if attempt < MAX_RETRIES - 1:
                    wait = 30 * (attempt + 1)
                    print(f"    Waiting {wait}s...", flush=True)
                    time.sleep(wait)
                else:
                    print("    All retries failed. Saving progress.", flush=True)
                    save_progress(processed_codes)
                    return

        if embeddings is None:
            save_progress(processed_codes)
            return

        # Build vectors
        vectors = []
        for i, doc in enumerate(batch_docs):
            vectors.append({
                "id": doc["htsno"],
                "values": embeddings[i],
                "metadata": doc.get("metadata", {}),
            })

        # Upsert with retry
        for attempt in range(MAX_RETRIES):
            try:
                for i in range(0, len(vectors), PINECONE_BATCH_SIZE):
                    batch = vectors[i:i + PINECONE_BATCH_SIZE]
                    index.upsert(vectors=batch, namespace=NAMESPACE)
                print(f"    Upserted {len(vectors)} vectors", flush=True)
                break
            except Exception as e:
                print(f"    Upsert attempt {attempt + 1} failed: {e}", flush=True)
                if attempt < MAX_RETRIES - 1:
                    wait = 30 * (attempt + 1)
                    print(f"    Waiting {wait}s...", flush=True)
                    time.sleep(wait)
                else:
                    print("    All retries failed. Saving progress.", flush=True)
                    save_progress(processed_codes)
                    return

        # Update progress
        for doc in batch_docs:
            processed_codes.add(doc["htsno"])
        save_progress(processed_codes)

        # Rate limiting
        time.sleep(1)

    # Final report
    elapsed = time.time() - start_time
    cost_est = total_tokens_est * 0.02 / 1_000_000

    print(f"\n{'=' * 60}", flush=True)
    print("EMBEDDING V5 COMPLETE", flush=True)
    print(f"{'=' * 60}", flush=True)
    print(f"Total embedded:   {len(processed_codes)}", flush=True)
    print(f"Index:            {INDEX_NAME}", flush=True)
    print(f"Namespace:        {NAMESPACE}", flush=True)
    print(f"Est. tokens:      {total_tokens_est:,.0f}", flush=True)
    print(f"Est. cost:        ${cost_est:.3f}", flush=True)
    print(f"Time:             {elapsed:.0f}s ({elapsed/60:.1f} min)", flush=True)
    print(f"Finished:         {time.strftime('%Y-%m-%d %H:%M:%S')}", flush=True)
    print(f"{'=' * 60}", flush=True)

    # Verify
    print("\nVerifying...", flush=True)
    stats = index.describe_index_stats()
    ns_stats = stats.namespaces.get(NAMESPACE, {})
    print(f"  Namespace '{NAMESPACE}': {ns_stats.get('vector_count', 0)} vectors", flush=True)
    print(f"  Total index vectors: {stats.total_vector_count}", flush=True)


if __name__ == "__main__":
    main()
