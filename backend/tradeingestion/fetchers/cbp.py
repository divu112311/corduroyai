from utils.http import fetch_json
from utils.storage import GCSStorage
from config import PATH_CONFIG

storage = GCSStorage(PATH_CONFIG["bucket_name"])

def ingest_cbp():
    page = 1
    all_results = []

    while True:
        data = fetch_json(
            "https://rulings.cbp.gov/api/rulings",
            params={"page": page}
        )
        if not data.get("results"):
            break

        # Save RAW
        raw_path = f"{PATH_CONFIG['raw_paths']['cbp_rulings']}/page_{page}.json"
        storage.save_raw(raw_path, data)
        print(f"Saved CBP raw → {raw_path}")

        all_results.extend(data.get("results", []))
        page += 1

    # Save CANONICAL
    canonical_path = PATH_CONFIG['canonical_paths']['cbp_rulings']
    storage.save_canonical(canonical_path, all_results)
    print(f"Saved CBP canonical → {canonical_path}")
