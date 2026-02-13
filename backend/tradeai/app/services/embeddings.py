import os
import requests
import time
from typing import List, Dict

OPENAI_EMBED_MODEL = "text-embedding-3-small"
MAX_RETRIES = 3
RETRY_DELAY = 0.5  # seconds

# ---------------- OpenAI Embedding ----------------
def embed_query(text: str) -> List[float]:
    """
    Get embedding vector from OpenAI for the input text.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set")

    url = "https://api.openai.com/v1/embeddings"

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={"model": OPENAI_EMBED_MODEL, "input": text},
                timeout=30,
                
            )
             # --- PRINT FULL RESPONSE FOR DEBUG ---
            print("OpenAI API Response (raw):")
            print(resp.json())  # prints the full JSON response
            if resp.status_code == 200:
                return resp.json()["data"][0]["embedding"]
            
            # Retry for server or rate-limit errors
            if resp.status_code in (429, 500, 502, 503) and attempt < MAX_RETRIES:
                print(f"OpenAI request failed with {resp.status_code}, retry {attempt}/{MAX_RETRIES}")
                time.sleep(RETRY_DELAY * attempt)
                continue

            resp.raise_for_status()

        except requests.RequestException as e:
            if attempt < MAX_RETRIES:
                print(f"Request error: {e}, retry {attempt}/{MAX_RETRIES}")
                time.sleep(RETRY_DELAY * attempt)
                continue
            else:
                raise

    raise RuntimeError("OpenAI embedding retries exceeded")


# ---------------- Pinecone Query ----------------
def query_pinecone(vector: List[float]) -> List[Dict]:
    """
    Query Pinecone index with a vector and return top matches.
    Each match includes 'id', 'score', 'metadata'.
    """
    api_key = os.getenv("PINECONE_API_KEY")
    host = "https://hts-embeddings-wsprb2o.svc.aped-4627-b74a.pinecone.io"
    namespace = "hts-embeddings"
    top_k = 10

    if not api_key or not host:
        raise ValueError("PINECONE_API_KEY or PINECONE_HOST not set")

    url = f"{host}/query"
    payload = {
        "vector": vector,
        "topK": top_k,
        "namespace": namespace,
        "includeMetadata": True,
    }

    try:
        resp = requests.post(
            url,
            headers={"Api-Key": api_key, "Content-Type": "application/json"},
            json=payload,
            timeout=30
        )
        resp.raise_for_status()
        matches = resp.json().get("matches", [])

        # Debug: print all matches for inspection
        print("PINECONE RAW MATCHES:")
        for i, match in enumerate(matches):
            print(f"Match {i+1}:")
            #for k, v in match.items():
            #   print(f"  {k}: {v}")

        return matches

    except requests.RequestException as e:
        print("Error querying Pinecone:", e)
        return []
