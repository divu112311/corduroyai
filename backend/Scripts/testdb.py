import requests

query = "horses"
hs_code = "ALL"
page = 1
page_size = 30

url = f"https://rulings.cbp.gov/api/search?term={query}&collection=ALL&commodityGrouping={hs_code}&pageSize={page_size}&page={page}&sortBy=RELEVANCE"

resp = requests.get(url)
print("Status code:", resp.status_code)
print("Content type:", resp.headers.get("Content-Type"))
print("Returned content:")
print(resp.text[:1000])  # print first 1000 chars to inspect
