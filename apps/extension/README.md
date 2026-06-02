# Freelancer OS Connector — Chrome Extension

A Manifest V3 Chrome extension that replaces Playwright-based scraping with
direct browser-session scraping. Works in **Chrome, Brave, Edge, Opera, Vivaldi, Arc**
— any Chromium-based browser.

## What it does

1. **Connect accounts** — reads cookies from your logged-in browser sessions on
   Upwork and Freelancer.com and sends them to the Freelancer OS API.
2. **Scrape projects** — fetches projects from Upwork (via DOM or NX search endpoint)
   and Freelancer.com (via their public API with your cookies), then sends results
   to the Freelancer OS app.

Because it uses your real browser session, Cloudflare bot detection is bypassed
completely.

---

## Setup (one-time)

### 1. Generate extension icons

```bash
cd apps/extension/icons
python create_icons.py
```

This creates `icon16.png`, `icon48.png`, and `icon128.png` (solid blue, no deps).

### 2. Load the extension in your browser

| Browser | URL to open             |
|---------|-------------------------|
| Chrome  | `chrome://extensions`   |
| Brave   | `brave://extensions`    |
| Edge    | `edge://extensions`     |
| Opera   | `opera://extensions`    |

1. Enable **Developer mode** (toggle in top-right corner)
2. Click **Load unpacked**
3. Select the `apps/extension/` folder
4. The "Freelancer OS Connector" icon appears in your toolbar

### 3. Get your extension token

1. Open the **Freelancer OS** web app
2. Go to **Settings** → **Chrome Extension**
3. Click **Generate Token**
4. Copy the token

### 4. Configure the extension

1. Click the extension icon in your toolbar
2. In **API Connection**:
   - **API URL**: `http://localhost:3001` (or your deployed URL)
   - **Auth Token**: paste the token from step 3
3. Click **Save & Test** — you should see "Connected to Freelancer OS" ✅

---

## Connecting your platform accounts

### Upwork

1. Make sure you are **logged into Upwork** in the same browser
2. Open the extension popup
3. Under **Platform Accounts → Upwork**, click **Connect**
4. The extension reads your Upwork cookies and sends them to the API
5. Status changes to **Connected** ✅

### Freelancer.com

Same steps as above but for Freelancer.com.

If you see "Not logged in", open `https://www.freelancer.com` in a tab, log in,
then come back and click **Connect** again.

---

## Scraping projects

1. Open the extension popup
2. In **Project Scraping**, type a search query (e.g. `React developer`)
3. Select a platform (Both / Upwork / Freelancer)
4. Click **Scrape Now**
5. Watch the status line — e.g. "Upwork: 147 jobs found"
6. When done, open Freelancer OS → **Find Projects** and search with the same query
   — extension results appear immediately

### Auto-scrape

Toggle **Auto-scrape** ON to repeat the last query every 5 minutes in the background.
Results are always available in the Freelancer OS app.

---

## Disconnecting

Click **Disconnect** next to any platform to remove stored cookies from the API.

**Refresh** re-reads current cookies from your browser (useful when you re-login
or cookies change).

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Not connected" after Save & Test | Check API URL and token. Make sure Freelancer OS API is running |
| Upwork Connect says "Not logged in" | Log into upwork.com first, then retry |
| Freelancer Connect says "Not logged in" | Log into freelancer.com first, then retry |
| 0 projects after scrape | You may be logged out of the platform — Reconnect |
| Extension not loading | Make sure you ran `create_icons.py` first — icons are required |
| Upwork opens a new window | Normal — tab-based scraping minimizes it automatically. Close when done |

---

## Security notes

- Your platform cookies are **encrypted at rest** in the Freelancer OS database
- The extension only reads cookies for `upwork.com` and `freelancer.com`
- The extension token expires after **30 days** — regenerate it in Settings
- All API communication is over your local network (or HTTPS if deployed)
