from typing import Dict, Any

# in-memory for MVP
SESSIONS: Dict[str, Dict[str, Any]] = {}

def get_session(session_id: str) -> Dict[str, Any]:
    if session_id not in SESSIONS:
        SESSIONS[session_id] = {
            "step": "preprocess",
            "data": {}
        }
    return SESSIONS[session_id]
