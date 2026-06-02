"""
Extended test: try all curl_cffi Chrome profiles + different Upwork endpoints.
"""
import json
from pathlib import Path
from curl_cffi import requests as cffi_requests

session_file = Path(r"D:\Freelancer-os\apps\scraper\.sessions\upwork_session.json")
data = json.loads(session_file.read_text(encoding="utf-8"))

cookies = {}
for c in data.get("cookies", []):
    name, value, domain = c.get("name",""), c.get("value",""), c.get("domain","")
    if name and value and "upwork" in domain:
        cookies[name] = value

print(f"Loaded {len(cookies)} cookies\n")

# Key test URL — standard Upwork search page (NextJS)
test_url = "https://www.upwork.com/nx/search/jobs/?q=react+developer&sort=recency"
old_url  = "https://www.upwork.com/search/jobs/?q=react+developer&sort=recency"

for profile in ["chrome131", "chrome133", "chrome124", "chrome116"]:
    session = cffi_requests.Session(impersonate=profile)
    session.cookies.update(cookies)
    try:
        r = session.get(test_url, headers={"Accept-Language": "en-US,en;q=0.9"}, timeout=10)
        body = r.text
        status = r.status_code
        if "just a moment" in body.lower() or "challenge" in body.lower():
            verdict = "CF BLOCKED"
        elif "__NEXT_DATA__" in body:
            verdict = "✓ GOT NEXTJS DATA!"
        elif "<title>" in body:
            import re
            t = re.search(r"<title>(.*?)</title>", body)
            verdict = f"HTML: {t.group(1) if t else '?'}"
        else:
            verdict = f"unknown ({len(body)} chars)"
        print(f"[{profile}] {status} {verdict}")
    except Exception as e:
        print(f"[{profile}] ERROR: {e}")
