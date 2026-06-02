/**
 * Upwork scraping — service worker module.
 * Loaded by background.js via importScripts('scrapers/upwork.js').
 */

'use strict';

const UW_MAX_PROJECTS = 200;
const UW_PAGE_SIZE    = 50;
const UW_STOP_AGE_MS  = 24 * 60 * 60 * 1000; // match the 24h freshness filter in handleScrape

async function scrapeUpwork(query, notify) {
  notify('Fetching Upwork RSS feed…');
  const results = await scrapeUpworkRss(query, notify);
  console.log(`[upwork] ${results.length} projects for "${query}"`);
  return results;
}

async function scrapeUpworkRss(query, notify) {
  const projects = [];
  const seenIds  = new Set();
  const now      = Date.now();

  for (let offset = 0; offset < UW_MAX_PROJECTS; offset += UW_PAGE_SIZE) {
    const pageNo = Math.floor(offset / UW_PAGE_SIZE) + 1;
    notify(`Upwork RSS: page ${pageNo}…`);

    // Try without cookies first; retry with cookies if that returns nothing
    let pageResults = await fetchUpworkRssPage(query, offset, false);
    if (pageResults.length === 0) pageResults = await fetchUpworkRssPage(query, offset, true);
    if (pageResults.length === 0) break;

    let pageHasRecent = false;
    for (const p of pageResults) {
      if (seenIds.has(p.id)) continue;
      seenIds.add(p.id);
      projects.push(p);
      if (p._postedMs > 0 && now - p._postedMs <= UW_STOP_AGE_MS) pageHasRecent = true;
      if (projects.length >= UW_MAX_PROJECTS) break;
    }

    if (!pageHasRecent && pageResults.length > 0) {
      console.log(`[upwork] Early stop at page ${pageNo} — all results older than 12 h`);
      break;
    }
    if (pageResults.length < UW_PAGE_SIZE || projects.length >= UW_MAX_PROJECTS) break;
  }

  return projects;
}

async function fetchUpworkRssPage(query, offset, useCookies) {
  try {
    const headers = {
      Accept: 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://www.upwork.com/',
    };

    if (useCookies) {
      const cookies   = await chrome.cookies.getAll({ domain: '.upwork.com' });
      // Prioritise session/auth cookies; strip tracking-only cookies to keep header small
      const important = cookies.filter(c =>
        c.name.startsWith('oauth') ||
        c.name.startsWith('XSRF')  ||
        c.name.startsWith('user_')  ||
        c.name === 'visitor_id'     ||
        c.name === 'vst'            ||
        c.name === 'eid',
      );
      const all = important.length > 0 ? important : cookies;
      const cookieStr = all.map(c => `${c.name}=${c.value}`).join('; ');
      if (cookieStr) headers.Cookie = cookieStr;
    }

    const url  = `https://www.upwork.com/ab/feed/jobs/rss?q=${encodeURIComponent(query)}&sort=recency&paging=${offset};${UW_PAGE_SIZE}`;
    const resp = await fetch(url, { headers });

    if (!resp.ok) {
      console.warn(`[upwork] RSS HTTP ${resp.status} offset=${offset} useCookies=${useCookies}`);
      return [];
    }

    const text    = await resp.text();
    const trimmed = text.trim();

    if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<rss') && !trimmed.startsWith('<feed')) {
      console.warn(`[upwork] Non-XML response offset=${offset} (first 120): ${trimmed.substring(0, 120)}`);
      return [];
    }

    const parser = new DOMParser();
    const doc    = parser.parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) {
      console.warn(`[upwork] XML parse error at offset=${offset}`);
      return [];
    }

    const items = [...doc.querySelectorAll('item')].map(parseUpworkRssItem).filter(Boolean);
    if (items.length > 0) {
      console.log(`[upwork] offset=${offset} useCookies=${useCookies} → ${items.length} items`);
    }
    return items;
  } catch (e) {
    console.error(`[upwork] Fetch error offset=${offset}: ${e.message}`);
    return [];
  }
}

