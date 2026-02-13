from utils.http import fetch_file
from utils.storage import GCSStorage
from config import PATH_CONFIG

storage = GCSStorage(PATH_CONFIG["bucket_name"])

def ingest_ustr():
    # Example: download CSV/Excel of trade agreements
    file_content = fetch_file("https://ustr.gov/fta/agreements.csv")

    # Save RAW
    raw_path = f"{PATH_CONFIG['raw_paths']['ustr_fta']}/agreements.csv"
    storage.save_raw(raw_path, file_content)
    print(f"Saved USTR FTA raw → {raw_path}")

    # Canonical
    canonical_path = PATH_CONFIG['canonical_paths']['ustr_fta']
    storage.save_canonical(canonical_path, {"note": "To be parsed from CSV"})
    print(f"Saved USTR FTA canonical placeholder → {canonical_path}")
