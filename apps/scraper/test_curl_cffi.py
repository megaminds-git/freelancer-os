"""
Test curl_cffi for Upwork access.
curl_cffi impersonates Chrome's exact TLS + HTTP/2 fingerprint.
Combined with valid session cookies, this should bypass Cloudflare.
"""
import json
from pathlib import Path

session_file = Path(r"D:\Freelancer-os\apps\scraper\.sessions\upwork_session.json")
data = json.loads(session_file.read_text(encoding="utf-8"))

cookies = {}
for c in data.get("cookies", []):
    name = c.get("name", "")
    value = c.get("value", "")
    domain = c.get("domain", "")
    if name and value and "upwork" in domain:
        cookies[name] = value

print(f"Loaded {len(cookies)} Upwork cookies")

from curl_cffi import requests as cffi_requests

session = cffi_requests.Session(impersonate="chrome120")
session.cookies.update(cookies)

headers = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.upwork.com/",
}

# Try multiple Upwork endpoints
endpoints = [
    ("nx search page", "https://www.upwork.com/nx/search/jobs/?q=react+developer&sort=recency"),
    ("ab jobs search", "https://www.upwork.com/ab/jobs/search/?q=react+developer&sort=recency&per_page=10"),
    ("find-work", "https://www.upwork.com/nx/find-work/most-recent?q=react+developer"),
    ("graphql", "https://www.upwork.com/api/graphql/v1"),
]

for name, url in endpoints:
    method = "POST" if "graphql" in url else "GET"
    print(f"\n[{name}] {method} {url[:80]}")
    try:
        if method == "POST":
            body = '{"query":"{ searchJobs(search: {query: \\"react\\"}) { jobs { id title } } }"}'
            resp = session.post(url, headers={**headers, "X-Ach-Requested-With": "XMLHttpRequest", "X-XSRF-Token": cookies.get("XSRF-TOKEN","")}, content=body, timeout=15)
        else:
            resp = session.get(url, headers=headers, timeout=15)
        ct = resp.headers.get("content-type","")
        print(f"  Status: {resp.status_code}  CT: {ct[:50]}")
        text = resp.text
        if text.strip().startswith("{"):
            print(f"  JSON response, keys: {list(json.loads(text).keys())[:5]}")
        elif "just a moment" in text.lower() or "challenge" in text.lower():
            print("  BLOCKED by Cloudflare")
        elif "__NEXT_DATA__" in text:
            print("  Got NextJS page with __NEXT_DATA__ ✓")
        elif "<title>" in text:
            import re
            t = re.search(r"<title>(.*?)</title>", text)
            print(f"  HTML title: {t.group(1) if t else '?'}")
        else:
            print(f"  Response: {text[:100]}")
    except Exception as e:
        print(f"  Error: {e}")
