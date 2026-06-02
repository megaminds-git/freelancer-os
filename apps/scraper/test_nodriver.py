"""Test nodriver for Upwork job search (bypasses CF Bot Management)."""
import asyncio
from pathlib import Path


async def main():
    import nodriver as uc

    profile_dir = Path(r"D:\Freelancer-os\apps\scraper\.chrome_profiles\upwork").resolve()
    search_url = "https://www.upwork.com/nx/search/jobs/?q=react+developer&sort=recency"

    print(f"Starting nodriver with profile: {profile_dir}")

    config = uc.Config()
    config.user_data_dir = str(profile_dir)
    config.add_argument("--window-size=1280,800")
    config.add_argument("--window-position=-2000,0")
    config.add_argument("--disable-background-timer-throttling")
    config.add_argument("--disable-backgrounding-occluded-windows")
    config.add_argument("--disable-renderer-backgrounding")
    config.headless = False  # nodriver works best in non-headless

    browser = await uc.start(config=config)

    try:
        page = await browser.get(search_url)

        # Poll until past CF challenge
        for i in range(20):
            title = await page.evaluate("document.title")
            url = await page.evaluate("window.location.href")
            print(f"  [{i}] title={title!r}  url={url[:80]}")
            if "just a moment" not in title.lower() and "challenge" not in title.lower():
                print("  ✓ Past CF challenge!")
                break
            await asyncio.sleep(1.5)

        # Wait for React job tiles
        await asyncio.sleep(3)

        tile_count = await page.evaluate("document.querySelectorAll('[data-test*=\"job\"]').length")
        page_title = await page.evaluate("document.title")
        page_url   = await page.evaluate("window.location.href")

        # Get all data-test values and sample hrefs
        dt_values = await page.evaluate("""Array.from(document.querySelectorAll('[data-test]')).slice(0,20).map(e => e.getAttribute('data-test'))""")
        all_links = await page.evaluate("""Array.from(document.querySelectorAll('a[href*="jobs"]')).slice(0,10).map(l=>l.href.substring(0,100))""")
        h2_texts = await page.evaluate("""Array.from(document.querySelectorAll('h2, h3')).slice(0,5).map(h=>h.textContent.trim().substring(0,60))""")

        print(f"\nTitle: {page_title}")
        print(f"URL: {page_url}")
        print(f"data-test job elements: {tile_count}")
        print(f"data-test values (20): {dt_values}")
        print(f"Job-related links (10): {all_links}")
        print(f"h2/h3 texts: {h2_texts}")

    finally:
        browser.stop()


asyncio.run(main())
