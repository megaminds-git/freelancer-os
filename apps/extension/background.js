/* ── Freelancer OS Connector — Background Service Worker ── */
'use strict';

// Load platform scrapers before anything else (synchronous, runs in global scope)
importScripts('scrapers/upwork.js', 'scrapers/freelancer.js');

// ── Keep-alive ────────────────────────────────────────────────────────────────

let _keepAliveInterval = null;
function startKeepAlive() {
  _keepAliveInterval = setInterval(() => { chrome.runtime.getPlatformInfo(() => {}); }, 20000);
}
function stopKeepAlive() {
  if (_keepAliveInterval) { clearInterval(_keepAliveInterval); _keepAliveInterval = null; }
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.type === 'SCRAPE') {
    chrome.storage.local.get(
      ['apiUrl', 'authToken', 'selectedKeywords', 'selectedTechStack', 'lastPlatform', 'scrapeFilters'],
    ).then((stored) => {
      const apiUrl    = msg.apiUrl    || stored.apiUrl    || 'http://localhost:3001';
      const authToken = msg.authToken || stored.authToken || '';
      if (!authToken) {
        const err = 'No auth token. Open the extension popup, paste your token, and click Save & Test.';
        chrome.storage.local.set({ scrapeStatus: err });
        chrome.runtime.sendMessage({ type: 'SCRAPE_DONE', error: err }).catch(() => {});
        return;
      }
      const query    = msg.query    || (stored.selectedKeywords || []).join(', ') || stored.lastQuery || '';
      const platform = msg.platform || stored.lastPlatform || 'both';
      if (!query) {
        chrome.runtime.sendMessage({ type: 'SCRAPE_DONE', error: 'No keywords configured.' }).catch(() => {});
        return;
      }
      // Use caller-supplied filters and tech stack first, then stored as fallback
      const filters  = msg.filters  || stored.scrapeFilters || null;
      const techStack = msg.techStack || stored.selectedTechStack || [];
      handleScrape({ query, platform, apiUrl, authToken, filters, techStack }).catch(console.error);
    });
    sendResponse({ started: true });
    return false;
  }

  if (msg.type === 'AUTO_SCRAPE_ON') {
    chrome.storage.local.get(['scheduleInterval']).then((d) => {
      const interval = d.scheduleInterval || 15;
      chrome.alarms.clear('autoScrape', () => {
        chrome.alarms.create('autoScrape', { periodInMinutes: interval });
        console.log(`[extension] Auto-scrape enabled with ${interval} min interval`);
      });
    });
    // Trigger one immediate cycle so users see results right after enabling automation.
    runAutoScrapeCycle('manual-enable').catch(console.error);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'AUTO_SCRAPE_OFF') {
    chrome.alarms.clear('autoScrape', () => {
      console.log('[extension] Auto-scrape disabled');
    });
    sendResponse({ ok: true });
    return false;
  }

  // Restart alarm with updated interval (called when schedule config changes from web app)
  if (msg.type === 'RESCHEDULE_IF_ACTIVE') {
    chrome.storage.local.get(['autoScrape', 'scheduleInterval'], (d) => {
      if (d.autoScrape) {
        const interval = d.scheduleInterval || 15;
        chrome.alarms.clear('autoScrape', () => {
          chrome.alarms.create('autoScrape', { periodInMinutes: interval });
          console.log(`[extension] Auto-scrape rescheduled to ${interval} min interval`);
        });
      }
    });
    sendResponse({ ok: true });
    return false;
  }
});

// ── Alarm (auto-scrape) ───────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'autoScrape') return;

  await runAutoScrapeCycle('alarm');
});

