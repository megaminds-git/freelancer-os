"""
Test: Launch Chrome normally (no CDP/debugging) with the Upwork profile,
navigate to the search page, and save the page HTML to a temp file.
Uses Chrome's --dump-dom flag to output the fully-rendered DOM.
"""
import subprocess
import time
import tempfile
import sys
from pathlib import Path

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
profile_dir = Path(r"D:\Freelancer-os\apps\scraper\.chrome_profiles\upwork").resolve()
search_url = "https://www.upwork.com/nx/search/jobs/?q=react+developer&sort=recency"
out_file = Path(tempfile.gettempdir()) / "upwork_dom.html"

print(f"Launching Chrome (no automation flags)...")
print(f"Profile: {profile_dir}")

proc = subprocess.run(
    [
        chrome_path,
        "--headless=new",                   # new headless mode (full rendering)
        "--dump-dom",                        # print rendered DOM to stdout
        "--no-first-run",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        f"--user-data-dir={profile_dir}",
        "--virtual-time-budget=8000",        # wait up to 8s for page rendering
        search_url,
    ],
    capture_output=True,
    text=True,
    timeout=30,
)

html = proc.stdout
print(f"HTML length: {len(html)} chars")
if html:
    out_file.write_text(html, encoding="utf-8")
    print(f"Saved to {out_file}")

    title_start = html.find("<title>")
    title_end = html.find("</title>")
    if title_start >= 0 and title_end >= 0:
        print(f"Title: {html[title_start+7:title_end]}")

    if "just a moment" in html.lower() or "challenge" in html.lower():
        print("RESULT: Still on CF challenge page")
    elif "job-tile" in html or "/jobs/~" in html:
        # Count job links
        import re
        jobs = re.findall(r'href="/jobs/~[^"]+', html)
        print(f"RESULT: Found {len(jobs)} job links!")
        for j in jobs[:5]:
            print(f"  {j}")
    else:
        print(f"RESULT: Unknown page content")
        print(html[:500])
else:
    print("No output from Chrome")
    if proc.stderr:
        print("Stderr:", proc.stderr[:500])
