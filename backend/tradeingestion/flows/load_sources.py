import yaml

def load_sources():
    with open("sources/sources.yaml") as f:
        return yaml.safe_load(f)["sources"]
