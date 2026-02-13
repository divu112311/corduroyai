# verify_documents.py - RUN THIS FIRST TO TEST

import json
from google.cloud import storage
from secrets_manager import SecretsManager
from database import SupabaseDatabase
from document_builder import DocumentBuilder
import config

def verify():
    print("="*80)
    print("VERIFYING DOCUMENT GENERATION")
    print("="*80)

    print("\n[1/4] Loading credentials...")
    secrets = SecretsManager()
    creds = secrets.get_all_credentials()
    print("  ✓ Done")

    print("\n[2/4] Loading chapters from Supabase...")
    db = SupabaseDatabase(creds['supabase_url'], creds['supabase_key'])
    chapters = db.get_chapters()
    print(f"  ✓ {len(chapters)} chapters loaded")

    print("\n[3/4] Loading HTS JSON from GCS...")
    storage_client = storage.Client()
    bucket = storage_client.bucket(config.GCS_BUCKET_NAME)
    blob = bucket.blob(config.GCS_JSON_PATH)
    json_string = blob.download_as_string()
    hts_data = json.loads(json_string)
    print(f"  ✓ {len(hts_data)} HTS entries loaded")

    print("\n[4/4] Testing document generation...")
    builder = DocumentBuilder(chapters)

    samples = 0
    for entry in hts_data:
        if samples >= 3:
            break

        rich_doc, components = builder.build_rich_document_verbose(entry)
        if not rich_doc:
            continue

        samples += 1
        print(f"\n{'─'*80}")
        print(f"SAMPLE {samples}: {entry.get('htsno')}")
        print(f"{'─'*80}")
        print("\nRICH DOCUMENT:")
        print(rich_doc)
        print(f"\nCOMPONENTS:")
        for key, value in components.items():
            if value:
                print(f"  • {key}: {value}")

    print(f"\n{'='*80}")
    print("✓ VERIFICATION COMPLETE")
    print(f"{'='*80}")
    print("\nIf documents look good, run: python main.py")

if __name__ == '__main__':
    verify()