async function runAutoScrapeCycle(trigger = 'alarm') {

  const data = await chrome.storage.local.get([
    'lastQuery', 'lastPlatform', 'apiUrl', 'authToken', 'autoScrape',
    'scheduleDays', 'scheduleStartHour', 'scheduleEndHour', 'scrapeFilters', 'selectedKeywords', 'selectedTechStack',
  ]);

  const resolvedQuery = (data.selectedKeywords || []).join(', ') || data.lastQuery || '';
  if (!data.autoScrape || !resolvedQuery || !data.authToken) {
    console.log('[auto-scrape] Skipped — autoScrape disabled or missing config');
    if (data.autoScrape) {
      const status = !resolvedQuery
        ? 'Auto-scrape skipped: add at least one keyword in extension settings.'
        : 'Auto-scrape skipped: missing auth token in extension settings.';
      chrome.storage.local.set({ scrapeStatus: status });
      chrome.runtime.sendMessage({ type: 'SCRAPE_STATUS', message: status }).catch(() => {});
    }
    return;
  }

  const enforceScheduleWindow = trigger === 'alarm';

  // Day-of-week guard (enforced only for alarm-driven runs)
  const now        = new Date();
  const todayIndex = now.getDay();
  const activeDays = data.scheduleDays ?? [1, 2, 3, 4, 5];
  if (enforceScheduleWindow && !activeDays.includes(todayIndex)) {
    console.log('[auto-scrape] Skipped — today not in scheduled days');
    const status = 'Auto-scrape skipped: today is not enabled in schedule days.';
    chrome.storage.local.set({ scrapeStatus: status });
    chrome.runtime.sendMessage({ type: 'SCRAPE_STATUS', message: status }).catch(() => {});
    return;
  }

  // Hour-range guard (enforced only for alarm-driven runs)
  const startHour = data.scheduleStartHour ?? 9;
  const endHour   = data.scheduleEndHour   ?? 18;
  if (enforceScheduleWindow && (now.getHours() < startHour || now.getHours() >= endHour)) {
    console.log(`[auto-scrape] Skipped — outside window ${startHour}:00–${endHour}:00`);
    const status = `Auto-scrape skipped: outside schedule window ${startHour}:00-${endHour}:00.`;
    chrome.storage.local.set({ scrapeStatus: status });
    chrome.runtime.sendMessage({ type: 'SCRAPE_STATUS', message: status }).catch(() => {});
    return;
  }

  console.log(`[auto-scrape] Running (${trigger}) at ${now.toLocaleTimeString()} for "${resolvedQuery}" on ${data.lastPlatform || 'both'}`);
  await handleScrape({
    query:     resolvedQuery,
    platform:  data.lastPlatform || 'both',
    apiUrl:    data.apiUrl    || 'http://localhost:3001',
    authToken: data.authToken,
    filters:   data.scrapeFilters || null,
    techStack: data.selectedTechStack || [],
  }).catch(console.error);
}

// ── Main scrape orchestrator ──────────────────────────────────────────────────

async function handleScrape({ query, platform, apiUrl, authToken, filters = null, techStack = [] }) {
  startKeepAlive();

  const notify = (message) => {
    chrome.storage.local.set({ scrapeStatus: message });
    chrome.runtime.sendMessage({ type: 'SCRAPE_STATUS', message }).catch(() => {});
  };

  try {
    // Split comma-separated query into individual keywords; scrape each separately
    const keywords      = query.split(',').map(k => k.trim()).filter(Boolean);
    const uniqueKws     = [...new Set(keywords)];
    const isMulti       = uniqueKws.length > 1;

    console.log(`[extension] Scraping ${uniqueKws.length} keyword(s): "${uniqueKws.join(', ')}" on ${platform}`);

    const seenIds     = new Set();
    const allProjects = [];

    for (const kw of uniqueKws) {
      if (isMulti) notify(`Searching "${kw}" (${uniqueKws.indexOf(kw) + 1}/${uniqueKws.length})…`);

      if (platform === 'upwork' || platform === 'both') {
        notify(isMulti ? `[${kw}] Scraping Upwork…` : 'Scraping Upwork…');
        const uw = await scrapeUpwork(kw, notify);
        for (const p of uw) { if (!seenIds.has(p.id)) { seenIds.add(p.id); allProjects.push(p); } }
        notify(isMulti ? `[${kw}] Upwork: ${uw.length}` : `Upwork: ${uw.length} found`);
      }

      if (platform === 'freelancer' || platform === 'both') {
        notify(isMulti ? `[${kw}] Scraping Freelancer…` : 'Scraping Freelancer…');
        const fl = await scrapeFreelancer(kw, notify);
        for (const p of fl) { if (!seenIds.has(p.id)) { seenIds.add(p.id); allProjects.push(p); } }
        notify(isMulti ? `[${kw}] Freelancer: ${fl.length}` : `Freelancer: ${fl.length} found`);
      }
    }

    const scrapedCount = allProjects.length;

    // ── 24-hour freshness: REJECT if timestamp is missing or older than 24 h ──
    const now          = Date.now();
    const TWENTY_FOUR  = 24 * 60 * 60 * 1000;
    const freshProjects = allProjects.filter(p => {
      if (!p._postedMs || p._postedMs <= 0) return false; // no timestamp → reject
      return (now - p._postedMs) <= TWENTY_FOUR;
    });

    const staleDropped = scrapedCount - freshProjects.length;
    if (staleDropped > 0) {
      console.log(`[extension] Dropped ${staleDropped} project(s) (no timestamp or older than 24 h)`);
    }

    // ── Criteria filtering (keywords + verification + ratings + tech stack) ────
    const matchedProjects = applyFilters(freshProjects, filters, uniqueKws, techStack);
    const matchedCount    = matchedProjects.length;
    console.log(`[extension] ${scrapedCount} scraped → ${freshProjects.length} fresh → ${matchedCount} matched`);

    // Strip internal _postedMs before sending to API
    const toSend = matchedProjects.map(({ _postedMs, ...rest }) => rest);

    notify(`${scrapedCount} scraped → ${matchedCount} matched — sending to app…`);

    // Send to both endpoints: extension-results (for Find Projects cache)
    // and auto-results (for Automation page display)
    // Both endpoints are critical for data flow — retry if one fails
    try {
      await sendProjectsToApi({ query, platform, projects: toSend, apiUrl, authToken });
    } catch (err) {
      console.warn('[extension] Failed to send to extension-results:', err?.message);
      // Continue anyway — try auto-results
    }
    try {
      await sendResultsToAutomation({ query, platform, projects: toSend, apiUrl, authToken });
    } catch (err) {
      console.warn('[extension] Failed to send to auto-results:', err?.message);
      // Continue anyway — at least one endpoint should have received data
    }

    const statusMsg = scrapedCount !== matchedCount
      ? `Done — ${scrapedCount} scraped → ${matchedCount} matched`
      : `Done — ${matchedCount} projects found`;

    chrome.storage.local.set({
      scrapeStatus:     statusMsg,
      lastScrapeTime:   Date.now(),
      lastScrapeCount:  matchedCount,
      lastScrapedTotal: scrapedCount,
    });
    chrome.runtime.sendMessage({
      type: 'SCRAPE_DONE',
      count: matchedCount,
      scrapedTotal: scrapedCount,
    }).catch(() => {});

  } catch (err) {
    const errMsg = err?.message || String(err);
    console.error('[extension] Scrape error:', errMsg);
    chrome.storage.local.set({ scrapeStatus: `Error: ${errMsg}` });
    chrome.runtime.sendMessage({ type: 'SCRAPE_DONE', error: errMsg }).catch(() => {});
  } finally {
    stopKeepAlive();
  }
}

