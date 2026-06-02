#!/usr/bin/env python3
"""
browser_worker.py — Standalone Playwright browser login worker.

Run as:
    python browser_worker.py {platform} --output {output_file.json}

This script is launched as a separate subprocess by api.py's browser_connect
endpoint.  Running in its own process avoids the asyncio event-loop conflicts
that occur when sync_playwright is run inside ThreadPoolExecutor on Windows
Python 3.13 with Uvicorn (SelectorEventLoop does not support
create_subprocess_exec → NotImplementedError, swallowed silently → deadlock).

Output contract
───────────────
On success  → writes {"platform": "...", "cookies": [...], "username": "...", "email": "..."}
On timeout  → writes {"error": "LOGIN_TIMEOUT"}
On error    → writes {"error": "<message>"}
Exit code 0 = success, non-zero = failure.
"""

import argparse
import json
import logging
import sys
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

# ── Windows: force ProactorEventLoop BEFORE any asyncio import ────────────────
# sync_playwright internally calls asyncio.new_event_loop() to spin up the
# Playwright Node.js subprocess via create_subprocess_exec.  On Windows,
# SelectorEventLoop (the default) raises NotImplementedError for that call.
# ProactorEventLoop supports it.  This must be set at process startup.
if sys.platform == "win32":
    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
    force=True,
)
logger = logging.getLogger(__name__)

# ── Session persistence ───────────────────────────────────────────────────────
SESSION_DIR = Path(__file__).parent / ".sessions"
SESSION_DIR.mkdir(exist_ok=True)

CHROME_PROFILE_BASE = Path(__file__).parent / ".chrome_profiles"
CHROME_PROFILE_BASE.mkdir(exist_ok=True)


def _session_path(platform: str) -> Path:
    return SESSION_DIR / f"{platform}_session.json"


# ── Platform constants ────────────────────────────────────────────────────────
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

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}

