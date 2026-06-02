"""Inspect Upwork search page structure to find correct selectors."""
import asyncio
from pathlib import Path


async def test():
    from playwright.async_api import async_playwright

    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    profile_dir = Path(".chrome_profiles/upwork")
    search_url = "https://www.upwork.com/nx/search/jobs/?q=react+developer&sort=recency"

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            str(profile_dir),
            executable_path=chrome_path,
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--window-position=-2000,0",
                "--window-size=1280,800",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-renderer-backgrounding",
            ],
            viewport={"width": 1280, "height": 800},
        )
        page = await context.new_page()
        await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
        # Poll until past any CF "Just a moment..." challenge page
        for _ in range(20):
            t = await page.title()
            if 'just a moment' not in t.lower() and 'challenge' not in t.lower():
                break
            print(f'  CF challenge still active (title={t!r}), waiting...')
            await page.wait_for_timeout(1500)
        # Wait for React job tiles
        try:
            await page.wait_for_selector('[data-test*="job"], article, a[href*="/jobs/~"]', timeout=12000)
            print('Selector found!')
        except Exception as e:
            print(f'Selector wait failed: {e}')
        await page.wait_for_timeout(2000)

        info = await page.evaluate("""() => {
            const tiles = document.querySelectorAll('[data-test*="job"]');
            const h2s = document.querySelectorAll('h2, h3');
            const links = document.querySelectorAll('a[href*="/jobs/"]');
            return {
                data_test_count: tiles.length,
                h_count: h2s.length,
                links_count: links.length,
                title: document.title,
                url: window.location.href,
                data_test_values: Array.from(tiles).slice(0, 10).map(t => t.getAttribute('data-test')),
                link_hrefs: Array.from(links).slice(0, 5).map(l => l.href.substring(0, 80)),
                h_texts: Array.from(h2s).slice(0, 5).map(h => h.textContent.trim().substring(0, 60)),
                body_sample: document.body.innerHTML.substring(0, 800),
            };
        }""")

        print("Title:", info["title"])
        print("URL:", info["url"])
        print("data-test count:", info["data_test_count"])
        print("data-test values:", info["data_test_values"])
        print("h2/h3 count:", info["h_count"])
        print("h2/h3 texts:", info["h_texts"])
        print("job links count:", info["links_count"])
        print("job link hrefs:", info["link_hrefs"])
        print("\nHTML body start (800 chars):")
        print(info["body_sample"])

        await context.close()


asyncio.run(test())
