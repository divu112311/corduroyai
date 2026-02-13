import json
import uuid

def normalize(path, source_id):
    raw = json.load(open(path))
    records = []

    for row in raw:
        records.append({
            "record_id": str(uuid.uuid4()),
            "hs_code": row.get("HS_CODE"),
            "value_usd": row.get("GEN_VAL_MO"),
            "period": row.get("time"),
            "source_id": source_id
        })

    return records
