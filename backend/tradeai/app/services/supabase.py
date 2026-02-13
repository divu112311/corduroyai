from supabase import create_client
import os

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def fetch_hts_rows(ids: list[str]) -> list[dict]:
    if not ids:
        return []

    try:
        resp = (
            supabase
            .table("hts_us_8")
            .select("hts8, description")
            .in_("hts8", ids)
            .execute()
        )
        return resp.data or []

    except Exception as e:
        print("Supabase fetch_hts_rows error:", str(e))
        return []
