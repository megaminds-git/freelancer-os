"""Test Upwork scraping via subprocess+CDP approach (bypasses CF bot detection)."""
import asyncio
import subprocess
from pathlib import Path
from urllib.parse import quote_plus


async def test():
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    profile_dir = Path(r"D:\Freelancer-os\apps\scraper\.chrome_profiles\upwork").resolve()
    debug_port = 9224
    search_url = "https://www.upwork.com/nx/search/jobs/?q=react+developer&sort=recency"

    print(f"Profile dir: {profile_dir}")
    print(f"Launching Chrome on :{debug_port} ...")

    chrome_proc = subprocess.Popen(
        [
            chrome_path,
            f"--remote-debugging-port={debug_port}",
            f"--user-data-dir={profile_dir}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-blink-features=AutomationControlled",
            "--window-size=1280,800",
            "--window-position=-2000,0",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    await asyncio.sleep(3)
    print("Chrome launched, connecting via CDP...")

    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.connect_over_cdp(f"http://localhost:{debug_port}", timeout=10000)
            print(f"Connected! Contexts: {len(browser.contexts)}, Pages: {sum(len(c.pages) for c in browser.contexts)}")

            context = browser.contexts[0] if browser.contexts else await browser.new_context()
            page = await context.new_page()

            print(f"Navigating to {search_url}")
            await page.goto(search_url, wait_until="domcontentloaded", timeout=45000)

            for i in range(20):
                title = await page.title()
                url = page.url
                print(f"  [{i}] title={title!r}  url={url[:80]}")
                if "just a moment" not in title.lower() and "challenge" not in title.lower():
                    print("  ✓ Past CF challenge!")
                    break
                await asyncio.sleep(1.5)

            # Wait for job tiles
            try:
                await page.wait_for_selector(
                    'article[data-test="job-tile"], [data-test="job-tile"], a[href*="/jobs/~"]',
                    timeout=10000,
                )
                print("Job tile selector found!")
            except Exception as e:
                print(f"Selector wait failed: {e}")
            await asyncio.sleep(1.5)

            info = await page.evaluate("""() => {
                const tiles = document.querySelectorAll('[data-test*="job"]');
                const links = document.querySelectorAll('a[href*="/jobs/~"]');
                return {
                    tile_count: tiles.length,
                    link_count: links.length,
                    title: document.title,
                    url: window.location.href,
                    data_test_values: Array.from(tiles).slice(0,5).map(t=>t.getAttribute('data-test')),
                    link_hrefs: Array.from(links).slice(0,5).map(l=>l.href.substring(0,80)),
                };
            }""")

            print(f"\nTitle: {info['title']}")
            print(f"URL: {info['url']}")
            print(f"data-test elements: {info['tile_count']}")
            print(f"data-test values: {info['data_test_values']}")
            print(f"Job links: {info['link_count']}")
            print(f"Link hrefs: {info['link_hrefs']}")

            await browser.close()
    finally:
        if chrome_proc.poll() is None:
            chrome_proc.terminate()
        print("Done.")


asyncio.run(test())
