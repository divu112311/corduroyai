import requests
import time

BASE_URL = "https://rulings.cbp.gov/api/search"
HEADERS = {"User-Agent": "Mozilla/5.0"}

def search_cbp_rulings(
    query: str,
    hs_code: str | None = None,
    page_size: int = 30,
    max_pages: int = 5,
    rate_limit_sec: float = 1.0
):
    results = []
    session = requests.Session()
    session.headers.update(HEADERS)
    print('in search ruling')
    
    for page in range(1, max_pages + 1):
        params = {
            "term": query,
            "collection": "ALL",
            "commodityGrouping": "ALL",
            "pageSize": page_size,
            "page": page,
            "sortBy": "RELEVANCE",
        }

        if hs_code:
            params["tariff"] = hs_code

        resp = session.get(BASE_URL, params=params, timeout=20)
    
        print("Returned content:", resp.text[:500])  # inspect first 500 chars
    
        resp.raise_for_status()

        try:
            data = resp.json()
        
        except ValueError:
        
            print(f"Warning: page {page} returned non-JSON response, skipping")
        
            continue

        rulings = data.get("rulings", [])
        
        if not rulings:
            break

        for r in rulings:
            results.append({
                "ruling_number": r.get("rulingNumber"),
                "subject": r.get("subject"),
                "ruling_date": r.get("rulingDate"),
                "hs_codes": r.get("tariffs", []),
                "url": f"https://rulings.cbp.gov/ruling/{r.get('rulingNumber')}",
            })

        time.sleep(rate_limit_sec)

    return results


def fetch_cbp_rulings_for_rules(matched_rules, max_per_rule=3):
    """
    For each matched HTS rule, fetch relevant CBP rulings
    Returns rulings grouped per HTS
    """

    results = []
    print('in fetch ruling')
    
    for rule in matched_rules:
        hts = rule.get("hts")
        description = rule.get("description", "")
        
        if not hts:
            continue

        # Normalize HTS <check if needed>
        hts_str = str(hts)
        if hts_str.isdigit() and len(hts_str) == 7:
            hts_str = "0" + hts_str

        try:
            rulings = search_cbp_rulings(
                query=rule.get("description", ""),
                hs_code=hts_str[:4],   # CBP search best at 4-digit
                max_pages=1
            )
        except Exception as e:
            print(f"Error fetching rulings for {hts}: {e}")
            rulings = []

        for r in rulings[:max_per_rule]:
            results.append({
                "hts": hts,
                "ruling_number": r.get("ruling_number"),
                "ruling_date": r.get("ruling_date"),
                "hs_codes": r.get("hs_codes"),
                "url": r.get("url"),
                "subject": r.get("subject")
            })

    return results
