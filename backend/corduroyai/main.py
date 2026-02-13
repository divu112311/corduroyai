# main.py - Main embedding generation pipeline
import json
import os
from tqdm import tqdm
import config
from secrets import get_secret
from storage_loader import StorageLoader
from database import SupabaseDatabase
from document_builder import DocumentBuilder
from embedding_service import EmbeddingService
from pinecone_service import PineconeService

try:
    with open("chapter_mapping_gemini.json", "r", encoding="utf-8") as f:
        chapter_mapping = json.load(f)
    
    print("Chapter mapping loaded successfully")

except Exception as e:
    print(f"Failed to load chapter mapping: {e}")
    chapter_mapping = {}

def save_docs_to_gcs(docs, filename="hts_rich_docs.json"):
    from google.cloud import storage
    import json
    import config

    client = storage.Client(project=config.GCP_PROJECT_ID)
    bucket = client.bucket(config.GCS_BUCKET_NAME)
    blob = bucket.blob(filename)
    blob.chunk_size = 5 * 1024 * 1024  # 5 MB per chunk
    
    #blob.upload_from_string(json.dumps(docs), content_type="application/json")
    blob.upload_from_string(
        json.dumps(docs, ensure_ascii=False, indent=2),
        content_type="application/json"
    )
    
    print(f"  Saved {len(docs)} documents to gs://{config.GCS_BUCKET_NAME}/{filename}")

def count_tokens_approx(text):
    """Approximate token count (1 token ≈ 4 characters)"""
    return len(text) // 4

def analyze_documents(all_docs):
    """Analyze token counts in documents"""
    token_counts = []
    long_docs = []
    
    for doc in all_docs:
        rich_doc = doc['rich_doc']
        tokens = count_tokens_approx(rich_doc)
        token_counts.append(tokens)
        
        if tokens > 2000:  # Close to limit
            long_docs.append({
                'htsno': doc['htsno'],
                'tokens': tokens,
                'length': len(rich_doc)
            })
    
    print(f"\nToken Analysis:")
    print(f"  Total documents: {len(token_counts)}")
    print(f"  Min tokens: {min(token_counts)}")
    print(f"  Max tokens: {max(token_counts)}")
    print(f"  Avg tokens: {sum(token_counts) // len(token_counts)}")
    print(f"  Documents over 2000 tokens: {len(long_docs)}")
    
    if long_docs:
        print(f"\n Documents exceeding limit:")
        for doc in long_docs[:5]:  # Show first 5
            print(f"    {doc['htsno']}: {doc['tokens']} tokens")
    
    return token_counts, long_docs

