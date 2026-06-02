/**
 * Freelancer OS Connector — App Bridge Content Script
 *
 * Two-way bridge between the Freelancer OS web app and the extension background
 * service worker. Communicates via custom DOM events (page ↔ bridge) and
 * chrome.runtime messages (bridge ↔ background).
 *
 * Events the web page can dispatch:
 *   FOS_SCRAPE_REQUEST   — trigger a manual scrape
 *   FOS_AUTO_SCRAPE      — enable/disable auto-scrape alarm
 *   FOS_GET_EXT_STATE    — request current extension state snapshot
 *   FOS_SET_EXT_STATE    — push config changes into extension storage
 *
 * Events the web page receives:
 *   FOS_SCRAPE_RESPONSE      — ack for FOS_SCRAPE_REQUEST
 *   FOS_SCRAPE_EVENT         — SCRAPE_STATUS / SCRAPE_DONE forwarded from background
 *   FOS_EXT_STATE            — response to FOS_GET_EXT_STATE
 *   FOS_EXT_STATE_CHANGED    — fired whenever relevant storage keys change
 */

'use strict';

let _extContextInvalidNotified = false;

// ── Signal presence to the web page ──────────────────────────────────────────
// window.__FOS_EXTENSION_INSTALLED__ is set by app-bridge-main.js (MAIN world).
// The meta tag is a CSP-safe secondary check for the isolated world.
try {
  const marker = document.createElement('meta');
  marker.setAttribute('name', 'fos-extension-installed');
  marker.setAttribute('content', chrome.runtime.id);
  (document.head || document.documentElement).appendChild(marker);
} catch (err) {
  if (isContextInvalidError(err)) notifyContextInvalidated();
}

// ── Storage keys that the web app cares about ─────────────────────────────────
const STATE_KEYS = [
  'autoScrape', 'selectedKeywords', 'selectedTechStack', 'lastPlatform',
  'scrapeFilters', 'scheduleInterval', 'scheduleDays',
  'scheduleStartHour', 'scheduleEndHour',
  'scrapeStatus', 'lastScrapeTime', 'lastScrapeCount', 'lastScrapedTotal',
];

function isContextInvalidError(err) {
  const msg = (err && err.message) ? String(err.message) : '';
  return msg.includes('Extension context invalidated');
}

function notifyContextInvalidated() {
  if (_extContextInvalidNotified) return;
  _extContextInvalidNotified = true;
  window.dispatchEvent(new CustomEvent('FOS_EXT_CONTEXT_INVALIDATED'));
}

function getLastErrorSafe() {
  try {
    return chrome.runtime.lastError || null;
  } catch (err) {
    if (isContextInvalidError(err)) notifyContextInvalidated();
    return null;
  }
}

function safeGet(keys, cb) {
  try {
    chrome.storage.local.get(keys, (result) => {
      try {
        const lastError = getLastErrorSafe();
        if (lastError) {
          if (isContextInvalidError(lastError)) notifyContextInvalidated();
          return;
        }
        cb(result);
      } catch (err) {
        if (isContextInvalidError(err)) notifyContextInvalidated();
      }
    });
  } catch (err) {
    if (isContextInvalidError(err)) notifyContextInvalidated();
  }
}

function safeSet(data, cb) {
  try {
    chrome.storage.local.set(data, () => {
      try {
        const lastError = getLastErrorSafe();
        if (lastError) {
          if (isContextInvalidError(lastError)) notifyContextInvalidated();
          return;
        }
        if (cb) cb();
      } catch (err) {
        if (isContextInvalidError(err)) notifyContextInvalidated();
      }
    });
  } catch (err) {
    if (isContextInvalidError(err)) notifyContextInvalidated();
  }
}

function safeSendMessage(payload, cb) {
  try {
    chrome.runtime.sendMessage(payload, (response) => {
      try {
        const lastError = getLastErrorSafe();
        if (lastError) {
          if (isContextInvalidError(lastError)) notifyContextInvalidated();
          return;
        }
        if (cb) cb(response);
      } catch (err) {
        if (isContextInvalidError(err)) notifyContextInvalidated();
      }
    });
  } catch (err) {
    if (isContextInvalidError(err)) notifyContextInvalidated();
  }
}

// ── Web page → Extension: manual scrape ──────────────────────────────────────
window.addEventListener('FOS_SCRAPE_REQUEST', (event) => {
  const detail = event.detail || {};
  // Read stored apiUrl, authToken, filters, and techStack so the background
  // has everything it needs even when the popup is closed.
  safeGet(['apiUrl', 'authToken', 'scrapeFilters', 'selectedTechStack'], (stored) => {
    safeSendMessage({
      type:      'SCRAPE',
      query:     detail.query    || '',
      platform:  detail.platform || 'both',
      apiUrl:    stored.apiUrl    || '',
      authToken: stored.authToken || '',
      filters:   stored.scrapeFilters  || null,
      techStack: stored.selectedTechStack || [],
    }, (response) => {
      window.dispatchEvent(new CustomEvent('FOS_SCRAPE_RESPONSE', { detail: response }));
    });
  });
});

// ── Web page → Extension: toggle auto-scrape alarm ───────────────────────────
window.addEventListener('FOS_AUTO_SCRAPE', (event) => {
  const detail = event.detail || {};
  safeSendMessage({
    type: detail.enabled ? 'AUTO_SCRAPE_ON' : 'AUTO_SCRAPE_OFF',
  });
});

// ── Web page → Extension: request full state snapshot ────────────────────────
window.addEventListener('FOS_GET_EXT_STATE', () => {
  safeGet(STATE_KEYS, (state) => {
    window.dispatchEvent(new CustomEvent('FOS_EXT_STATE', { detail: state || {} }));
  });
});

// ── Web page → Extension: push config changes ────────────────────────────────
// The Automation page writes here when the user changes settings so both the
// extension popup and the background alarm stay in sync.
window.addEventListener('FOS_SET_EXT_STATE', (event) => {
  const updates = event.detail || {};
  if (!updates || Object.keys(updates).length === 0) return;

  safeSet(updates, () => {
    if ('autoScrape' in updates) {
      // Toggle the background alarm
      const type = updates.autoScrape ? 'AUTO_SCRAPE_ON' : 'AUTO_SCRAPE_OFF';
      safeSendMessage({ type });
    }
    if ('scheduleInterval' in updates && !('autoScrape' in updates)) {
      // Restart alarm with the new interval when it is already running
      safeSendMessage({ type: 'RESCHEDULE_IF_ACTIVE' });
    }
  });
});

// ── Extension → Web page: forward scrape progress messages ───────────────────
try {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SCRAPE_STATUS' || msg.type === 'SCRAPE_DONE') {
      window.dispatchEvent(new CustomEvent('FOS_SCRAPE_EVENT', { detail: msg }));
    }
    return false;
  });
} catch (err) {
  if (isContextInvalidError(err)) notifyContextInvalidated();
}

// ── Extension storage → Web page: broadcast relevant changes ─────────────────
// Fires FOS_EXT_STATE_CHANGED whenever the extension popup (or background) writes
// to any of the tracked storage keys so the Automation page can react instantly.
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const hasRelevant = STATE_KEYS.some(k => k in changes);
    if (!hasRelevant) return;

    const delta = {};
    for (const key of STATE_KEYS) {
      if (key in changes) delta[key] = changes[key].newValue;
    }
    window.dispatchEvent(new CustomEvent('FOS_EXT_STATE_CHANGED', { detail: delta }));
  });
} catch (err) {
  if (isContextInvalidError(err)) notifyContextInvalidated();
}
