from utils.http import fetch_file
from utils.storage import GCSStorage
from config import PATH_CONFIG

storage = GCSStorage(PATH_CONFIG["bucket_name"])

def ingest_usitc():
    # Download HTS PDF or XLS
    file_content = fetch_file("https://hts.usitc.gov/current")

    # Save RAW
    raw_path = f"{PATH_CONFIG['raw_paths']['usitc_hts']}/hts_current.pdf"
    storage.save_raw(raw_path, file_content)
    print(f"Saved USITC HTS raw → {raw_path}")

    # Canonical can be created later after parsing PDF/XLS
    canonical_path = PATH_CONFIG['canonical_paths']['usitc_hts']
    storage.save_canonical(canonical_path, {"note": "To be parsed from PDF"})
    print(f"Saved USITC HTS canonical placeholder → {canonical_path}")
