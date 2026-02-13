import datetime
from fetchers import (
    cbp,
    census_imports,
    census_exports,
    un_comtrade,
    usitc,
    ustr
)
from normalizers import cbp as n_cbp, census as n_census
from config import PATH_CONFIG

# Determine latest complete year for APIs that require it
LATEST_YEAR = '2024'
from google.cloud import secretmanager



def run():
    """
    Production ingestion orchestration.
    Each step downloads raw data, saves to GCS, then normalizes if applicable.
    """

    # -------------------------
    # 1. Census Imports
    # -------------------------
    print(f"Fetching Census imports for {LATEST_YEAR}...")
    census_imports.ingest_census_imports(LATEST_YEAR)        # Save raw JSON
    n_census.normalize_census('imports',LATEST_YEAR)          # Convert raw → canonical

    # -------------------------
    # 2. Census Exports
    # -------------------------
    print(f"Fetching Census exports for {LATEST_YEAR}...")
    census_exports.ingest_census_exports(LATEST_YEAR)
    n_census.normalize_census('exports',LATEST_YEAR)

    # -------------------------
    # 3. CBP Rulings
    # -------------------------
    print("Fetching CBP rulings...")
    #cbp.ingest_cbp()                # Save raw JSON
   # n_cbp.normalize_cbp()           # Convert raw → canonical

    # -------------------------
    # 4. USITC HTS
    # -------------------------
    print("Fetching USITC HTS current...")
    usitc.ingest_usitc()            # Download current PDF/XLS → save raw/canonical

    # -------------------------
    # 5. UN Comtrade
    # -------------------------
    #print(f"Fetching UN Comtrade data for {LATEST_YEAR}...")
    #  un_comtrade.ingest_un(LATEST_YEAR)   # Save raw JSON → canonical later if needed

    # -------------------------
    # 6. USTR FTA
    # -------------------------
    print("Fetching USTR FTA agreements...")
    ustr.ingest_ustr()              # Save raw CSV/HTML → canonical later

    print("All ingestion steps completed.")

if __name__ == "__main__":
    run()
