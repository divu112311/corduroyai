import os
from utils.http import fetch_json
from utils.storage import GCSStorage
from config import PATH_CONFIG


from utils.secrets import get_secret

api_key = get_secret("CENSUS_API_KEY")
storage = GCSStorage(PATH_CONFIG["bucket_name"])

def ingest_census_exports(year):
    #api_key = UN_CENSUS_KEY
    data = fetch_json(
        "https://api.census.gov/data/timeseries/intltrade/exports/hs",
        params= {
        "get": "CTY_CODE,CTY_NAME,ALL_VAL_YR",
        "time": str(year),
        "key": api_key
        }
    )

    # Save RAW
    raw_path = f"{PATH_CONFIG['raw_paths']['census_exports']}/{year}.json"
    storage.save_raw(raw_path, data)
    print(f"Saved Census Exports raw → {raw_path}")

    # Save CANONICAL
    canonical_path = PATH_CONFIG['canonical_paths']['census_exports']
    storage.save_canonical(canonical_path, data)
    print(f"Saved Census Exports canonical → {canonical_path}")