function parseUpworkRssItem(item) {
  const title   = item.querySelector('title')?.textContent?.trim() || '';
  // <link> in RSS 2.0 is text content; <guid> is a reliable fallback
  const link    = item.querySelector('link')?.textContent?.trim()
               || item.querySelector('guid')?.textContent?.trim()
               || '';
  const rawDesc = item.querySelector('description')?.textContent?.trim() || '';
  const pubDate = item.querySelector('pubDate')?.textContent?.trim()     || '';

  if (!title || !link) return null;

  // Strip HTML tags and decode common HTML entities
  const clean = rawDesc
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/\s{2,}/g, ' ')
    .trim();

  // ── Budget ──────────────────────────────────────────────────────────────────
  // Upwork RSS uses "Budget: $500" for fixed and "Hourly Range: $25.00-$50.00/hr"
  const budgetHourly = clean.match(/Hourly\s+Range\s*[:\s]+(\$[\d,.]+(?: ?[-–] ?\$[\d,.]+)?(?:\s*\/hr)?)/i);
  const budgetFixed  = clean.match(/Budget\s*[:\s]+(\$[\d,./\-]+)/i);
  const budget       = (budgetHourly?.[1] || budgetFixed?.[1] || 'Negotiable').trim();

  // ── Skills ──────────────────────────────────────────────────────────────────
  // Format in description: "Skills: React, Node.js, TypeScript"
  // Stop at the next labelled field to avoid greedily grabbing everything
  const skillsM = clean.match(/Skills\s*[:\s]+([^]+?)(?:\s+(?:Country|Category|Posted On|Budget|Hourly|Proposals|$))/i)
                 || clean.match(/Skills\s*[:\s]+(.+)/i);
  const skills = skillsM
    ? skillsM[1]
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0 && s.length < 50 && !/^\d+$/.test(s))
        .slice(0, 10)
    : [];

  // ── Client country ──────────────────────────────────────────────────────────
  const countryM = clean.match(/Country\s*[:\s]+([A-Za-z\s]{2,40?})(?:\s+(?:Skills|Category|Posted|Budget|Hourly|Proposals)|$)/i);
  const clientCountry = (countryM?.[1] || '').trim();

  // ── Proposals count ─────────────────────────────────────────────────────────
  // Upwork shows "Less than 5", "5 to 10", "10 to 15", "15 to 20", "20 to 50", "50+"
  let proposalsCount = null;
  const proposalsM = clean.match(/Proposals\s*[:\s]+([^\n.]+)/i);
  if (proposalsM) {
    const raw = proposalsM[1].trim();
    const digits = raw.match(/\d+/g);
    if (digits) {
      // "Less than 5" → 4, "5 to 10" → 5, "50+" → 50
      proposalsCount = parseInt(digits[0], 10);
      if (/less\s+than/i.test(raw)) proposalsCount = Math.max(0, proposalsCount - 1);
    }
  }

  // ── Job ID & timestamp ──────────────────────────────────────────────────────
  const cleanLink = link.split('?')[0]; // strip query params before ID extraction
  const jobId  = cleanLink.includes('~') ? cleanLink.split('~')[1] : crypto.randomUUID();
  const parsed = pubDate ? new Date(pubDate) : new Date(NaN);

  return {
    id:                `uw_${jobId}`,
    title,
    description:       clean.substring(0, 600),
    budget,
    skills,
    clientCountry,
    clientRating:      null,
    clientReviewCount: null,
    paymentVerified:   null,
    identityVerified:  null,
    postedAt:          pubDate || 'Unknown',
    url:               link,
    platform:          'upwork',
    proposalsCount,
    _postedMs:         isNaN(parsed.getTime()) ? 0 : parsed.getTime(),
  };
}
