import json
from pathlib import Path

def save_json(path, data):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f)

def load_state():
    try:
        with open("state/source_state.json") as f:
            return json.load(f)
    except:
        return {}

def save_state(state):
    with open("state/source_state.json", "w") as f:
        json.dump(state, f)
