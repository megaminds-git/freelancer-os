# Browser Connect — Debug Log

## What we're trying to do
When you click **Connect** on the Profile page, the app should:
1. Call `POST /api/v1/connections/:platform/browser-connect` (Node API, port 3001)
2. Node API proxies to `POST /auth/browser-connect/:platform` (Python scraper, port 8001)
3. Python scraper launches a browser, opens the platform login page
4. User logs in manually inside the browser window
5. Scraper detects the post-login URL, captures cookies, saves session
6. Result sent back to Node API → stored in DB → UI shows "Connected"

---

## Problems encountered and what we tried

### Problem 1 — Silent deadlock (original bug)
`sync_playwright` was running inside `concurrent.futures.ThreadPoolExecutor`.  
On Windows Python 3.13 + Uvicorn, `sync_playwright` internally calls `asyncio.create_subprocess_exec`,  
which raises `NotImplementedError` on `SelectorEventLoop` — error was swallowed, endpoint hung forever.

**Fix:** Moved `sync_playwright` into a separate subprocess (`browser_worker.py`) with its own event loop.  
Result: ✅ Browser now opens correctly.

---

### Problem 2 — Wrong browser (channel="chrome")
Tried switching from bundled Chromium to the real installed Google Chrome using `channel="chrome"`.  
Browser did not open at all.

**Fix:** Used `executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe"` directly.  
Result: ✅ Chrome opened, but login detection broke (see Problem 3).

---

### Problem 3 — Login not detected after logging in (real Chrome)
After logging in inside the Chrome window, the scraper kept showing "Waiting for login..." and never detected the session.  
Root cause: When Chrome is already running on the machine, Playwright launches into the existing Chrome process.  
This means Playwright does not have reliable control over page events and `page.url` tracking.

**Fix:** Reverted to bundled Chromium (no `executable_path`, no `channel`).  
Playwright has full isolated control over its own Chromium process.  
Result: ✅ Browser opens, login page loads, URL polling logs show every second.

---

### Problem 4 — Still not connecting after login (current issue)
User logs in successfully inside the Chromium window (dashboard visible).  
The "Waiting for login..." badge remains — session never captured — UI never updates to "Connected".

**Current state of the detection logic (`_is_post_login`):**
- Checks that the URL contains the platform domain (`freelancer.com` / `upwork.com`)
- Rejects URLs that contain auth-flow fragments (`/login`, `/challenge`, `/captcha`, etc.)
- Accepts URLs that contain known post-login fragments (`/dashboard`, `/find-projects`, `/messages`, etc.)
- Falls back to accepting any domain URL that is not the root and not an auth fragment

**What we added to debug:**
- Per-second logging: `[worker] [Ns] URL='...' detected=True/False`
- Nav-event listener on `page.on("framenavigated")` as a secondary detection path

**Next things to check:**
- Look at the scraperlog output after login to see what URL is being polled
- Check if Freelancer is redirecting to a URL not in `_POST_LOGIN_CONFIRMED` list
- Check if `_is_post_login` is rejecting the post-login URL due to a false-positive auth fragment match
- Verify the scraper process is actually still alive when the user finishes logging in (not killed by timeout)

---

## Architecture summary

```
Browser (5173)
    ↓ click Connect
Node API (3001)  →  axios.post → Python Scraper (8001)
                                      ↓
                               browser_worker.py (subprocess)
                                      ↓
                               Chromium window opens
                                      ↓
                               User logs in manually
                                      ↓
                               Detect post-login URL
                                      ↓
                               Capture cookies + username
                                      ↓
                               Write result to temp JSON file
                                      ↓
                     Scraper reads JSON → returns to Node API
                                      ↓
                     Node API → upsertConnection() → DB
                                      ↓
                     UI polls → shows "Connected"
```

---

## Files involved

| File | Role |
|------|------|
| `apps/scraper/api.py` | FastAPI app, `browser_connect()` endpoint — spawns browser_worker.py |
| `apps/scraper/browser_worker.py` | Standalone Playwright script — opens browser, detects login, writes JSON |
| `apps/api/src/routes/connections.ts` | Node route — proxies to scraper, saves result to DB |
| `apps/web/src/pages/Profile.tsx` | UI — Connect button, status polling |
