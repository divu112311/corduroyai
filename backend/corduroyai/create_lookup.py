# create_metadata_lookup.py - Create metadata lookup and upload to GCS
import json
from google.cloud import storage
import config

def main():
    print("=" * 80)
    print("CREATE METADATA LOOKUP")
    print("=" * 80)
    
    # Load rich docs from GCS
    print("📥 Loading hts_rich_docs.json from GCS (80MB, may take a minute)...")
    client = storage.Client(project=config.GCP_PROJECT_ID)
    bucket = client.bucket(config.GCS_BUCKET_NAME)
    blob = bucket.blob('hts_rich_docs.json')
    
    print("   ⏳ Downloading...")
    content = blob.download_as_text()
    print("   ⏳ Parsing JSON...")
    docs = json.loads(content)
    print(f"   ✅ Loaded {len(docs)} documents from GCS")
    
    # Create lookup dictionary (smaller - only what we need)
    print("🔧 Creating metadata lookup...")
    lookup = {}
    for i, doc in enumerate(docs):
        if i % 5000 == 0:
            print(f"   Processing {i}/{len(docs)}...", flush=True)
        
        htsno = doc['htsno']
        components = doc.get('components', {})
        entry = doc.get('entry', {})
        
        lookup[htsno] = {
            'description': components.get('description', ''),
            'chapter_code': components.get('chapter_code', ''),
            'chapter_title': components.get('chapter_title', ''),
            'section_code': components.get('section_code', ''),
            'section_title': components.get('section_title', ''),
            'units': entry.get('units', []),
            'general_rate': entry.get('general', ''),
            'special_rate': entry.get('special', ''),
            'indent': entry.get('indent', '')
        }
    print(f"   ✅ Created lookup for {len(lookup)} HTS codes")
    
    # Upload to GCS
    print("☁️ Uploading to GCS...")
    lookup_json = json.dumps(lookup)
    print(f"   Lookup file size: {len(lookup_json) / 1024 / 1024:.1f} MB")
    
    blob_output = bucket.blob('hts_metadata_lookup.json')
    blob_output.upload_from_string(lookup_json, content_type='application/json')
    print(f"   ✅ Uploaded to gs://{config.GCS_BUCKET_NAME}/hts_metadata_lookup.json")
    
    # Show sample
    print()
    print("Sample entry (0101.21.00):")
    print(json.dumps(lookup.get('0101.21.00', {}), indent=2))

if __name__ == "__main__":
    main()