def main():
    """Main pipeline to generate and upload embeddings"""

    try:
        creds = {
        "supabase_url": get_secret(config.SECRET_SUPABASE_URL),
        "supabase_key": get_secret(config.SECRET_SUPABASE_KEY),
        "pinecone_key": get_secret(config.SECRET_PINECONE_KEY),
    }
    
        print("Secrets fetched successfully")
    
    except Exception as e:
        print(f"   {e}")
        
        return

   
    try:
        db = SupabaseDatabase(creds['supabase_url'], creds['supabase_key'])
       
    except Exception as e:
        print(f"  Failed to connect: {e}")
        return

    # Step 3: Load chapter data from Supabase
    print("\n[3/7] Loading chapter data from Supabase...")
    try:
        chapters = db.get_chapters()
        print(f"  Loaded {len(chapters)} chapters")
        print("Loading section data from Supabase...")
        sections = db.get_sections()
        print(f"  Loaded {len(sections)} sections")
    except Exception as e:
        print(f"   Failed to load chapters/sections: {e}")
        return

    # Step 4: Load HTS JSON from Cloud Storage
    print(f"\n Loading HTS JSON from Cloud Storage...")
    try:
        storage = StorageLoader(config.GCS_BUCKET_NAME)
        hts_data = storage.load_json(config.GCS_JSON_PATH)
        print("Loading HTS JSON from:", config.GCS_JSON_PATH)
        print(f" Loaded {len(hts_data)} HTS entries")
    
    except Exception as e:
      
        print(f"\nVerify file exists:",e)
       
        return

    
    # Step 5: Initialize document builder
    print("\n[5/7] Initializing document builder...")
    builder = DocumentBuilder(chapters=chapters, sections=sections,chapter_mapping=chapter_mapping)
    print("  ✓ Document builder ready")


    # ===============================
    # FIRST: Build and save documents
    # ===============================
    all_docs = []

    for entry in tqdm(hts_data, desc="Building documents"):
        rich_doc, components = builder.build_rich_document_verbose(entry)
        
        if not rich_doc:
            continue

        chapter = entry['htsno'][:2]
    
        #chapter_info = chapter_mapping.get(chapter, {})


        all_docs.append({
            "htsno": entry['htsno'],
            "rich_doc": rich_doc,
            "components": components,
            "entry": entry
        })

    # Save all rich documents to GCS before embeddings
    save_docs_to_gcs(all_docs, filename="hts_rich_docs.json")
    print("✓ Document building complete. Verify the documents in GCS before proceeding.")
    
    return # retruning coz will use a different script for embedding
    print("I am here should not print")

    # Step 6: Load embedding model
    print(f"\n[6/7] Loading embedding model...")
    try:
        OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
        embedding_service = EmbeddingService(api_key=OPENAI_API_KEY)
    except Exception as e:
        print(f"  ❌ Failed to load model: {e}")
        return
    token_counts, long_docs = analyze_documents(all_docs)
    
    # Step 7: Connect to Pinecone
    # Step 7: Connect to Pinecone
    print("\n[7/7] Connecting to Pinecone...")
    try:
        pinecone = PineconeService(creds['pinecone_key'], namespace="hts-openai-v1")
        pinecone.create_index_if_not_exists()
        pinecone.connect_to_index()
        print("  Connected to Pinecone")
    except Exception as e:
        print(f"  Failed to connect to Pinecone: {e}")
        return
   
    # Generate and upload embeddings
    print("\n" + "="*80)
    print("GENERATING EMBEDDINGS")
    print("="*80)
     

   
    batch = []
    processed = 0
    

    for doc in tqdm(all_docs, desc="Processing"):
        # Build rich document
        rich_doc = doc['rich_doc']
        hts_code = doc['htsno']
        entry = doc['entry']

        # Generate embedding
        embedding = embedding_service.encode(rich_doc)
        if not rich_doc:
            skipped += 1
            continue

        # Generate embedding
        embedding = embedding_service.encode(rich_doc)

        # Prepare for Pinecone
        hts_code = entry['htsno']
        batch.append({
            'id': hts_code,
            'values': embedding,
            'metadata': {
                'description': entry.get('description', ''),
                'chapter': hts_code[:2],
                'indent': str(entry.get('indent', '')),
                'units': ', '.join(entry.get('units', [])) if isinstance(entry.get('units'), list) else str(entry.get('units', '')),
                'general_rate': entry.get('general', ''),
                'special_rate': entry.get('special', ''),
            }
        })

        processed += 1

        # Upload in batches
        if len(batch) >= config.BATCH_SIZE:
            try:
                pinecone.upsert_batch(batch)
                batch = []
            except Exception as e:
                print(f"\n  Error uploading batch: {e}")
                return

    # Upload remaining
    if batch:
        try:
            pinecone.upsert_batch(batch)
        except Exception as e:
            print(f"\n  Error uploading final batch: {e}")
            return

    print(f"\n  ✓ Embeddings generated and uploaded!")
    print(f"  Processed: {processed} HTS codes")
    #print(f"  Skipped: {skipped} entries")

    test_queries = [
        "laptop computer",
        "cotton t-shirt",
        "breeding horse"
    ]

    for query in test_queries:
        print(f"\n  Query: '{query}'")
        query_embedding = embedding_service.encode(query)
        results = pinecone.query(query_embedding.tolist(), top_k=3)

        for i, match in enumerate(results['matches'], 1):
            desc = match['metadata']['description'][:60]
            print(f"    {i}. {match['id']} - {desc}... ({match['score']:.3f})")

    
    print(f"\nEmbeddings stored in: {config.PINECONE_INDEX_NAME}")
    print(f"Total HTS codes indexed: {processed}")
    
   

if __name__ == '__main__':
    main()
