import os
from utils.http import fetch_json
from utils.storage import GCSStorage
from config import PATH_CONFIG
from utils.secrets import get_secret
import json

api_key = get_secret("CENSUS_API_KEY")
storage = GCSStorage(PATH_CONFIG["bucket_name"])

def ingest_census_imports(year):
    
    data = fetch_json(
    "https://api.census.gov/data/timeseries/intltrade/imports/hs",
    params={
        "get": "CTY_CODE,CTY_NAME,GEN_VAL_YR",
        "time": str(year),
        "key": api_key
        }
    )
    # Save RAW
    raw_path = f"{PATH_CONFIG['raw_paths']['census_imports']}/{year}.json"
    storage.save_raw(raw_path, data)
    print(f"Saved Census Imports raw → {raw_path}")

    # Save CANONICAL
    canonical_path = PATH_CONFIG['canonical_paths']['census_imports']
    storage.save_canonical(canonical_path, data)
    print(f"Saved Census Imports canonical → {canonical_path}")
