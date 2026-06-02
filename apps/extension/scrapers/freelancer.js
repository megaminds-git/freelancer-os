/**
 * Freelancer scraping — service worker module.
 * Loaded by background.js via importScripts('scrapers/freelancer.js').
 *
 * Uses Freelancer's public REST API with session cookies.
 * user_details: true returns employer reputation + verification status,
 * which lets the extension apply payment/identity/rating filters accurately.
 */

'use strict';

const FL_CURRENCY = { 1: 'USD', 3: 'GBP', 7: 'EUR', 8: 'AUD', 9: 'CAD' };
const FL_MAX      = 1000;
const FL_PAGE     = 100;
const FL_BATCH    = 3;
const FL_API      = 'https://www.freelancer.com/api/projects/0.1/projects/active/';
const FL_PARAMS   = {
  full_description: 'true',
  job_details: 'true',
  user_details: 'true',
  upgrade_details: 'false',
  compact: 'false',
  'project_statuses[]': 'active',
  sort_field: 'time_updated',
  reverse_sort: 'true',
};

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function scrapeFreelancer(query, notify) {
  let cookieStr = '';
  try {
    const cookies = await chrome.cookies.getAll({ domain: '.freelancer.com' });
    cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  } catch { /* proceed without cookies — API is partly public */ }

  const seenIds     = new Set();
  const allProjects = [];
  let offset        = 0;
  let batchNum      = 1;

  while (allProjects.length < FL_MAX) {
    const offsets = [];
    for (let i = 0; i < FL_BATCH; i++) {
      const off = offset + i * FL_PAGE;
      if (off < FL_MAX) offsets.push(off);
    }
    if (offsets.length === 0) break;

    notify(`Freelancer: batch ${batchNum} (${allProjects.length} found)…`);

    const settled = await Promise.allSettled(
      offsets.map(off => _fetchFlPage(query, FL_PAGE, off, cookieStr)),
    );

    let hitEmpty = false;
    for (const res of settled) {
      if (res.status === 'rejected') { hitEmpty = true; continue; }
      const projects = res.value;
      if (!projects || projects.length === 0) { hitEmpty = true; continue; }
      for (const p of projects) {
        const pid = `fl_${p.id}`;
        if (seenIds.has(pid)) continue;
        seenIds.add(pid);
        const parsed = _parseFlProject(p);
        if (parsed) allProjects.push(parsed);
      }
    }

    if (hitEmpty) break;
    offset   += FL_PAGE * FL_BATCH;
    batchNum += 1;
    await _sleep(350 + Math.random() * 100);
  }

  console.log(`[freelancer] ${allProjects.length} projects for "${query}"`);
  return allProjects;
}

async function _fetchFlPage(query, limit, offset, cookieStr) {
  const params = new URLSearchParams({
    ...FL_PARAMS, query,
    limit: String(limit),
    offset: String(offset),
    _t: String(Math.floor(Date.now() / 1000)),
  });
  const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  if (cookieStr) headers['Cookie'] = cookieStr;
  const resp = await fetch(`${FL_API}?${params}`, { headers });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return data?.result?.projects ?? [];
}

function _parseFlProject(p) {
  try {
    const budget    = p.budget || {};
    const currency  = FL_CURRENCY[budget.currency_id] || 'USD';
    const bMin      = Math.round(budget.minimum || 0);
    const bMax      = Math.round(budget.maximum || 0);
    const budgetStr = bMax ? `$${bMin}–$${bMax} ${currency}` : `$${bMin}+ ${currency}`;
    const skills    = (p.jobs || []).map(j => j.name).filter(Boolean).slice(0, 8);
    const submitted = p.time_submitted;
    const postedAt  = submitted
      ? new Date(submitted * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Unknown';

    // Owner / employer verification fields (available when user_details=true)
    const owner      = p.owner || {};
    const rep        = owner.employer_reputation || {};
    const hist       = rep.entire_history || {};
    const status     = owner.status || {};

    const clientRating      = typeof hist.overall === 'number'      ? hist.overall      : null;
    const clientReviewCount = typeof hist.reviews === 'number'      ? hist.reviews      : null;
    const paymentVerified   = typeof status.payment_verified === 'boolean'  ? status.payment_verified  : null;
    const identityVerified  = typeof status.identity_verified === 'boolean' ? status.identity_verified : null;

    const seoUrl = p.seo_url || '';
    const pid    = String(p.id || crypto.randomUUID());
    const url    = seoUrl
      ? `https://www.freelancer.com/projects/${seoUrl}`
      : `https://www.freelancer.com/projects/${pid}`;

    return {
      id:                `fl_${pid}`,
      title:             p.title || 'Untitled',
      description:       (p.description || '').trim().substring(0, 500),
      budget:            budgetStr,
      skills,
      clientCountry:     (typeof owner.country === 'string' ? owner.country : '') || '',
      clientRating,
      clientReviewCount,
      paymentVerified,
      identityVerified,
      postedAt,
      url,
      platform:          'freelancer',
      proposalsCount:    p.bid_stats?.bid_count ?? null,
      _postedMs:         submitted ? submitted * 1000 : 0,
    };
  } catch { return null; }
}