// ── Filter projects ───────────────────────────────────────────────────────────
// STRICT FILTERING: A project passes only if it matches ALL selected criteria.

// Normalize tech name: strip dots, spaces, dashes, #, + so "node.js" == "nodejs"
function _normTech(s) {
  return s.toLowerCase().replace(/[.\s\-+#]/g, '');
}

// Whole-word regex: prevents "React" from matching "Proactive" or "node" from "standalone"
function _techWordRe(tech) {
  const escaped = tech.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(?:^|[^a-z0-9])' + escaped + '(?:[^a-z0-9]|$)', 'i');
}

function applyFilters(projects, filters, keywords, techStack = []) {
  return projects.filter(p => {
    // 1. MAIN QUERY KEYWORDS (OR: at least one must appear as a whole word)
    if (keywords && keywords.length > 0) {
      const text = ((p.title || '') + ' ' + (p.description || ''));
      const hasKeyword = keywords.some(k => _techWordRe(k).test(text));
      if (!hasKeyword) return false;
    }

    // 2. TECH STACK (AND: ALL selected techs must be present)
    if (techStack && techStack.length > 0) {
      const skillSet = (p.skills ?? []).map(s => _normTech(s));
      const text     = ((p.title || '') + ' ' + (p.description || ''));

      const hasAllTechs = techStack.every(t => {
        const tNorm = _normTech(t);
        // First try normalised exact match in skills list
        if (skillSet.some(s => s === tNorm || s.includes(tNorm))) return true;
        // Fall back to whole-word match in title/description
        return _techWordRe(t).test(text);
      });
      if (!hasAllTechs) return false;
    }

    if (!filters) return true;

    // 3. VERIFICATION FLAGS (AND: all selected must be true)
    if (filters.paymentVerified && p.paymentVerified === false) return false;
    if (filters.profileVerified && p.identityVerified === false) return false;
    if (filters.depositMade     && p.depositMade      === false) return false;

    // 4. NUMERIC THRESHOLDS (AND: all must pass when platform supplies the value)
    if (filters.minReviews > 0 && p.clientReviewCount != null && p.clientReviewCount < filters.minReviews) return false;
    if (filters.minRating  > 0 && p.clientRating      != null && p.clientRating      < filters.minRating)  return false;

    return true;
  });
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function sendProjectsToApi({ query, platform, projects, apiUrl, authToken }) {
  const resp = await fetch(`${apiUrl}/api/v1/scraper/extension-results`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query, platform, projects }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `API ${resp.status}`);
  }
  return resp.json();
}

async function sendResultsToAutomation({ query, platform, projects, apiUrl, authToken }) {
  const resp = await fetch(`${apiUrl}/api/v1/scraper/auto-results`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query, platform, projects, source: 'extension' }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `auto-results API ${resp.status}`);
  }
  return resp.json();
}
