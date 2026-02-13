# normalizers/cbp.py
import json, glob
from pathlib import Path

def normalize_cbp():
    records = []

    for file in glob.glob("storage/raw/cbp/page_*.json"):
        data = json.load(open(file))
        for r in data["results"]:
            records.append({
                "document_id": r["rulingNumber"],
                "hs_code": r.get("tariffNumber"),
                "text": r.get("decision"),
                "issue_date": r["issueDate"],
                "source_id": "cbp_rulings"
            })

    Path("storage/canonical").mkdir(exist_ok=True)
    json.dump(
        records,
        open("storage/canonical/cbp_rulings.json", "w")
    )
