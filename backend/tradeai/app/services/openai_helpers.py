import os
import requests
import time
import json
from typing import List, Dict, Union

OPENAI_CHAT_MODEL = "gpt-4o-mini"
MAX_RETRIES = 3
RETRY_DELAY = 0.5  # seconds

def call_openai_chat_json(messages: List[Dict[str, str]]) -> Union[dict, str]:
    """
    Call OpenAI Chat Completion and return parsed JSON if possible.
    
    Parameters:
        messages: list of {"role": "system"/"user", "content": "..."}
    
    Returns:
        Parsed JSON object if the model returns JSON,
        else raw string.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set in environment")

    url = "https://api.openai.com/v1/chat/completions"

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": OPENAI_CHAT_MODEL,
                    "messages": messages,
                    "temperature": 0.2
                },
                timeout=30
            )

            # Successful response
            if resp.status_code == 200:
                text = resp.json()["choices"][0]["message"]["content"]
                try:
                    return json.loads(text)  # try parsing as JSON
                except json.JSONDecodeError:
                    return text  # fallback to raw string if not JSON

            # Retry on rate limits or server errors
            if resp.status_code in (429, 500, 502, 503) and attempt < MAX_RETRIES:
                print(f"OpenAI API returned {resp.status_code}, retry {attempt}/{MAX_RETRIES}")
                time.sleep(RETRY_DELAY * attempt)
                continue

            # Other errors
            resp.raise_for_status()

        except requests.RequestException as e:
            if attempt < MAX_RETRIES:
                print(f"Request error: {e}, retry {attempt}/{MAX_RETRIES}")
                time.sleep(RETRY_DELAY * attempt)
                continue
            else:
                raise RuntimeError(f"OpenAI request failed after {MAX_RETRIES} attempts: {e}")

    raise RuntimeError("OpenAI API retries exceeded")
