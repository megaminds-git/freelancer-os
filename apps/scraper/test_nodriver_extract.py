"""Final nodriver extraction test — get full job data from Upwork search."""
import asyncio
from pathlib import Path


async def main():
    import nodriver as uc

    profile_dir = Path(r"D:\Freelancer-os\apps\scraper\.chrome_profiles\upwork").resolve()
    search_url = "https://www.upwork.com/nx/search/jobs/?q=react+developer&sort=recency"

    config = uc.Config()
    config.user_data_dir = str(profile_dir)
    config.add_argument("--window-size=1280,800")
    config.add_argument("--window-position=-2000,0")
    config.add_argument("--disable-background-timer-throttling")
    config.add_argument("--disable-backgrounding-occluded-windows")
    config.add_argument("--disable-renderer-backgrounding")
    config.headless = False

    browser = await uc.start(config=config)
    try:
        page = await browser.get(search_url)

        # Wait past CF challenge
        for i in range(20):
            title_result = await page.evaluate("document.title")
            if isinstance(title_result, dict):
                title = title_result.get('value', '')
            else:
                title = str(title_result)
            if "just a moment" not in title.lower() and "challenge" not in title.lower():
                print(f"Page loaded: {title!r}")
                break
            print(f"  [{i}] CF: {title!r}")
            await asyncio.sleep(1.5)

        await asyncio.sleep(3)

        # Extract all job data from cards
        jobs_result = await page.evaluate("""
(() => {
  const jobs = [];
  const seen = new Set();

  // Find all heading elements inside job tiles
  const headings = Array.from(document.querySelectorAll('h2 a, h3 a'));
  for (const a of headings) {
    const href = a.href || '';
    const title = (a.textContent || '').trim();
    if (!title || seen.has(href)) continue;
    seen.add(href);

    // Walk up to find the job card container
    let card = a;
    for (let i = 0; i < 8; i++) {
      card = card.parentElement;
      if (!card) break;
      // Look for description text
      const p = card.querySelector('p, [class*="description"]');
      if (p && p.textContent.trim().length > 20) break;
    }

    let desc = '', budget = '';
    const skills = [];
    if (card) {
      const descEl = card.querySelector('p, [class*="description"], [data-test*="desc"]');
      if (descEl) desc = (descEl.textContent || '').trim();
      const budgetEl = card.querySelector('[class*="budget"], [class*="price"], [data-test*="budget"]');
      if (budgetEl) budget = (budgetEl.textContent || '').trim();
      const skillEls = card.querySelectorAll('[class*="skill"], [class*="tag"], [data-test*="skill"], span[class*="token"]');
      skillEls.forEach(s => { const t = s.textContent.trim(); if (t && t.length < 40) skills.push(t); });
    }

    jobs.push({ href, title, desc: desc.substring(0, 300), budget, skills: skills.slice(0, 8) });
    if (jobs.length >= 20) break;
  }
  return jobs;
})()
""")

        if isinstance(jobs_result, list):
            # Unwrap nodriver format
            actual_jobs = []
            for item in jobs_result:
                if isinstance(item, dict) and 'value' in item:
                    actual_jobs.append(item['value'])
                elif isinstance(item, dict) and 'href' in item:
                    actual_jobs.append(item)
                else:
                    actual_jobs.append(item)
            jobs_result = actual_jobs

        print(f"\nExtracted {len(jobs_result)} jobs:")
        for j in (jobs_result or [])[:5]:
            if isinstance(j, dict):
                title = j.get('title', j.get('value', str(j)))
                href = j.get('href', '')
                budget = j.get('budget', '')
                skills = j.get('skills', [])
                print(f"  Title: {title[:60]}")
                print(f"  URL:   {href[:80]}")
                print(f"  Budget:{budget[:40]}")
                print(f"  Skills:{skills}")
                print()
            else:
                print(f"  {j}")

    finally:
        browser.stop()


asyncio.run(main())
