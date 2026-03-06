"""
Load tariff_database_2025.json into Supabase tariff_rates table.
Run: py backend/corduroyai/load_tariff_data.py

Requires SUPABASE_URL and SUPABASE_KEY in backend/.env
Uses httpx to call Supabase REST API directly (no supabase-py needed).
"""

import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

# Load env from backend/.env
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set in backend/.env")
    sys.exit(1)

# Supabase REST API endpoint
REST_URL = f"{SUPABASE_URL}/rest/v1/tariff_rates"
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",  # upsert behavior
}

# Column name mapping: JSON key (from file) -> DB column name
COLUMN_MAP = {"hts8": "hts_code"}

# Numeric columns that should be converted from string to float (or None)
NUMERIC_COLUMNS = {
    "mfn_ad_val_rate", "mfn_specific_rate", "mfn_other_rate",
    "mexico_ad_val_rate", "mexico_specific_rate",
    "cbi_ad_val_rate", "cbi_specific_rate",
    "cbtpa_ad_val_rate", "cbtpa_specific_rate",
    "atpa_ad_val_rate", "atpa_specific_rate",
    "jordan_ad_val_rate", "jordan_specific_rate", "jordan_other_rate",
    "singapore_ad_val_rate", "singapore_specific_rate", "singapore_other_rate",
    "chile_ad_val_rate", "chile_specific_rate", "chile_other_rate",
    "morocco_ad_val_rate", "morocco_specific_rate", "morocco_other_rate",
    "australia_ad_val_rate", "australia_specific_rate", "australia_other_rate",
    "bahrain_ad_val_rate", "bahrain_specific_rate", "bahrain_other_rate",
    "dr_cafta_ad_val_rate", "dr_cafta_specific_rate", "dr_cafta_other_rate",
    "dr_cafta_plus_ad_val_rate", "dr_cafta_plus_specific_rate", "dr_cafta_plus_other_rate",
    "oman_ad_val_rate", "oman_specific_rate", "oman_other_rate",
    "peru_ad_val_rate", "peru_specific_rate", "peru_other_rate",
    "col2_ad_val_rate", "col2_specific_rate", "col2_other_rate",
    "korea_ad_val_rate", "korea_specific_rate", "korea_other_rate",
    "colombia_ad_val_rate", "colombia_specific_rate", "colombia_other_rate",
    "panama_ad_val_rate", "panama_specific_rate", "panama_other_rate",
    "japan_ad_val_rate", "japan_specific_rate", "japan_other_rate",
    "usmca_ad_val_rate", "usmca_specific_rate", "usmca_other_rate",
}

# Date columns that should be converted from MM/DD/YYYY to YYYY-MM-DD
DATE_COLUMNS = {"begin_effect_date", "end_effective_date"}


def convert_date(val: str) -> str | None:
    """Convert MM/DD/YYYY to YYYY-MM-DD for Postgres."""
    if not val or not val.strip():
        return None
    try:
        parts = val.strip().split("/")
        if len(parts) == 3:
            return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"
    except Exception:
        pass
    return None


def transform_row(raw: dict) -> dict:
    """Transform a JSON row into a DB-ready dict."""
    row = {}
    for key, val in raw.items():
        db_key = COLUMN_MAP.get(key, key)

        if key in NUMERIC_COLUMNS:
            if val is None or val == "":
                row[db_key] = None
            else:
                try:
                    row[db_key] = float(val)
                except (ValueError, TypeError):
                    row[db_key] = None
        elif key in DATE_COLUMNS:
            row[db_key] = convert_date(val)
        else:
            # Text columns: empty string -> None
            row[db_key] = val if val and val.strip() else None

    return row


def main():
    json_path = Path(__file__).resolve().parent / "tariff_database_2025.json"
    if not json_path.exists():
        print(f"ERROR: {json_path} not found")
        sys.exit(1)

    print(f"Loading {json_path}...")
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"Found {len(data)} records. Transforming...")
    rows = [transform_row(r) for r in data]

    # Batch upsert in chunks of 200 via Supabase REST API
    batch_size = 200
    total = len(rows)
    inserted = 0

    client = httpx.Client(timeout=60.0)

    for i in range(0, total, batch_size):
        batch = rows[i : i + batch_size]
        try:
            resp = client.post(REST_URL, headers=HEADERS, json=batch)
            if resp.status_code in (200, 201):
                inserted += len(batch)
                print(f"  Upserted {inserted}/{total} rows...")
            else:
                print(f"  ERROR at batch {i}-{i+len(batch)}: {resp.status_code} {resp.text[:200]}")
                # Try one-by-one for this batch to identify problem rows
                for j, row in enumerate(batch):
                    try:
                        resp2 = client.post(REST_URL, headers=HEADERS, json=row)
                        if resp2.status_code in (200, 201):
                            inserted += 1
                        else:
                            print(f"    SKIP row {i+j} (hts={row.get('hts_code')}): {resp2.status_code} {resp2.text[:100]}")
                    except Exception as e2:
                        print(f"    SKIP row {i+j} (hts={row.get('hts_code')}): {e2}")
        except Exception as e:
            print(f"  ERROR at batch {i}-{i+len(batch)}: {e}")

    client.close()
    print(f"\nDone! Inserted/updated {inserted}/{total} rows into tariff_rates.")


if __name__ == "__main__":
    main()
