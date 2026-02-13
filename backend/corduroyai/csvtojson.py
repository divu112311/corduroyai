import csv
import json
import os

def format_hts(code):
    code = str(code).strip().zfill(8)
    return f"{code[:4]}.{code[4:6]}.{code[6:]}"

csv_file = "tariff_database_2025.csv"
json_file = "tariff_database_2025.json"

data = []

with open(csv_file, newline="", encoding="latin1") as f:
    reader = csv.DictReader(f)
    for row in reader:
        if "hts8" in row and row["hts8"]:
            row["hts_code"] = format_hts(row["hts8"])
        data.append(row)

with open(json_file, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)