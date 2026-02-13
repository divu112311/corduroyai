# normalizers/census.py
import json
from config import PATH_CONFIG
from utils.storage import GCSStorage
import os

# Initialize storage client
storage = GCSStorage(PATH_CONFIG["bucket_name"])

def normalize_census(kind, year):
    """
    Normalize Census trade data for a given kind ('imports' or 'exports') and year.
    Reads raw JSON from GCS and writes canonical JSON back to GCS.
    """
    # GCS path to raw file
    raw_path = f"{PATH_CONFIG['raw_paths'][f'census_{kind}']}/{year}.json"

    # Load raw JSON from GCS
    raw_content = storage.load_raw(raw_path)  # returns string
    raw_data = json.loads(raw_content)

    # Canonical path in GCS
    canonical_path = PATH_CONFIG['canonical_paths'][f'census_{kind}']

    # Save canonical JSON to GCS
    storage.save_canonical(canonical_path, raw_data)

    print(f"Saved Census {kind} canonical → {canonical_path}")


# Optional convenience functions for imports/exports
def normalize_census_imports(year):
    normalize_census('imports', year)

def normalize_census_exports(year):
    normalize_census('exports', year)
