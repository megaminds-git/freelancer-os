"""
Freelancer OS — Project Scraper Service
Runs on port 8001. Scrapes Upwork and Freelancer.com project listings,
and provides browser-based login for platform account connection.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, NamedTuple
import httpx
import uuid
import asyncio
import logging
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import quote_plus

# Windows Python 3.8+: set ProactorEventLoop policy at module level so that
# every asyncio.new_event_loop() call — including those inside sync_playwright's
# background thread — creates a ProactorEventLoop.  SelectorEventLoop does not
# support asyncio.create_subprocess_exec and raises NotImplementedError.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Freelancer OS Scraper", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    import traceback
    tb = traceback.format_exc()
    logger.error(f"[unhandled] {exc}\n{tb}")
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=503, content={"error": str(exc), "type": type(exc).__name__})

# ── Session persistence dir ───────────────────────────────────────────────────
SESSION_DIR = Path(__file__).parent / ".sessions"
SESSION_DIR.mkdir(exist_ok=True)

def _session_path(platform: str) -> Path:
    return SESSION_DIR / f"{platform}_session.json"


def _load_session_cookies(platform: str) -> dict:
    """Load saved Playwright session cookies for a platform, if available."""
    session_file = _session_path(platform)
    if not session_file.exists():
        return {}
    try:
        data = json.loads(session_file.read_text(encoding="utf-8"))
        domain_key = {"freelancer": "freelancer.com", "upwork": "upwork.com"}.get(platform, "")
        cookies: dict = {}
        for c in data.get("cookies", []):
            name = c.get("name", "")
            value = c.get("value", "")
            cookie_domain = c.get("domain", "")
            if name and value and domain_key in cookie_domain:
                cookies[name] = value
        logger.info(f"[session] Loaded {len(cookies)} cookies for {platform}")
        return cookies
    except Exception as e:
        logger.warning(f"[session] Could not load {platform} cookies: {e}")
        return {}

# ── Models ────────────────────────────────────────────────────────────────────

class ScrapeRequest(BaseModel):
    query: str
    platform: str = "both"   # "upwork" | "freelancer" | "both"
    limit: int = 20
    user_id: Optional[str] = None  # forwarded from API backend for authenticated cookie lookup

class ScrapedProject(BaseModel):
    id: str
    title: str
    description: str
    budget: str
    skills: list[str]
    clientCountry: str
    clientRating: Optional[float]
    postedAt: str
    url: str
    platform: str
    proposalsCount: Optional[int]

# ── Platform result — carries projects + scrape outcome for reporting ─────────

class PlatformResult(NamedTuple):
    projects: list[ScrapedProject]
    status: str   # "success" | "empty" | "platform_blocked" | "error"
    message: str = ""
    error_code: str = ""  # "UPWORK_NOT_CONNECTED" | "UPWORK_COOKIES_EXPIRED" | "UPWORK_CLOUDFLARE_BLOCK" | "UPWORK_RATE_LIMIT"

# ── Internal cookie fetcher ───────────────────────────────────────────────────

async def _fetch_user_cookies(user_id: str, platform: str) -> dict:
    """
    Fetch decrypted platform cookies stored in the API DB for a given user.
    Calls the internal cookies endpoint (requires INTERNAL_SERVICE_KEY env var).
    Returns {cookieName: cookieValue} dict, or {} if unavailable.
    """
    api_base     = os.environ.get("API_BASE_URL", "http://localhost:3001")
    service_key  = os.environ.get("INTERNAL_SERVICE_KEY", "")
    if not service_key or not user_id:
        return {}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{api_base}/api/v1/connections/{platform}/cookies-internal",
                params={"userId": user_id},
                headers={"X-Internal-Key": service_key},
            )
            if resp.status_code == 200:
                raw = resp.json().get("cookies", [])
                cookie_dict: dict = {}
                for c in raw:
                    if isinstance(c, dict):
                        name  = c.get("name", "")
                        value = c.get("value", "")
                        if name and value:
                            cookie_dict[name] = value
                logger.info(
                    f"[cookies] Loaded {len(cookie_dict)} {platform} cookies "
                    f"from DB for user {user_id}"
                )
                return cookie_dict
    except Exception as e:
        logger.warning(f"[cookies] Could not fetch {platform} cookies for user {user_id}: {e}")
    return {}


# ── Browser-like headers ──────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.freelancer.com/",
}

# ── Stealth init script ───────────────────────────────────────────────────────

STEALTH_INIT_SCRIPT = """
// ── WebDriver flag ────────────────────────────────────────────────────────────
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// ── Plugins (empty array = bot signal) ───────────────────────────────────────
Object.defineProperty(navigator, 'plugins', {
  get: () => {
    const arr = [
      { name: 'Chrome PDF Plugin',       filename: 'internal-pdf-viewer',  description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer',       filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
      { name: 'Native Client',           filename: 'internal-nacl-plugin',  description: '' },
    ];
    arr.item = (i) => arr[i];
    arr.namedItem = (n) => arr.find(p => p.name === n) || null;
    arr.refresh = () => {};
    Object.defineProperty(arr, 'length', { get: () => arr.length });
    return arr;
  }
});

// ── Languages ─────────────────────────────────────────────────────────────────
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
Object.defineProperty(navigator, 'language',  { get: () => 'en-US' });

// ── Platform / hardware ───────────────────────────────────────────────────────
Object.defineProperty(navigator, 'platform',          { get: () => 'Win32' });
Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
Object.defineProperty(navigator, 'deviceMemory',       { get: () => 8 });
Object.defineProperty(navigator, 'maxTouchPoints',     { get: () => 0 });

// ── Chrome runtime object (absent in headless = bot signal) ───────────────────
if (!window.chrome) {
  window.chrome = {
    app:        { isInstalled: false, InstallState: {}, RunningState: {} },
    runtime:    { id: undefined, connect: () => {}, sendMessage: () => {} },
    loadTimes: () => ({}),
    csi:        () => ({}),
  };
}

// ── Remove ChromeDriver residue ───────────────────────────────────────────────
['cdc_adoQpoasnfa76pfcZLmcfl_Array',
 'cdc_adoQpoasnfa76pfcZLmcfl_Promise',
 'cdc_adoQpoasnfa76pfcZLmcfl_Symbol'].forEach(k => { try { delete window[k]; } catch(_) {} });

// ── Notification permission (bots often show 'denied') ────────────────────────
const _origQuery = window.navigator.permissions ? window.navigator.permissions.query : null;
if (_origQuery) {
  window.navigator.permissions.query = (params) =>
    params.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : _origQuery(params);
}

// ── WebGL vendor / renderer ───────────────────────────────────────────────────
const _getParam = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function(param) {
  if (param === 37445) return 'Intel Inc.';   // UNMASKED_VENDOR_WEBGL
  if (param === 37446) return 'Intel Iris OpenGL Engine';  // UNMASKED_RENDERER_WEBGL
  return _getParam.call(this, param);
};

// ── Screen dimensions ─────────────────────────────────────────────────────────
Object.defineProperty(screen, 'availWidth',  { get: () => 1280 });
Object.defineProperty(screen, 'availHeight', { get: () => 800 });
Object.defineProperty(screen, 'width',       { get: () => 1280 });
Object.defineProperty(screen, 'height',      { get: () => 800 });
"""

# ── nodriver (CF-bypass) browser singleton ──────────────────────────────────

_nodriver_browser = None
_nodriver_lock = asyncio.Lock()


async def _get_nodriver_browser():
    """Return (or create) the long-lived nodriver Chrome browser."""
    global _nodriver_browser
    async with _nodriver_lock:
        if _nodriver_browser is not None:
            try:
                _ = _nodriver_browser.websocket_url
                await asyncio.wait_for(_nodriver_browser.get("about:blank"), timeout=5)
                return _nodriver_browser
            except Exception as e:
                logger.info(f"[nodriver] Browser lost ({e}), recreating...")
                try:
                    _nodriver_browser.stop()
                except Exception:
                    pass
                _nodriver_browser = None

        try:
            import nodriver as uc  # type: ignore
        except ImportError:
            logger.error("[nodriver] not installed — run: pip install nodriver")
            return None

        chrome_profile_dir = (Path(__file__).parent / ".chrome_profiles" / "upwork").resolve()
        chrome_profile_dir.mkdir(parents=True, exist_ok=True)

        config = uc.Config()
        config.user_data_dir = str(chrome_profile_dir)
        config.add_argument("--window-size=1280,800")
        config.add_argument("--start-minimized")
        config.add_argument("--disable-background-timer-throttling")
        config.add_argument("--disable-backgrounding-occluded-windows")
        config.add_argument("--disable-renderer-backgrounding")
        config.headless = False

        try:
            logger.info("[nodriver] Starting persistent browser...")
            _nodriver_browser = await asyncio.wait_for(uc.start(config=config), timeout=30)
            logger.info("[nodriver] Browser ready")
            return _nodriver_browser
        except Exception as e:
            logger.error(f"[nodriver] Failed to start browser: {e}")
            _nodriver_browser = None
            return None


# ── Freelancer.com ────────────────────────────────────────────────────────────

CURRENCY_SYMBOLS = {1: "USD", 3: "GBP", 7: "EUR", 8: "AUD", 9: "CAD"}

# ── Platform block status codes ───────────────────────────────────────────────
_PLATFORM_BLOCK_CODES = {403, 404, 410, 429, 451}

# ── Keyword expansion for broader related-tech matching ───────────────────────

KEYWORD_EXPANSIONS: dict[str, list[str]] = {
    "react":      ["react", "reactjs", "next.js", "react native", "mern stack"],
    "node":       ["node.js", "nodejs", "nestjs", "express.js"],
    "python":     ["python", "django", "fastapi", "flask"],
    "wordpress":  ["wordpress", "woocommerce", "elementor", "wp theme plugin"],
    "shopify":    ["shopify", "shopify liquid", "shopify app"],
    "ai":         ["artificial intelligence", "machine learning", "chatgpt openai", "langchain llm"],
    "flutter":    ["flutter", "dart", "flutter mobile app"],
    "vue":        ["vue.js", "vuejs", "nuxt.js"],
    "angular":    ["angular", "angular typescript"],
    "php":        ["php", "laravel", "codeigniter", "php developer"],
    "java":       ["java", "spring boot", "java developer"],
    "blockchain": ["solidity", "smart contract", "web3", "ethereum nft"],
    "docker":     ["docker", "kubernetes", "devops", "cicd pipeline"],
    "ios":        ["ios swift", "iphone app", "ios developer"],
    "android":    ["android kotlin", "android app", "android developer"],
    "mern":       ["mern", "react node mongodb", "full stack javascript"],
    "fullstack":  ["full stack", "fullstack developer", "mern mean"],
    "typescript": ["typescript", "ts react", "ts node"],
    "golang":     ["golang", "go developer", "go backend"],
    "rust":       ["rust developer", "rust programming"],
    "aws":        ["aws", "amazon web services", "aws developer"],
    "graphql":    ["graphql", "apollo graphql"],
    "scraping":   ["web scraping", "data extraction", "python scraper"],
    "devops":     ["devops", "docker kubernetes", "cicd"],
    "data":       ["data analysis", "data science", "pandas numpy"],
}


def _expand_keywords(query: str) -> list[str]:
    """Return a list of search terms for a query (original + up to 2 related terms)."""
    q = query.lower().strip()
    for key, expansions in KEYWORD_EXPANSIONS.items():
        if q == key or q.startswith(key + " ") or q.endswith(" " + key):
            return expansions[:3]  # cap at 3 search terms total
    return [query]


def _parse_freelancer_project(p: dict) -> Optional[ScrapedProject]:
    """Parse a single raw Freelancer project dict. Returns None on parse error."""
    try:
        budget = p.get("budget", {})
        currency_id = budget.get("currency_id", 1)
        currency = CURRENCY_SYMBOLS.get(currency_id, "USD")
        b_min = budget.get("minimum", 0)
        b_max = budget.get("maximum", 0)
        budget_str = (
            f"${int(b_min)}–${int(b_max)} {currency}"
            if b_max else f"${int(b_min)}+ {currency}"
        )
        skills = [j.get("name", "") for j in p.get("jobs", []) if j.get("name")]
        country = ""
        owner = p.get("owner", {})
        if isinstance(owner, dict):
            country = owner.get("country", "") or ""
        bid_stats = p.get("bid_stats", {})
        bid_count = bid_stats.get("bid_count") if isinstance(bid_stats, dict) else None
        submitted = p.get("time_submitted", 0)
        posted_str = (
            datetime.utcfromtimestamp(submitted).strftime("%b %d, %Y")
            if submitted else "Unknown"
        )
        project_id = str(p.get("id", uuid.uuid4()))
        seo_url    = p.get("seo_url", "")
        project_url = (
            f"https://www.freelancer.com/projects/{seo_url}"
            if seo_url else f"https://www.freelancer.com/projects/{project_id}"
        )
        desc = (p.get("description", "") or "").strip()
        desc = desc[:500] + ("..." if len(desc) > 500 else "")
        return ScrapedProject(
            id=f"fl_{project_id}",
            title=p.get("title", "Untitled"),
            description=desc,
            budget=budget_str,
            skills=skills[:8],
            clientCountry=country,
            clientRating=None,
            postedAt=posted_str,
            url=project_url,
            platform="freelancer",
            proposalsCount=bid_count,
        )
    except Exception as e:
        logger.warning(f"[freelancer] Error parsing project: {e}")
        return None


async def scrape_freelancer(query: str, limit: int) -> PlatformResult:
    """
    Fetch active projects from Freelancer.com public API with full pagination.
    - Expands keywords for broader coverage (react → next.js, react native, etc.)
    - Paginates up to 1000 total projects, 100 per page, 3 pages in parallel batches
    - Deduplicates results across expanded queries
    """
    MAX_PROJECTS = min(max(limit, 300), 1000)
    PAGE_SIZE    = 100
    BATCH_SIZE   = 3    # pages fetched in parallel per round

    API_URL = "https://www.freelancer.com/api/projects/0.1/projects/active/"
    BASE_PARAMS: dict = {
        "full_description":   "true",
        "job_details":        "true",
        "country_details":    "true",
        "user_details":       "true",
        "compact":            "false",
        "project_statuses[]": "active",
        "sort_field":         "time_updated",
        "reverse_sort":       "true",
    }

    seen_ids: set[str]              = set()
    all_projects: list[ScrapedProject] = []
    expanded_queries                = _expand_keywords(query)
    pages_fetched                   = 0
    start_time                      = time.time()
    blocked_code: Optional[int]     = None

    try:
        async with httpx.AsyncClient(timeout=25, headers=HEADERS) as client:
            for search_query in expanded_queries:
                if len(all_projects) >= MAX_PROJECTS:
                    break

                offset = 0
                while len(all_projects) < MAX_PROJECTS:
                    # Build a parallel batch of page requests
                    batch_offsets = [
                        offset + i * PAGE_SIZE
                        for i in range(BATCH_SIZE)
                        if offset + i * PAGE_SIZE < MAX_PROJECTS
                    ]
                    if not batch_offsets:
                        break

                    async def _get_page(off: int) -> tuple[int, list]:
                        r = await client.get(API_URL, params={
                            **BASE_PARAMS,
                            "query":  search_query,
                            "limit":  PAGE_SIZE,
                            "offset": off,
                            "_t":     str(int(time.time())),
                        })
                        r.raise_for_status()
                        return off, r.json().get("result", {}).get("projects", [])

                    raw_results = await asyncio.gather(
                        *[_get_page(off) for off in batch_offsets],
                        return_exceptions=True,
                    )
                    pages_fetched += len(batch_offsets)

                    hit_empty = False
                    for res in raw_results:
                        if isinstance(res, httpx.HTTPStatusError):
                            blocked_code = res.response.status_code
                            raise res
                        if isinstance(res, Exception):
                            logger.warning(f"[freelancer] Batch page error: {res}")
                            hit_empty = True
                            continue
                        _, page_raw = res
                        if not page_raw:
                            hit_empty = True
                            continue
                        for raw_p in page_raw:
                            parsed = _parse_freelancer_project(raw_p)
                            if parsed and parsed.id not in seen_ids:
                                seen_ids.add(parsed.id)
                                all_projects.append(parsed)

                    if hit_empty:
                        break

                    offset += PAGE_SIZE * BATCH_SIZE
                    if len(all_projects) < MAX_PROJECTS:
                        await asyncio.sleep(0.35)

        elapsed = int((time.time() - start_time) * 1000)
        logger.info(
            f"[freelancer-scrape] '{query}' → {len(all_projects)} projects, "
            f"{pages_fetched} pages, {elapsed}ms (queries: {expanded_queries})"
        )
        return PlatformResult(
            projects=all_projects,
            status="success" if all_projects else "empty",
        )

    except httpx.HTTPStatusError as e:
        code = blocked_code or e.response.status_code
        logger.error(f"[freelancer] HTTP {code}: {e}")
        return PlatformResult(
            projects=all_projects,  # return whatever was collected before block
            status="platform_blocked" if code in _PLATFORM_BLOCK_CODES else "error",
            message=f"Freelancer API returned HTTP {code}",
        )
    except Exception as e:
        logger.error(f"[freelancer] Scrape error: {e}")
        return PlatformResult(projects=all_projects, status="error" if not all_projects else "success", message=str(e))


# ── Upwork ────────────────────────────────────────────────────────────────────

async def scrape_upwork_rss(query: str, limit: int) -> list[ScrapedProject]:
    """
    Primary Upwork scraping method via the public RSS feed.
    No authentication needed; returns recent jobs matching the query.
    """
    import xml.etree.ElementTree as ET

    PAGE_SIZE   = 50
    MAX_PAGES   = 4  # up to 200 results via RSS
    url = "https://www.upwork.com/ab/feed/jobs/rss"

    def _parse_items(root: ET.Element, seen_ids: set[str]) -> list[ScrapedProject]:
        channel = root.find("channel")
        if not channel:
            return []
        items: list[ScrapedProject] = []
        for item in channel.findall("item"):
            title    = (item.findtext("title") or "").strip()
            link     = (item.findtext("link")  or "").strip()
            desc     = (item.findtext("description") or "").strip()
            pub_date = (item.findtext("pubDate") or "Unknown").strip()
            if not title or not link:
                continue
            job_id = link.split("~")[-1].split("?")[0] if "~" in link else str(uuid.uuid4())
            uid = f"uw_{job_id}"
            if uid in seen_ids:
                continue
            seen_ids.add(uid)

            budget = "Negotiable"
            m = re.search(r'(?:Budget|Hourly Range)[:\s]+(\$[\d,./\-]+(?:\s*/hr)?)', desc, re.IGNORECASE)
            if m:
                budget = m.group(1).strip()

            skills: list[str] = []
            ms = re.search(r'Skills:\s*([^\n<]+)', desc, re.IGNORECASE)
            if ms:
                skills = [s.strip() for s in ms.group(1).split(",") if s.strip()][:8]

            clean_desc = re.sub(r'<[^>]+>', ' ', desc).strip()
            clean_desc = re.sub(r'\s+', ' ', clean_desc)[:500]

            items.append(ScrapedProject(
                id=uid,
                title=title,
                description=clean_desc + ("..." if len(clean_desc) == 500 else ""),
                budget=budget,
                skills=skills,
                clientCountry="",
                clientRating=None,
                postedAt=pub_date,
                url=link,
                platform="upwork",
                proposalsCount=None,
            ))
        return items

    try:
        cap        = min(max(limit, 100), MAX_PAGES * PAGE_SIZE)
        result:    list[ScrapedProject] = []
        seen_ids:  set[str] = set()

        async with httpx.AsyncClient(timeout=20, headers=HEADERS, follow_redirects=True) as client:
            for page in range(MAX_PAGES):
                if len(result) >= cap:
                    break
                offset = page * PAGE_SIZE
                params = {
                    "q":      query,
                    "sort":   "recency",
                    "paging": f"{offset};{PAGE_SIZE}",
                }
                resp = await client.get(url, params=params)
                if resp.status_code != 200:
                    logger.warning(f"[upwork-rss] page {page} HTTP {resp.status_code}")
                    break

                content_type = resp.headers.get("content-type", "")
                if "html" in content_type.lower():
                    logger.warning("[upwork-rss] Got HTML instead of RSS — Cloudflare block")
                    break

                root = ET.fromstring(resp.text)
                page_items = _parse_items(root, seen_ids)
                result.extend(page_items)
                logger.info(f"[upwork-rss] page {page} → {len(page_items)} jobs (total {len(result)})")

                if len(page_items) < PAGE_SIZE:
                    break  # last page — no more results

        logger.info(f"[upwork-rss] Retrieved {len(result)} jobs for query={query!r}")
        return result[:cap]

    except Exception as e:
        logger.error(f"[upwork-rss] Error: {e}")
        return []



async def scrape_upwork(query: str, limit: int, user_id: Optional[str] = None) -> PlatformResult:
    """
    Fetch Upwork jobs.  Tries three strategies in order:

    1. RSS feed  (/ab/feed/jobs/rss)  — no auth, most reliable
    2. NX search page HTTP  (/nx/search/jobs/)  — parse __NEXT_DATA__ JSON
       • Uses stored session cookies + DB cookies for the authenticated user
       • If returns 410/403/429 → platform is blocking; skip to step 3 immediately
       • If returns 200 → parse and return
    3. nodriver browser (Cloudflare-bypass Chrome)
       • If 0 results → return platform_blocked with helpful message
    """
    # 1. RSS feed
    rss_results = await scrape_upwork_rss(query, limit)
    if rss_results:
        logger.info(f"[upwork] RSS success — {len(rss_results)} jobs")
        return PlatformResult(projects=rss_results, status="success")

    logger.info("[upwork] RSS returned 0 results, trying NX search HTTP endpoint")

    # 2. NX HTTP endpoint — merge file session cookies with DB cookies for the user
    session_cookies = _load_session_cookies("upwork")
    if user_id:
        db_cookies = await _fetch_user_cookies(user_id, "upwork")
        if db_cookies:
            session_cookies = {**session_cookies, **db_cookies}
            logger.info(f"[upwork-scrape] Using authenticated session from DB for user {user_id}")
        else:
            logger.info(f"[upwork-scrape] No DB cookies for user {user_id}, using file session only")
    else:
        logger.info("[upwork-scrape] Unauthenticated scrape (no user_id)")
    http_blocked = False

    try:
        async with httpx.AsyncClient(
            timeout=20,
            headers={**HEADERS, "Referer": "https://www.upwork.com/", "Accept": "application/json"},
            cookies=session_cookies,
            follow_redirects=True,
        ) as client:
            nx_url = "https://www.upwork.com/nx/search/jobs/"
            resp = await client.get(nx_url, params={"q": query, "sort": "recency"})
            logger.info(f"[upwork] NX HTTP returned {resp.status_code} for query={query!r}")

            if resp.status_code in _PLATFORM_BLOCK_CODES:
                logger.warning(
                    f"[upwork] NX endpoint returned {resp.status_code} — "
                    "platform is blocking HTTP scraping, trying nodriver"
                )
                http_blocked = True
            elif resp.status_code == 200:
                html = resp.text
                match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
                if match:
                    try:
                        page_data = json.loads(match.group(1))
                        jobs_data = (
                            page_data.get("props", {})
                            .get("pageProps", {})
                            .get("results", {})
                            .get("jobs", [])
                        )
                        result: list[ScrapedProject] = []
                        for job in jobs_data[:limit]:
                            try:
                                skills = [s.get("prefLabel", "") for s in job.get("attrs", []) if s.get("prefLabel")]
                                budget_amount = job.get("amount", {})
                                if isinstance(budget_amount, dict):
                                    b_min = budget_amount.get("minimum", 0)
                                    b_max = budget_amount.get("maximum", 0)
                                    budget_str = f"${b_min}–${b_max}" if b_max else f"${b_min}+"
                                else:
                                    hourly = job.get("hourlyBudget", {})
                                    budget_str = (
                                        f"${hourly.get('min', 0)}–${hourly.get('max', 0)}/hr"
                                        if hourly else "Negotiable"
                                    )

                                client_info = job.get("client", {}) or {}
                                country = client_info.get("location", {}).get("country", "") if isinstance(client_info, dict) else ""
                                rating  = client_info.get("rating") if isinstance(client_info, dict) else None

                                job_id    = str(job.get("id", uuid.uuid4()))
                                ciphertext = job.get("ciphertext", job_id)
                                desc = (job.get("description", "") or "").strip()
                                desc = desc[:500] + ("..." if len(desc) > 500 else "")

                                result.append(ScrapedProject(
                                    id=f"uw_{job_id}",
                                    title=job.get("title", "Untitled"),
                                    description=desc,
                                    budget=budget_str,
                                    skills=skills[:8],
                                    clientCountry=country,
                                    clientRating=float(rating) if rating else None,
                                    postedAt=job.get("createdOn", "Unknown"),
                                    url=f"https://www.upwork.com/jobs/~{ciphertext}",
                                    platform="upwork",
                                    proposalsCount=job.get("proposalsTier"),
                                ))
                            except Exception as e:
                                logger.warning(f"[upwork] Error parsing NX job: {e}")
                                continue

                        if result:
                            logger.info(f"[upwork] NX HTTP parsed {len(result)} jobs")
                            return PlatformResult(projects=result, status="success")
                        else:
                            logger.warning("[upwork] NX HTTP returned 200 but 0 jobs parsed")
                    except (json.JSONDecodeError, KeyError) as e:
                        logger.warning(f"[upwork] NX __NEXT_DATA__ parse failed: {e}")
                else:
                    logger.warning("[upwork] NX HTTP 200 but no __NEXT_DATA__ found")
            else:
                logger.warning(f"[upwork] NX HTTP unexpected status {resp.status_code}")

    except Exception as e:
        logger.warning(f"[upwork] NX HTTP request failed: {e}")

    # 3. nodriver browser fallback
    logger.info("[upwork] Trying nodriver browser fallback")
    nodriver_results = await scrape_upwork_playwright(query, limit)
    if nodriver_results:
        logger.info(f"[upwork] nodriver success — {len(nodriver_results)} jobs")
        return PlatformResult(projects=nodriver_results, status="success")

    # All methods failed — pick the most accurate error code
    has_cookies = bool(session_cookies)

    if user_id and not has_cookies:
        # User is logged in but no session was found for this platform
        error_code = "UPWORK_NOT_CONNECTED"
        msg = "No Upwork session found. Connect your account in Profile for results."
    elif http_blocked and has_cookies:
        # Had cookies but platform still blocked → cookies likely expired
        error_code = "UPWORK_COOKIES_EXPIRED"
        msg = "Your Upwork session has expired. Reconnect in Profile to resume."
    elif http_blocked:
        # No cookies, CF block
        error_code = "UPWORK_CLOUDFLARE_BLOCK"
        msg = (
            "Upwork is blocking automated HTTP requests. "
            "Connect your account in Profile for authenticated results."
        )
    else:
        error_code = "UPWORK_CLOUDFLARE_BLOCK"
        msg = "All Upwork scraping methods returned 0 results. The session may be expired."

    logger.error(f"[upwork] All methods failed for query={query!r}: {error_code}")
    return PlatformResult(projects=[], status="platform_blocked", message=msg, error_code=error_code)


async def scrape_upwork_playwright(query: str, limit: int) -> list[ScrapedProject]:
    """
    Scrape Upwork using nodriver — a CF-bypass Chrome automation library.
    Uses a persistent browser so Cloudflare only challenges on first launch.
    Returns an empty list (not an exception) if browser is unavailable.
    """
    browser = await _get_nodriver_browser()
    if browser is None:
        logger.warning("[upwork-nodriver] Browser unavailable")
        return []

    search_url = f"https://www.upwork.com/nx/search/jobs/?q={quote_plus(query)}&sort=recency"
    logger.info(f"[upwork-nodriver] Searching: {search_url}")

    try:
        page = await browser.get(search_url)

        for _ in range(20):
            title_r = await page.evaluate("document.title")
            title = title_r.get("value", "") if isinstance(title_r, dict) else str(title_r or "")
            if "just a moment" not in title.lower() and "challenge" not in title.lower():
                break
            await asyncio.sleep(1.5)

        final_title_r = await page.evaluate("document.title")
        final_title = final_title_r.get("value", "") if isinstance(final_title_r, dict) else str(final_title_r or "")
        logger.info(f"[upwork-nodriver] Title: {final_title!r}")

        if "challenge" in final_title.lower() or "just a moment" in final_title.lower():
            logger.warning("[upwork-nodriver] CF challenge not resolved; reconnect on Profile page")
            return []

        await asyncio.sleep(2.5)

        rows_r = await page.evaluate("""
(() => {
  const jobs = [];
  const seen = new Set();
  const headings = Array.from(document.querySelectorAll('h2 a, h3 a'));
  for (const a of headings) {
    const href = a.href || '';
    const title = (a.textContent || '').trim();
    if (!title || title.length < 5 || seen.has(href || title)) continue;
    seen.add(href || title);
    let card = a;
    for (let i = 0; i < 10 && card; i++) {
      card = card.parentElement;
      const p = card && card.querySelector('p');
      if (p && (p.textContent || '').trim().length > 20) break;
    }
    let desc = '', budget = '', skills = [];
    if (card) {
      const dEl = card.querySelector('p, [class*="description"]');
      if (dEl) desc = (dEl.textContent || '').trim().substring(0, 300);
      const bEl = card.querySelector('[class*="budget"],[class*="price"],[class*="fixed"]');
      if (bEl) budget = (bEl.textContent || '').trim();
      card.querySelectorAll('[class*="skill"],[class*="tag"],span[class*="token"]').forEach(s => {
        const t = (s.textContent || '').trim();
        if (t && t.length < 40) skills.push(t);
      });
    }
    jobs.push({ href, title, desc, budget, skills: skills.slice(0, 8) });
    if (jobs.length >= 50) break;
  }
  return jobs;
})()
""")

        if isinstance(rows_r, dict) and "value" in rows_r:
            rows_r = rows_r["value"]

        rows: list = []
        if isinstance(rows_r, list):
            for item in rows_r:
                if isinstance(item, dict) and "title" in item:
                    rows.append(item)
                elif isinstance(item, dict) and "value" in item:
                    rows.append(item["value"])

        result: list[ScrapedProject] = []
        for row in rows[:min(limit, 50)]:
            if not isinstance(row, dict):
                continue
            href   = (row.get("href") or "").strip()
            title  = (row.get("title") or "Untitled").strip()
            desc   = (row.get("desc") or "Project details available on Upwork.").strip()
            budget = (row.get("budget") or "Negotiable").strip() or "Negotiable"
            skills = row.get("skills") or []
            job_slug = href.split("/jobs/~")[-1].split("?")[0] if "/jobs/~" in href else str(uuid.uuid4())
            result.append(ScrapedProject(
                id=f"uw_{job_slug}",
                title=title,
                description=desc[:500] + ("..." if len(desc) > 500 else ""),
                budget=budget,
                skills=skills,
                clientCountry="",
                clientRating=None,
                postedAt="Unknown",
                url=href or search_url,
                platform="upwork",
                proposalsCount=None,
            ))

        logger.info(f"[upwork-nodriver] Retrieved {len(result)} jobs for {query!r}")
        if not result:
            logger.warning("[upwork-nodriver] 0 jobs — session may need renewal (reconnect on Profile page)")
        return result

    except Exception as e:
        logger.error(f"[upwork-nodriver] Error: {e}")
        global _nodriver_browser
        _nodriver_browser = None
        return []


# ── Browser-based Platform Login ──────────────────────────────────────────────

PLATFORM_LOGIN_URLS: dict[str, str] = {
    "upwork":     "https://www.upwork.com/ab/account-security/login",
    "freelancer": "https://www.freelancer.com/login",
}

_AUTH_FLOW_FRAGMENTS: dict[str, list[str]] = {
    "freelancer": [
        "/login", "/signup", "/captcha", "/challenge", "/challenges",
        "/verification", "/verify", "/confirm", "/security-check",
        "/recaptcha", "/blocked",
    ],
    "upwork": [
        "/login", "/account-security/login", "/account-security/otp",
        "/account-security/phone", "/account-security/sms",
        "/account-security/device", "/account-security/challenge",
        "/account-security/verify", "/captcha", "/challenges", "/signup",
    ],
}

_POST_LOGIN_CONFIRMED: dict[str, list[str]] = {
    "freelancer": [
        "/dashboard", "/find-projects", "/messages", "/notifications",
        "/my-profile", "/feed", "/home", "/manage", "/discover",
        "/projects", "/users/", "/contest", "/search/projects",
    ],
    "upwork": [
        "/nx/find-work", "/home", "/freelancers/", "/messages",
        "/nx/proposals", "/nx/dashboard", "/ab/proposals", "/my-jobs",
    ],
}


def _is_post_login(platform: str, url: str) -> bool:
    if not url or not isinstance(url, str):
        return False

    url_lower = url.lower()
    from urllib.parse import urlparse
    try:
        parsed = urlparse(url_lower)
        path_only = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    except Exception:
        path_only = url_lower

    auth_frags = _AUTH_FLOW_FRAGMENTS.get(platform, [])
    post_frags = _POST_LOGIN_CONFIRMED.get(platform, [])

    domain_map = {"freelancer": "freelancer.com", "upwork": "upwork.com"}
    domain = domain_map.get(platform, "")

    if domain not in path_only:
        logger.debug(f"[_is_post_login] SKIP — wrong domain. url={url!r}")
        return False

    matched_auth = next((f for f in auth_frags if f in path_only), None)
    if matched_auth:
        logger.debug(f"[_is_post_login] REJECT (auth-flow) — matched {matched_auth!r} in {path_only!r}")
        return False

    matched_post = next((f for f in post_frags if f in path_only), None)
    if matched_post:
        logger.info(f"[_is_post_login] ACCEPT (post-login) — matched {matched_post!r} in {path_only!r}")
        return True

    is_root = path_only.rstrip("/") in (f"https://{domain}", f"https://www.{domain}")
    if not is_root:
        logger.info(f"[_is_post_login] ACCEPT (fallback domain match) — {path_only!r}")
        return True

    logger.debug(f"[_is_post_login] SKIP — bare domain root, still waiting. url={url!r}")
    return False


def _stealth_chromium_args() -> list[str]:
    return [
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
        "--disable-extensions",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1280,800",
        "--start-maximized",
        "--disable-web-security",
        "--allow-running-insecure-content",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-site-isolation-trials",
        "--lang=en-US",
    ]


class BrowserConnectResponse(BaseModel):
    success: bool = True
    platform: str
    cookies: list[dict]
    username: Optional[str] = None
    email: Optional[str] = None


@app.post("/auth/browser-connect/{platform}", response_model=BrowserConnectResponse)
async def browser_connect(platform: str):
    """
    Opens a visible Chromium window on the platform login page.
    Waits up to 6 minutes for the user to complete login, then captures cookies.

    Launches browser_worker.py as a separate subprocess so that sync_playwright
    runs in its own process with its own event loop.  This avoids the
    NotImplementedError / silent deadlock that occurs when sync_playwright is
    run inside ThreadPoolExecutor on Windows Python 3.13 with Uvicorn.
    """
    logger.info(f"[browser-connect] endpoint hit for {platform}")

    if platform not in PLATFORM_LOGIN_URLS:
        raise HTTPException(status_code=400, detail=f"Unsupported platform: {platform}")

    scraper_dir = Path(__file__).parent
    worker_script = scraper_dir / "browser_worker.py"
    output_file = tempfile.mktemp(suffix=".json", prefix=f"bc_{platform}_")

    logger.info(f"[browser-connect] Launching browser_worker.py subprocess for {platform}")

    process = subprocess.Popen(
        [sys.executable, str(worker_script), platform, "--output", output_file],
        cwd=str(scraper_dir),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    def _stream_worker_output() -> None:
        try:
            for line in iter(process.stdout.readline, ""):
                line = line.rstrip("\n")
                if line:
                    logger.info(f"[worker] {line}")
        except Exception:
            pass

    import threading
    log_thread = threading.Thread(target=_stream_worker_output, daemon=True)
    log_thread.start()

    loop = asyncio.get_running_loop()
    try:
        await asyncio.wait_for(
            loop.run_in_executor(None, process.wait),
            timeout=360.0,
        )
    except asyncio.TimeoutError:
        logger.error(f"[browser-connect] Worker timed out for {platform} — killing subprocess")
        process.kill()
        log_thread.join(timeout=2)
        try:
            os.unlink(output_file)
        except Exception:
            pass
        raise HTTPException(status_code=408, detail="Login timed out after 6 minutes. Please try again.")

    log_thread.join(timeout=2)
    logger.info(f"[browser-connect] Worker exited with code {process.returncode} for {platform}")

    try:
        with open(output_file, "r", encoding="utf-8") as f:
            result_data = json.load(f)
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Browser worker did not produce output. Check logs.")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Browser worker output corrupt: {exc}")
    finally:
        try:
            os.unlink(output_file)
        except Exception:
            pass

    if "error" in result_data:
        error_msg = result_data["error"]
        if "LOGIN_TIMEOUT" in error_msg:
            raise HTTPException(
                status_code=408,
                detail="Login timed out. Complete the login (including any CAPTCHA) within 5 minutes.",
            )
        logger.error(f"[browser-connect] Worker reported error for {platform}: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Browser login failed: {error_msg}")

    logger.info(f"[browser-connect] ✓ {platform} connect complete — username={result_data.get('username')!r}")
    return BrowserConnectResponse(
        platform=result_data["platform"],
        cookies=result_data.get("cookies", []),
        username=result_data.get("username"),
        email=result_data.get("email"),
    )


@app.delete("/auth/browser-connect/{platform}/session")
async def clear_session(platform: str):
    """Clear the saved session state for a platform. Forces a fresh login next time."""
    if platform not in PLATFORM_LOGIN_URLS:
        raise HTTPException(status_code=400, detail=f"Unsupported platform: {platform}")
    session_file = _session_path(platform)
    if session_file.exists():
        session_file.unlink()
        logger.info(f"[browser-connect] Cleared session for {platform}")
    return {"message": f"Session cleared for {platform}"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_username(page, platform: str) -> Optional[str]:
    """Best-effort extraction of the logged-in username from the page."""
    selectors = {
        "upwork": [
            '[data-test="up-s-name"]',
            ".up-s-name",
            '[data-test="ProfileCard"] h2',
        ],
        "freelancer": [
            '[data-c-id="header-username"]',
            ".header-username",
            "[data-cy='username']",
            ".username-text",
        ],
    }
    for sel in selectors.get(platform, []):
        try:
            el = page.query_selector(sel)
            if el:
                text = el.inner_text().strip()
                if text:
                    logger.info(f"[browser-connect] Extracted username for {platform}: {text!r}")
                    return text
        except Exception:
            continue
    logger.info(f"[browser-connect] Could not extract username for {platform}")
    return None


def _status_badge_css(message: str, color: str = "#1A56DB") -> str:
    return f"""
    #freelancer-os-badge {{ all: unset; }}
    body::after {{
        content: "{message}";
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: {color};
        color: white;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-family: sans-serif;
        font-weight: 600;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0,0,0,.25);
        pointer-events: none;
    }}
    """


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "scraper", "timestamp": datetime.utcnow().isoformat()}


@app.post("/scrape")
async def scrape(req: ScrapeRequest) -> dict:
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query is required")

    limit_per = req.limit if req.platform != "both" else req.limit // 2 + req.limit % 2

    # Run platform scrapers concurrently, tracking per-platform outcomes
    freelancer_task = None
    upwork_task     = None

    if req.platform in ("freelancer", "both"):
        freelancer_task = asyncio.create_task(scrape_freelancer(req.query, limit_per))
    if req.platform in ("upwork", "both"):
        upwork_task = asyncio.create_task(scrape_upwork(req.query, limit_per, req.user_id))

    all_projects: list[ScrapedProject] = []
    platform_outcomes: dict = {}

    for platform_name, task in [("freelancer", freelancer_task), ("upwork", upwork_task)]:
        if task is None:
            continue
        try:
            result: PlatformResult = await task
            all_projects.extend(result.projects)
            platform_outcomes[platform_name] = {
                "status":     result.status,
                "count":      len(result.projects),
                "message":    result.message,
                "error_code": result.error_code,
            }
            logger.info(
                f"[scrape] {platform_name}: status={result.status} count={len(result.projects)}"
            )
        except Exception as e:
            logger.error(f"[scrape] {platform_name} task raised exception: {e}")
            platform_outcomes[platform_name] = {
                "status":     "error",
                "count":      0,
                "message":    str(e),
                "error_code": "",
            }

    logger.info(
        f"[scrape] Total {len(all_projects)} projects for query={req.query!r} "
        f"platform={req.platform!r}"
    )

    return {
        "projects":         [p.model_dump() for p in all_projects],
        "total":            len(all_projects),
        "query":            req.query,
        "platform":         req.platform,
        "platformOutcomes": platform_outcomes,
    }


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn, sys, os
    _here = os.path.dirname(os.path.abspath(__file__))
    if _here not in sys.path:
        sys.path.insert(0, _here)
    uvicorn.run("api:app", host="0.0.0.0", port=8001, reload=True, reload_dirs=[_here])
