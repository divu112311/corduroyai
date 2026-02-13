import os
from utils.http import fetch_json
from utils.storage import GCSStorage
from config import PATH_CONFIG
from utils.secrets import get_secret

UN_COMTRADE_KEY = get_secret("UN_COMTRADE_KEY")
storage = GCSStorage(PATH_CONFIG["bucket_name"])

def ingest_un(year):
    # Fetch data from UN Comtrade API
    data = fetch_json(
        "https://comtrade.un.org/api/get",
        params={
            "type": "C",
            "freq": "A",
            "ps": year,
            "r": "840",          # Reporting country (US)
            "p": "all",          # Partner countries
            "rg": "1",           # Trade flow (imports)
            "cc": "ALL",         # All commodity codes
            "max": 50000,
            "token": UN_COMTRADE_KEY
        }
    )

    # --- Save RAW data to GCS ---
    raw_path = f"{PATH_CONFIG['raw_paths']['un_comtrade']}/{year}.json"
    storage.save_raw(raw_path, data)
    print(f"Saved UN Comtrade raw → {raw_path}")

    # --- Save CANONICAL data to GCS ---
    # For now, canonical = same as raw; you can normalize later
    canonical_path = PATH_CONFIG['canonical_paths']['un_comtrade']
    storage.save_canonical(canonical_path, data)
    print(f"Saved UN Comtrade canonical → {canonical_path}")