STEALTH_INIT_SCRIPT = """
// ── WebDriver flag ────────────────────────────────────────────────────────────
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// ── Plugins ───────────────────────────────────────────────────────────────────
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

Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
Object.defineProperty(navigator, 'language',  { get: () => 'en-US' });
Object.defineProperty(navigator, 'platform',          { get: () => 'Win32' });
Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
Object.defineProperty(navigator, 'deviceMemory',       { get: () => 8 });
Object.defineProperty(navigator, 'maxTouchPoints',     { get: () => 0 });

if (!window.chrome) {
  window.chrome = {
    app:        { isInstalled: false, InstallState: {}, RunningState: {} },
    runtime:    { id: undefined, connect: () => {}, sendMessage: () => {} },
    loadTimes: () => ({}),
    csi:        () => ({}),
  };
}

['cdc_adoQpoasnfa76pfcZLmcfl_Array',
 'cdc_adoQpoasnfa76pfcZLmcfl_Promise',
 'cdc_adoQpoasnfa76pfcZLmcfl_Symbol'].forEach(k => { try { delete window[k]; } catch(_) {} });

const _origQuery = window.navigator.permissions ? window.navigator.permissions.query : null;
if (_origQuery) {
  window.navigator.permissions.query = (params) =>
    params.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : _origQuery(params);
}

const _getParam = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function(param) {
  if (param === 37445) return 'Intel Inc.';
  if (param === 37446) return 'Intel Iris OpenGL Engine';
  return _getParam.call(this, param);
};

Object.defineProperty(screen, 'availWidth',  { get: () => 1280 });
Object.defineProperty(screen, 'availHeight', { get: () => 800 });
Object.defineProperty(screen, 'width',       { get: () => 1280 });
Object.defineProperty(screen, 'height',      { get: () => 800 });
"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _stealth_chromium_args() -> list[str]:
    return [
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-infobars",
        "--window-size=1280,800",
        "--lang=en-US",
    ]


def _find_chrome() -> Optional[str]:
    """Return path to real Chrome, or None to use bundled Chromium."""
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    for p in candidates:
        if Path(p).exists():
            return p
    return None


def _is_post_login(platform: str, url: str) -> bool:
    if not url or not isinstance(url, str):
        return False

    url_lower = url.lower()
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
        return False

    if next((f for f in auth_frags if f in path_only), None):
        return False

    if next((f for f in post_frags if f in path_only), None):
        logger.info(f"[worker] ACCEPT (post-login match) — {path_only!r}")
        return True

    is_root = path_only.rstrip("/") in (f"https://{domain}", f"https://www.{domain}")
    if not is_root:
        logger.info(f"[worker] ACCEPT (fallback domain match) — {path_only!r}")
        return True

    # Bare root domain after being away from auth page = also accepted
    # (Upwork sometimes redirects to https://www.upwork.com/ after login)
    if is_root:
        logger.info(f"[worker] ACCEPT (root domain after auth) — {path_only!r}")
        return True

    return False


def _extract_username(page, platform: str) -> Optional[str]:
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
                    logger.info(f"[worker] Extracted username for {platform}: {text!r}")
                    return text
        except Exception:
            continue
    logger.info(f"[worker] Could not extract username for {platform}")
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


def _write_result(output_file: str, data: dict) -> None:
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f)
    logger.info(f"[worker] Result written to {output_file}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Standalone Playwright browser login worker")
    parser.add_argument("platform", help="Platform: upwork or freelancer")
    parser.add_argument("--output", required=True, help="Path to write JSON result")
    args = parser.parse_args()

    platform = args.platform.lower()
    output_file = args.output

    if platform not in PLATFORM_LOGIN_URLS:
        _write_result(output_file, {"error": f"Unsupported platform: {platform}"})
        sys.exit(1)

    logger.info(f"[worker] Starting browser login for platform={platform}")
    logger.info(f"[worker] Output file: {output_file}")

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        msg = "Playwright not installed. Run: pip install playwright && python -m playwright install chromium"
        logger.error(f"[worker] {msg}")
        _write_result(output_file, {"error": msg})
        sys.exit(1)

    _stealth_fn = None
    try:
        from playwright_stealth import stealth_sync
        _stealth_fn = stealth_sync
        logger.info("[worker] playwright-stealth available — enhanced stealth active")
    except ImportError:
        logger.info("[worker] playwright-stealth not installed — using manual stealth script")

    login_url   = PLATFORM_LOGIN_URLS[platform]
    session_file = _session_path(platform)

    import traceback

    try:
        chrome_path = _find_chrome()
        profile_dir = CHROME_PROFILE_BASE / platform
        profile_dir.mkdir(parents=True, exist_ok=True)

        if chrome_path:
            logger.info(f"[worker] Using real Chrome: {chrome_path}")
        else:
            logger.info("[worker] Chrome not found — using bundled Chromium")
        logger.info(f"[worker] Profile dir: {profile_dir}")

        with sync_playwright() as pw:
            launch_kwargs: dict = {
                "headless":    False,
                "args":        _stealth_chromium_args(),
                "user_agent":  HEADERS["User-Agent"],
                "viewport":    {"width": 1280, "height": 800},
                "locale":      "en-US",
                "timezone_id": "America/New_York",
                "permissions": ["geolocation"],
            }
            if chrome_path:
                launch_kwargs["executable_path"] = chrome_path

            context = pw.chromium.launch_persistent_context(
                str(profile_dir),
                **launch_kwargs,
            )
            logger.info(f"[worker] Browser launched OK ({'real Chrome' if chrome_path else 'bundled Chromium'})")

            # Apply stealth init script to context (runs before every page)
            context.add_init_script(STEALTH_INIT_SCRIPT)
            page = context.new_page()

            # Apply playwright-stealth if available (JS-level patches)
            if _stealth_fn:
                try:
                    _stealth_fn(page)
                    logger.info("[worker] playwright-stealth applied")
                except Exception as e:
                    logger.warning(f"[worker] playwright-stealth failed ({e})")

            page.goto(login_url, wait_until="domcontentloaded", timeout=30000)
            logger.info(f"[worker] Opened {platform} login page — URL: {page.url}")

            # Fast-path: saved session already authenticated
            if _is_post_login(platform, page.url):
                logger.info(f"[worker] ✓ Already logged in via saved session for {platform}")
                cookies = context.cookies()
                try:
                    context.storage_state(path=str(session_file))
                except Exception:
                    pass
                username = _extract_username(page, platform)
                try:
                    context.close()
                except Exception:
                    pass
                _write_result(output_file, {
                    "platform": platform,
                    "cookies":  cookies,
                    "username": username,
                    "email":    None,
                })
                return

            # Show status badge
            try:
                page.add_style_tag(content=_status_badge_css("Waiting for login..."))
            except Exception:
                pass

            login_detected = [False]

            # Only cookies that are ONLY present when authenticated (not set for anon visitors)
            # visitor_id / recognized are set for ALL users — exclude them
            auth_cookie_names = {
                "freelancer": {"PHPSESSID", "fl_session", "fl_auth", "freelancer_token"},
                "upwork":     {"user_uid", "oauth2_global_js_token"},
            }

            # Track ALL pages opened in this context (Upwork may open a new tab after login)
            all_pages: list = [page]

            def _attach_nav_listener(p) -> None:
                def on_nav(frame):
                    try:
                        current = frame.url
                        if not login_detected[0] and _is_post_login(platform, current):
                            login_detected[0] = True
                            logger.info(f"[worker] ✓ Login detected (nav event) — {current}")
                    except Exception as e:
                        logger.debug(f"[worker] Nav-event error: {e}")
                p.on("framenavigated", on_nav)

            _attach_nav_listener(page)

            def on_new_context_page(new_page) -> None:
                all_pages.append(new_page)
                logger.info(f"[worker] New tab/page opened: {new_page.url}")
                _attach_nav_listener(new_page)

            context.on("page", on_new_context_page)

            MAX_WAIT = 300  # 5 minutes
            consecutive_errors = 0
            for tick in range(MAX_WAIT):
                if login_detected[0]:
                    break
                try:
                    # Check ALL open pages/tabs — Upwork may navigate in a new tab.
                    # Use page.url (Playwright committed URL) as primary — it is always
                    # up to date even during SPA navigation.  Fall back to evaluate()
                    # as an enhancement for SPA pushState that Playwright hasn't committed.
                    for p in list(all_pages):
                        try:
                            current = p.url  # primary: always accurate, never throws
                        except Exception:
                            continue
                        # Optionally enhance with JS location.href for SPA pushState
                        try:
                            js_url = p.evaluate("() => window.location.href")
                            if js_url and isinstance(js_url, str) and js_url.startswith("http"):
                                current = js_url
                        except Exception:
                            pass  # keep page.url value

                        detected = _is_post_login(platform, current)
                        logger.info(f"[worker] [{tick}s] URL={current!r} detected={detected}")
                        if detected:
                            login_detected[0] = True
                            logger.info(f"[worker] ✓ Login detected (URL poll) — {current}")
                            break

                    if login_detected[0]:
                        break

                    # Cookie-based fallback: reliable auth cookies only (not visitor cookies)
                    if tick >= 5:
                        cookies_now = context.cookies()
                        found = {c["name"] for c in cookies_now} & auth_cookie_names.get(platform, set())
                        if found:
                            # Any page in context on the platform domain and NOT on auth page?
                            domain_key = {"freelancer": "freelancer.com", "upwork": "upwork.com"}.get(platform, "")
                            for p in list(all_pages):
                                try:
                                    cur = p.evaluate("() => window.location.href")
                                except Exception:
                                    cur = getattr(p, "url", "")
                                on_domain    = domain_key in cur
                                not_on_auth  = not any(f in cur for f in _AUTH_FLOW_FRAGMENTS.get(platform, []))
                                if on_domain and not_on_auth:
                                    login_detected[0] = True
                                    logger.info(
                                        f"[worker] ✓ Login detected (auth cookie {found}) — {cur}"
                                    )
                                    break

                    if login_detected[0]:
                        break

                    consecutive_errors = 0
                except Exception as e:
                    consecutive_errors += 1
                    logger.warning(f"[worker] [{tick}s] poll error (#{consecutive_errors}): {e}")
                    if consecutive_errors >= 10:
                        logger.error("[worker] Too many consecutive errors — page likely closed")
                        break
                time.sleep(1)

            # Grace check — extra 5 seconds for any final redirect to settle
            if not login_detected[0]:
                time.sleep(5)
                try:
                    domain_key = {"freelancer": "freelancer.com", "upwork": "upwork.com"}.get(platform, "")
                    # Check all pages (original + any new tabs opened during login)
                    for p in list(all_pages):
                        try:
                            current = p.url
                        except Exception:
                            continue
                        try:
                            js_url = p.evaluate("() => window.location.href")
                            if js_url and isinstance(js_url, str) and js_url.startswith("http"):
                                current = js_url
                        except Exception:
                            pass
                        logger.info(f"[worker] Grace check URL: {current!r}")
                        if _is_post_login(platform, current):
                            login_detected[0] = True
                            logger.info(f"[worker] ✓ Login detected (grace URL) — {current}")
                            break
                        # Last resort: authoritative auth cookies present + off the auth page
                        cookies_now = context.cookies()
                        found = {c["name"] for c in cookies_now} & auth_cookie_names.get(platform, set())
                        on_domain   = domain_key in current
                        not_on_auth = not any(f in current for f in _AUTH_FLOW_FRAGMENTS.get(platform, []))
                        if found and on_domain and not_on_auth:
                            login_detected[0] = True
                            logger.info(f"[worker] ✓ Login detected (grace cookie {found}) — {current}")
                            break
                except Exception:
                    pass

            if not login_detected[0]:
                logger.error(f"[worker] Login not detected after {MAX_WAIT}s for {platform}")
                try:
                    context.close()
                except Exception:
                    pass
                _write_result(output_file, {"error": "LOGIN_TIMEOUT"})
                sys.exit(2)

            # Success
            try:
                page.add_style_tag(content=_status_badge_css("✓ Logged in! Saving session...", "#10B981"))
            except Exception:
                pass
            page.wait_for_timeout(4000)

            cookies = context.cookies()
            logger.info(f"[worker] ✓ Captured {len(cookies)} cookies for {platform}")

            try:
                context.storage_state(path=str(session_file))
                logger.info(f"[worker] ✓ Session saved → {session_file}")
            except Exception as e:
                logger.warning(f"[worker] Could not save session: {e}")

            # Try to extract username from whichever page is post-login (may be a new tab)
            username = None
            for p in reversed(list(all_pages)):  # newest tab first
                username = _extract_username(p, platform)
                if username:
                    break

            try:
                context.close()
            except Exception as e:
                logger.warning(f"[worker] Error closing browser: {e}")

        _write_result(output_file, {
            "platform": platform,
            "cookies":  cookies,
            "username": username,
            "email":    None,
        })

    except Exception as e:
        logger.error(f"[worker] Fatal error: {e}\n{traceback.format_exc()}")
        _write_result(output_file, {"error": str(e)})
        sys.exit(1)


if __name__ == "__main__":
    main()
