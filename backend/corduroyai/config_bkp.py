# config.py

import os

# ============================================================================
# EDIT THESE VALUES
# ============================================================================
GCP_PROJECT_ID = "project-1fe125c4-7788-4a50-8cf"       # YOUR GCP PROJECT ID
GCS_BUCKET_NAME = "corduroyai"      # YOUR GCS BUCKET NAME
GCS_JSON_PATH = "tradedataraw/usitchts/hts_2026_revision_1_json.json"  # PATH TO JSON IN BUCKET
HTS_ENTRIES_TEXT_FIELD = "text"     # FIELD NAME WITH TEXT IN hts_entries TABLE


# ============================================================================
# SECRET NAMES - MATCHES YOUR GCP SECRET MANAGER
# ============================================================================

# Your actual secret names
SECRET_SUPABASE_URL = "SUPABASE_URL"
SECRET_SUPABASE_KEY = "SUPABASE_SERVICE_ROLE_KEY"
SECRET_PINECONE_KEY = "PINECONE_API_KEY"
SECRET_OPENAI_KEY = "OPENAI_API_KEY"

HTS_ENTRIES_MARKER_FIELD = "marker"
PINECONE_INDEX_NAME = "hts-codes"
PINECONE_DIMENSION = 1536   # Gemini text-embedding-004 = 768 dimensions
PINECONE_METRIC = "cosine"
PINECONE_CLOUD = "aws"
PINECONE_REGION = "us-east-1"
OPENAI_MODEL = "text-embedding-3-small"

BATCH_SIZE = 100

# Sentence Transformers model for local embeddings
# Options: "all-MiniLM-L6-v2" (fast, 384 dim), "all-mpnet-base-v2" (better quality, 768 dim)
#EMBEDDING_MODEL = "all-MiniLM-L6-v2"
#EMBEDDING_DIMENSION = 384  # Must match PINECONE_DIMENSION if using this model