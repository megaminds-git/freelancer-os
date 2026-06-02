/**
 * Freelancer OS Connector — Upwork Content Script
 *
 * Auto-injected on Upwork job search pages. Provides DOM utilities and
 * responds to extraction requests from background.js.
 *
 * Primary extraction is done via chrome.scripting.executeScript in background.js;
 * this content script serves as a fallback communication channel.
 */

'use strict';

// Mark that the content script is active on this page
window.__FOS_UPWORK_SCRAPER__ = true;

// Listen for extraction request from background.js
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'EXTRACT_UPWORK_JOBS') return false;
  try {
    const jobs = extractJobs();
    sendResponse({ jobs, url: location.href });
  } catch (e) {
    sendResponse({ jobs: [], error: e.message });
  }
  return false;
});

function extractJobs() {
  const jobs = [];
  const seen = new Set();

  const selectors = [
    '[data-test="job-tile"]',
    'section.up-card-section',
    'article[data-ev-sublocation]',
    '.job-tile',
    '[data-cy="job-tile"]',
  ];

  let cards = [];
  for (const sel of selectors) {
    const found = document.querySelectorAll(sel);
    if (found.length > 0) { cards = [...found]; break; }
  }

  if (cards.length === 0) {
    // Fallback: find all job heading links and walk up to card containers
    const headings = [...document.querySelectorAll('h2 a[href*="/jobs/"], h3 a[href*="/jobs/"]')];
    for (const a of headings) {
      let container = a;
      for (let i = 0; i < 8 && container; i++) {
        container = container.parentElement;
        if (container && container.querySelectorAll('p').length > 0) break;
      }
      if (container) cards.push(container);
    }
  }

  for (const card of cards) {
    try {
      const titleEl = card.querySelector(
        'h2 a, h3 a, [data-test="job-title-link"], [data-cy="job-title"]',
      );
      if (!titleEl) continue;

      const title = (titleEl.textContent || '').trim();
      const url   = titleEl.href || '';
      const key   = url || title;
      if (!title || seen.has(key)) continue;
      seen.add(key);

      // Description
      const descEl = card.querySelector(
        '[data-test="job-description-text"], .air3-line-clamp, .description, p',
      );
      const desc = (descEl?.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 500);

      // Budget
      let budget = 'Negotiable';
      const budgetEl = card.querySelector(
        '[data-test="budget"], [data-test="is-fixed-price"], [data-test="hourly-rate"], [data-cy="budget"]',
      );
      if (budgetEl) budget = (budgetEl.textContent || '').trim() || 'Negotiable';

      // Skills
      const skillEls = card.querySelectorAll(
        '[data-test="attr-item-label"], .air3-token, [data-test="token"], [data-cy="skill"]',
      );
      const skills = [...skillEls]
        .map(s => (s.textContent || '').trim())
        .filter(s => s && s.length < 50)
        .slice(0, 8);

      // Client country
      const countryEl = card.querySelector(
        '[data-test="client-country"], .air3-badge-tagline, [data-cy="client-location"]',
      );
      const country = (countryEl?.textContent || '').trim();

      // Proposals
      const propEl = card.querySelector(
        '[data-test="proposals-bids"], [data-test="proposals"], [data-cy="proposals"]',
      );
      let proposals = null;
      if (propEl) {
        const m = (propEl.textContent || '').match(/(\d+)/);
        if (m) proposals = parseInt(m[1], 10);
      }

      // Date
      const dateEl = card.querySelector('[data-test="posted-on"], time, [data-cy="posted-at"]');
      const postedAt = (
        dateEl?.textContent || dateEl?.getAttribute('datetime') || 'Unknown'
      ).trim();

      // Rating
      const ratingEl = card.querySelector(
        '[data-test="total-feedback-value"], .air3-rating-value-text',
      );
      let rating = null;
      if (ratingEl) {
        const m = (ratingEl.textContent || '').match(/([\d.]+)/);
        if (m) rating = parseFloat(m[1]);
      }

      const jobId = url.includes('~')
        ? url.split('~')[1].split('?')[0]
        : `fallback_${Math.random().toString(36).slice(2)}`;

      jobs.push({
        id:             `uw_${jobId}`,
        title,
        description:    desc,
        budget,
        skills,
        clientCountry:  country,
        clientRating:   rating,
        postedAt,
        url:            url || location.href,
        platform:       'upwork',
        proposalsCount: proposals,
      });
    } catch {
      continue;
    }
  }

  return jobs;
}
