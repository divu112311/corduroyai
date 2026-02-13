import requests
from pathlib import Path

def fetch(source):
    dir = Path(f"storage/raw/{source['source_id']}")
    dir.mkdir(parents=True, exist_ok=True)

    if source["type"] == "api":
        r = requests.get(source["endpoint"])
        path = dir / "data.json"
        with open(path, "wb") as f:
            f.write(r.content)
        return path

    if source["type"] == "pdf":
        r = requests.get(source["base_url"])
        path = dir / "doc.pdf"
        with open(path, "wb") as f:
            f.write(r.content)
        return path
