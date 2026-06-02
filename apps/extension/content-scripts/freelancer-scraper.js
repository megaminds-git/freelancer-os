/**
 * Freelancer OS Connector — Freelancer Content Script
 *
 * Auto-injected on Freelancer.com pages. Primarily used as a DOM-based
 * fallback when the direct API approach in background.js fails.
 *
 * Note: background.js uses Freelancer's public API directly with credentials,
 * which is more reliable and faster than DOM scraping.
 */

'use strict';

window.__FOS_FREELANCER_SCRAPER__ = true;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'EXTRACT_FREELANCER_PROJECTS') return false;
  try {
    const projects = extractProjects();
    sendResponse({ projects, url: location.href });
  } catch (e) {
    sendResponse({ projects: [], error: e.message });
  }
  return false;
});

function extractProjects() {
  const projects = [];
  const seen     = new Set();

  // Freelancer search results page project cards
  const cards = [
    ...document.querySelectorAll('[class*="project-list-item"]'),
    ...document.querySelectorAll('[data-project-id]'),
    ...document.querySelectorAll('.JobSearchCard-item'),
    ...document.querySelectorAll('[class*="search-project"]'),
  ];

  for (const card of cards) {
    try {
      const titleEl = card.querySelector('a[href*="/projects/"], h2 a, h3 a, .job-title a');
      if (!titleEl) continue;

      const title = (titleEl.textContent || '').trim();
      const url   = titleEl.href || '';
      const key   = url || title;
      if (!title || seen.has(key)) continue;
      seen.add(key);

      const descEl = card.querySelector('[class*="description"], p, .JobSearchCard-primary-description');
      const desc   = (descEl?.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 500);

      // Budget
      const budgetEl = card.querySelector('[class*="budget"], [class*="price"], .JobSearchCard-primary-price');
      const budget   = (budgetEl?.textContent || '').trim() || 'Negotiable';

      // Skills / tags
      const tagEls = card.querySelectorAll('[class*="skill"], [class*="tag"], .JobSearchCard-primary-tagsLink');
      const skills = [...tagEls]
        .map(t => (t.textContent || '').trim())
        .filter(s => s && s.length < 50)
        .slice(0, 8);

      // Bids
      const bidsEl = card.querySelector('[class*="bid"], [class*="proposal"]');
      let bids = null;
      if (bidsEl) {
        const m = (bidsEl.textContent || '').match(/(\d+)/);
        if (m) bids = parseInt(m[1], 10);
      }

      // Extract project ID from URL
      const urlMatch = url.match(/\/projects\/([\w-]+)/);
      const projectId = urlMatch ? urlMatch[1] : `dom_${Math.random().toString(36).slice(2)}`;

      projects.push({
        id:             `fl_${projectId}`,
        title,
        description:    desc,
        budget,
        skills,
        clientCountry:  '',
        clientRating:   null,
        postedAt:       'Unknown',
        url:            url.startsWith('http') ? url : `https://www.freelancer.com${url}`,
        platform:       'freelancer',
        proposalsCount: bids,
      });
    } catch {
      continue;
    }
  }

  return projects;
}
