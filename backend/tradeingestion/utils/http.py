# utils/http.py
import requests
import time
import requests

def fetch_json(url, params=None):
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    try:
        return resp.json()
    except ValueError:
        raise RuntimeError(f"Non-JSON response from {url}: {resp.text[:200]}")


def fetch_file(url, headers=None, timeout=60):
    resp = requests.get(
        url,
        headers=headers,
        timeout=timeout
    )
    resp.raise_for_status()
    return resp.content
