/* ── Freelancer OS Connector — Popup Script ── */

'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const apiUrlInput       = $('apiUrl');
const authTokenInput    = $('authToken');
const btnSaveConnect    = $('btnSaveConnect');
const apiStatusDiv      = $('apiStatus');
const apiStatusDot      = $('apiStatusDot');
const apiStatusText     = $('apiStatusText');

const upworkDot         = $('upworkDot');
const upworkStatus      = $('upworkStatus');
const btnUpworkConnect  = $('btnUpworkConnect');
const btnUpworkRefresh  = $('btnUpworkRefresh');
const btnUpworkDisconn  = $('btnUpworkDisconnect');

const freelancerDot         = $('freelancerDot');
const freelancerStatus      = $('freelancerStatus');
const btnFreelancerConnect  = $('btnFreelancerConnect');
const btnFreelancerRefresh  = $('btnFreelancerRefresh');
const btnFreelancerDisconn  = $('btnFreelancerDisconnect');

const connectMsg        = $('connectMsg');

const keywordInput      = $('keywordInput');
const keywordTagsBox    = $('keywordTagsBox');
const techStackInput    = $('techStackInput');
const techStackTagsBox  = $('techStackTagsBox');
const btnScrape         = $('btnScrape');
const btnTest           = $('btnTest');
const scrapeStatusText  = $('scrapeStatusText');
const scrapeLastLine    = $('scrapeLastLine');
const scrapeLastText    = $('scrapeLastText');
const suggestionsBox    = $('suggestionsBox');

const autoScrapeToggle  = $('autoScrapeToggle');
const scheduleNextRun   = $('scheduleNextRun');
const scheduleInterval  = $('scheduleInterval');
const scheduleStartHour = $('scheduleStartHour');
const scheduleEndHour   = $('scheduleEndHour');
const dayCheckboxesDiv  = $('dayCheckboxes');
const scrapeLastLine2   = $('scrapeLastLine2');
const scrapeLastText2   = $('scrapeLastText2');

// ── Stored state ──────────────────────────────────────────────────────────────

let apiUrl    = 'http://localhost:3001';
let authToken = '';

// ── Platform toggle state ─────────────────────────────────────────────────────

// Tracks which platforms are active. Both active = "both" mode.
let activePlatforms = new Set(['upwork', 'freelancer']);

function getPlatformValue() {
  const hasUw = activePlatforms.has('upwork');
  const hasFl = activePlatforms.has('freelancer');
  if (hasUw && hasFl) return 'both';
  if (hasUw)          return 'upwork';
  if (hasFl)          return 'freelancer';
  return 'both';
}

function renderPlatformToggles() {
  $('toggleUpwork').classList.toggle('active',    activePlatforms.has('upwork'));
  $('toggleFreelancer').classList.toggle('active', activePlatforms.has('freelancer'));
}

function setPlatformFromValue(value) {
  if (value === 'upwork')     { activePlatforms = new Set(['upwork']); }
  else if (value === 'freelancer') { activePlatforms = new Set(['freelancer']); }
  else                        { activePlatforms = new Set(['upwork', 'freelancer']); }
  renderPlatformToggles();
}

$('toggleUpwork').addEventListener('click', () => {
  // Must keep at least one platform active
  if (activePlatforms.has('upwork') && activePlatforms.size === 1) return;
  if (activePlatforms.has('upwork')) activePlatforms.delete('upwork');
  else activePlatforms.add('upwork');
  renderPlatformToggles();
  chrome.storage.local.set({ lastPlatform: getPlatformValue() });
});

$('toggleFreelancer').addEventListener('click', () => {
  if (activePlatforms.has('freelancer') && activePlatforms.size === 1) return;
  if (activePlatforms.has('freelancer')) activePlatforms.delete('freelancer');
  else activePlatforms.add('freelancer');
  renderPlatformToggles();
  chrome.storage.local.set({ lastPlatform: getPlatformValue() });
});

// ── Keywords (tag state) ──────────────────────────────────────────────────────

let selectedKeywords = [];

function renderKeywordTags() {
  Array.from(keywordTagsBox.children).forEach(child => {
    if (child !== keywordInput) keywordTagsBox.removeChild(child);
  });
  selectedKeywords.forEach(kw => {
    const tag = document.createElement('span');
    tag.className = 'keyword-tag';
    tag.appendChild(document.createTextNode(kw));
    const rm = document.createElement('button');
    rm.className = 'keyword-tag-remove';
    rm.textContent = '×';
    rm.title = 'Remove';
    rm.addEventListener('click', (e) => { e.stopPropagation(); removeKeyword(kw); });
    tag.appendChild(rm);
    keywordTagsBox.insertBefore(tag, keywordInput);
  });
}

function addKeyword(kw) {
  const trimmed = kw.trim();
  if (!trimmed || selectedKeywords.includes(trimmed)) return;
  selectedKeywords.push(trimmed);
  renderKeywordTags();
  saveKeywords();
}

function removeKeyword(kw) {
  selectedKeywords = selectedKeywords.filter(k => k !== kw);
  renderKeywordTags();
  saveKeywords();
}

async function saveKeywords() {
  await chrome.storage.local.set({ selectedKeywords, lastQuery: selectedKeywords.join(', ') });
}

keywordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const val = keywordInput.value.trim();
    if (val) { addKeyword(val); keywordInput.value = ''; hideSuggestions(); }
  }
  if (e.key === 'Backspace' && keywordInput.value === '' && selectedKeywords.length > 0) {
    removeKeyword(selectedKeywords[selectedKeywords.length - 1]);
  }
});

keywordTagsBox.addEventListener('click', () => keywordInput.focus());

// ── Tech Stack (tag state) ────────────────────────────────────────────────────

let selectedTechStack = [];

function renderTechStackTags() {
  Array.from(techStackTagsBox.children).forEach(child => {
    if (child !== techStackInput) techStackTagsBox.removeChild(child);
  });
  selectedTechStack.forEach(tech => {
    const tag = document.createElement('span');
    tag.className = 'keyword-tag';
    tag.appendChild(document.createTextNode(tech));
    const rm = document.createElement('button');
    rm.className = 'keyword-tag-remove';
    rm.textContent = '×';
    rm.title = 'Remove';
    rm.addEventListener('click', (e) => { e.stopPropagation(); removeTechStack(tech); });
    tag.appendChild(rm);
    techStackTagsBox.insertBefore(tag, techStackInput);
  });
}

function addTechStack(tech) {
  const trimmed = tech.trim();
  if (!trimmed || selectedTechStack.includes(trimmed)) return;
  selectedTechStack.push(trimmed);
  renderTechStackTags();
  saveTechStack();
}

function removeTechStack(tech) {
  selectedTechStack = selectedTechStack.filter(t => t !== tech);
  renderTechStackTags();
  saveTechStack();
}

async function saveTechStack() {
  await chrome.storage.local.set({ selectedTechStack });
}

techStackInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const val = techStackInput.value.trim();
    if (val) { addTechStack(val); techStackInput.value = ''; }
  }
  if (e.key === 'Backspace' && techStackInput.value === '' && selectedTechStack.length > 0) {
    removeTechStack(selectedTechStack[selectedTechStack.length - 1]);
  }
});

techStackTagsBox.addEventListener('click', () => techStackInput.focus());

// ── Filters ───────────────────────────────────────────────────────────────────

let scrapeFilters = {
  paymentVerified: false,
  profileVerified: false,
  depositMade:     false,
  minReviews:      0,
  minRating:       0,
};

function applyFilterState() {
  $('filterPaymentVerified').checked = scrapeFilters.paymentVerified;
  $('filterProfileVerified').checked = scrapeFilters.profileVerified;
  $('filterDepositMade').checked     = scrapeFilters.depositMade;
  $('filterMinReviews').value = scrapeFilters.minReviews || '';
  $('filterMinRating').value  = scrapeFilters.minRating  || '';
  $('fcPayment').classList.toggle('active', scrapeFilters.paymentVerified);
  $('fcProfile').classList.toggle('active', scrapeFilters.profileVerified);
  $('fcDeposit').classList.toggle('active', scrapeFilters.depositMade);
}

function saveFilters() {
  scrapeFilters = {
    paymentVerified: $('filterPaymentVerified').checked,
    profileVerified: $('filterProfileVerified').checked,
    depositMade:     $('filterDepositMade').checked,
    minReviews:      parseInt($('filterMinReviews').value) || 0,
    minRating:       parseFloat($('filterMinRating').value) || 0,
  };
  chrome.storage.local.set({ scrapeFilters });
}

['filterPaymentVerified', 'filterProfileVerified', 'filterDepositMade'].forEach(id => {
  $(id).addEventListener('change', () => {
    $(id).parentElement.classList.toggle('active', $(id).checked);
    saveFilters();
  });
});
$('filterMinReviews').addEventListener('change', saveFilters);
$('filterMinRating').addEventListener('change',  saveFilters);

// ── Schedule helpers ──────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildDayCheckboxes(activeDays) {
  dayCheckboxesDiv.innerHTML = '';
  DAY_LABELS.forEach((label, idx) => {
    const chip = document.createElement('label');
    chip.className = 'day-chip' + (activeDays.includes(idx) ? ' active' : '');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = activeDays.includes(idx);
    cb.dataset.day = idx;
    cb.addEventListener('change', saveSchedule);
    chip.appendChild(cb);
    chip.appendChild(document.createTextNode(label));
    chip.addEventListener('click', () => { chip.classList.toggle('active'); });
    dayCheckboxesDiv.appendChild(chip);
  });
}

function buildHourOptions(selectEl, selectedValue) {
  selectEl.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = `${String(h).padStart(2, '0')}:00`;
    if (h === selectedValue) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function getActiveDays() {
  const chips = dayCheckboxesDiv.querySelectorAll('.day-chip.active input');
  return [...chips].map(cb => parseInt(cb.dataset.day, 10));
}

async function saveSchedule() {
  const interval  = parseInt(scheduleInterval.value, 10) || 15;
  const startHour = parseInt(scheduleStartHour.value, 10) || 9;
  const endHour   = parseInt(scheduleEndHour.value, 10)   || 18;
  const days      = getActiveDays();
  await chrome.storage.local.set({ scheduleInterval: interval, scheduleDays: days, scheduleStartHour: startHour, scheduleEndHour: endHour });
  if (autoScrapeToggle.checked) {
    await chrome.alarms.clear('autoScrape');
    chrome.alarms.create('autoScrape', { periodInMinutes: interval });
  }
}

function updateNextRunLabel() {
  if (!autoScrapeToggle.checked) { scheduleNextRun.textContent = 'Disabled'; return; }
  chrome.alarms.get('autoScrape', (alarm) => {
    if (!alarm) { scheduleNextRun.textContent = 'Scheduled'; return; }
    const msLeft = alarm.scheduledTime - Date.now();
    if (msLeft <= 0) { scheduleNextRun.textContent = 'Running soon...'; return; }
    const m = Math.floor(msLeft / 60000);
    const s = Math.floor((msLeft % 60000) / 1000);
    scheduleNextRun.textContent = `Next run in ${m}m ${s}s`;
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const data = await chrome.storage.local.get([
    'apiUrl', 'authToken', 'autoScrape', 'lastQuery', 'lastPlatform',
    'lastScrapeTime', 'lastScrapeCount', 'lastScrapedTotal', 'scrapeStatus',
    'scheduleInterval', 'scheduleDays', 'scheduleStartHour', 'scheduleEndHour',
    'selectedKeywords', 'selectedTechStack', 'scrapeFilters',
  ]);

  apiUrl    = data.apiUrl    || 'http://localhost:3001';
  authToken = data.authToken || '';
  apiUrlInput.value    = apiUrl;
  authTokenInput.value = authToken;

  autoScrapeToggle.checked = !!data.autoScrape;

  // Restore platform toggle state (UI matches logic exactly)
  setPlatformFromValue(data.lastPlatform || 'both');

  if (data.scrapeStatus) scrapeStatusText.textContent = data.scrapeStatus;

  if (data.lastScrapeTime && data.lastScrapeCount !== undefined) {
    const ago     = timeAgo(data.lastScrapeTime);
    const matched = data.lastScrapeCount;
    const scraped = data.lastScrapedTotal ?? matched;
    const txt = scraped > matched
      ? `Last: ${ago} · ${matched} matched (${scraped} scraped)`
      : `Last: ${ago} · ${matched} projects`;
    scrapeLastText.textContent  = txt;
    scrapeLastText2.textContent = txt;
    scrapeLastLine.classList.remove('hidden');
    scrapeLastLine2.classList.remove('hidden');
  }

  // Restore keywords (migrate from lastQuery if no saved tags yet)
  selectedKeywords = data.selectedKeywords || [];
  if (selectedKeywords.length === 0 && data.lastQuery) {
    selectedKeywords = data.lastQuery.split(',').map(s => s.trim()).filter(Boolean);
    await saveKeywords();
  }
  renderKeywordTags();

  // Restore tech stack
  selectedTechStack = data.selectedTechStack || [];
  renderTechStackTags();

  // Restore filters
  if (data.scrapeFilters) Object.assign(scrapeFilters, data.scrapeFilters);
  applyFilterState();

  // Build schedule UI
  const interval  = data.scheduleInterval  ?? 15;
  const days      = data.scheduleDays      ?? [1, 2, 3, 4, 5];
  const startHour = data.scheduleStartHour ?? 9;
  const endHour   = data.scheduleEndHour   ?? 18;

  scheduleInterval.value = interval;
  buildDayCheckboxes(days);
  buildHourOptions(scheduleStartHour, startHour);
  buildHourOptions(scheduleEndHour,   endHour);

  updateNextRunLabel();
  setInterval(updateNextRunLabel, 5000);

  if (authToken) {
    await checkApiConnection();
    await refreshPlatformStatus();
  } else {
    setApiStatus(false, 'No token — enter token and save');
    setAllPlatformStatus('unknown');
  }
}

// ── API connection ────────────────────────────────────────────────────────────

btnSaveConnect.addEventListener('click', async () => {
  const url   = apiUrlInput.value.trim().replace(/\/+$/, '');
  const token = authTokenInput.value.trim();
  if (!url)   { setApiStatus(false, 'Enter the API URL'); return; }
  if (!token) { setApiStatus(false, 'Enter your Auth Token'); return; }

  apiUrl    = url;
  authToken = token;
  btnSaveConnect.disabled    = true;
  btnSaveConnect.textContent = '⏳ Testing...';

  try {
    const ok = await testConnection(url, token);
    await chrome.storage.local.set({ apiUrl: url, authToken: token });
    if (ok) { setApiStatus(true, 'Connected to Freelancer OS'); await refreshPlatformStatus(); }
    else    { setApiStatus(false, 'Connection failed — check URL and token'); }
  } catch {
    setApiStatus(false, 'Network error — check API URL');
  } finally {
    btnSaveConnect.disabled    = false;
    btnSaveConnect.textContent = 'Save & Test Connection';
  }
});

async function testConnection(url, token) {
  try {
    const resp = await fetch(`${url}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    return resp.ok;
  } catch { return false; }
}

async function checkApiConnection() {
  if (!apiUrl || !authToken) return;
  const ok = await testConnection(apiUrl, authToken);
  setApiStatus(ok, ok ? 'Connected to Freelancer OS' : 'Not connected — check token');
}

function setApiStatus(ok, text) {
  apiStatusDiv.classList.remove('hidden');
  apiStatusDot.className = `dot ${ok ? 'dot-green' : 'dot-red'}`;
  apiStatusText.textContent = text;
}

// ── Platform status ───────────────────────────────────────────────────────────

async function refreshPlatformStatus() {
  if (!authToken) return;
  try {
    const resp = await fetch(`${apiUrl}/api/v1/connections/status`, { headers: { Authorization: `Bearer ${authToken}` } });
    if (!resp.ok) { setAllPlatformStatus('unknown'); return; }
    const data = await resp.json();
    setPlatformRow('upwork',     data.upwork);
    setPlatformRow('freelancer', data.freelancer);
  } catch {
    setAllPlatformStatus('unknown');
  }
}

function setAllPlatformStatus(state) {
  setPlatformRow('upwork',     state === 'connected');
  setPlatformRow('freelancer', state === 'connected');
}

function setPlatformRow(platform, connected) {
  const dot     = $(platform === 'upwork' ? 'upworkDot'           : 'freelancerDot');
  const status  = $(platform === 'upwork' ? 'upworkStatus'        : 'freelancerStatus');
  const btnConn = $(platform === 'upwork' ? 'btnUpworkConnect'    : 'btnFreelancerConnect');
  const btnRef  = $(platform === 'upwork' ? 'btnUpworkRefresh'    : 'btnFreelancerRefresh');
  const btnDisc = $(platform === 'upwork' ? 'btnUpworkDisconnect' : 'btnFreelancerDisconnect');

  if (connected) {
    dot.className      = 'dot dot-green';
    status.textContent = 'Connected';
    btnConn.classList.add('hidden');
    btnRef.classList.remove('hidden');
    btnDisc.classList.remove('hidden');
  } else {
    dot.className      = 'dot dot-gray';
    status.textContent = connected === false ? 'Not connected' : 'Unknown';
    btnConn.classList.remove('hidden');
    btnRef.classList.add('hidden');
    btnDisc.classList.add('hidden');
  }
}

// ── Platform connect / disconnect ─────────────────────────────────────────────

async function connectPlatform(platform) {
  if (!authToken) { showConnectMsg('Save your token first.', 'error'); return; }
  const domain = platform === 'upwork' ? '.upwork.com' : '.freelancer.com';
  showConnectMsg(`Reading ${platform} cookies...`, 'info');

  let cookies = [];
  try {
    cookies = await chrome.cookies.getAll({ domain });
  } catch (e) {
    showConnectMsg(`Could not read cookies: ${e.message}`, 'error');
    return;
  }

  if (cookies.length === 0) {
    const loginUrl = platform === 'upwork'
      ? 'https://www.upwork.com/ab/account-security/login'
      : 'https://www.freelancer.com/login';
    showConnectMsg(`Not logged into ${platform}. Log in first, then Connect again.`, 'error');
    chrome.tabs.create({ url: loginUrl });
    return;
  }

  showConnectMsg(`Sending ${cookies.length} cookies...`, 'info');
  try {
    const resp = await fetch(`${apiUrl}/api/v1/connections/${platform}/browser-connect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies }),
    });
    if (resp.ok) {
      showConnectMsg(`${capitalize(platform)} connected!`, 'success');
      await refreshPlatformStatus();
    } else {
      const err = await resp.json().catch(() => ({}));
      showConnectMsg(`Failed: ${err.error || resp.statusText}`, 'error');
    }
  } catch (e) {
    showConnectMsg(`Network error: ${e.message}`, 'error');
  }
}

async function disconnectPlatform(platform) {
  if (!authToken) return;
  try {
    await fetch(`${apiUrl}/api/v1/connections/${platform}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    showConnectMsg(`${capitalize(platform)} disconnected.`, 'info');
    await refreshPlatformStatus();
  } catch (e) {
    showConnectMsg(`Error: ${e.message}`, 'error');
  }
}

btnUpworkConnect.addEventListener('click',     () => connectPlatform('upwork'));
btnUpworkRefresh.addEventListener('click',     () => connectPlatform('upwork'));
btnUpworkDisconn.addEventListener('click',     () => disconnectPlatform('upwork'));
btnFreelancerConnect.addEventListener('click', () => connectPlatform('freelancer'));
btnFreelancerRefresh.addEventListener('click', () => connectPlatform('freelancer'));
btnFreelancerDisconn.addEventListener('click', () => disconnectPlatform('freelancer'));

// ── Scraping ──────────────────────────────────────────────────────────────────

let isTestMode = false;

btnScrape.addEventListener('click', async () => {
  if (!selectedKeywords.length) { scrapeStatusText.textContent = 'Add at least one keyword first.'; return; }
  if (!authToken) { scrapeStatusText.textContent = 'Save your API token first.'; return; }

  const query    = selectedKeywords.join(', ');
  const platform = getPlatformValue();

  await chrome.storage.local.set({ lastPlatform: platform });
  btnScrape.disabled    = true;
  btnScrape.textContent = 'Scraping...';

  chrome.runtime.sendMessage({ type: 'SCRAPE', query, platform, apiUrl, authToken, filters: scrapeFilters, techStack: selectedTechStack });
});

btnTest.addEventListener('click', async () => {
  if (!selectedKeywords.length) { scrapeStatusText.textContent = 'Add at least one keyword first.'; return; }
  if (!authToken) { scrapeStatusText.textContent = 'Save API token first.'; return; }

  isTestMode = true;
  btnTest.disabled    = true;
  btnTest.textContent = '...';
  scrapeStatusText.textContent = 'Testing...';

  const platform = getPlatformValue();
  chrome.runtime.sendMessage({ type: 'SCRAPE', query: selectedKeywords[0], platform, apiUrl, authToken });
});

// ── Search Projects shortcut ──────────────────────────────────────────────────

$('btnSearchProjects').addEventListener('click', () => {
  if (!selectedKeywords.length) { scrapeStatusText.textContent = 'Add keywords first.'; return; }
  const query    = selectedKeywords.join(', ');
  const platform = getPlatformValue();
  const url      = `${getFrontendUrl()}/scraper?q=${encodeURIComponent(query)}&platform=${platform}`;
  chrome.tabs.create({ url });
});

function getFrontendUrl() {
  try {
    const u = new URL(apiUrl);
    u.port = '5173';
    return u.origin;
  } catch {
    return 'http://localhost:5173';
  }
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SCRAPE_STATUS') {
    scrapeStatusText.textContent = msg.message || 'Working...';
  }
  if (msg.type === 'SCRAPE_DONE') {
    if (isTestMode) {
      isTestMode = false;
      btnTest.disabled    = false;
      btnTest.textContent = 'Test';
      scrapeStatusText.textContent = msg.error
        ? `Failed ❌ — ${msg.error}`
        : `Working ✅ — ${msg.count ?? 0} results`;
      return;
    }

    btnScrape.disabled    = false;
    btnScrape.textContent = 'Start Scraping';

    if (msg.error) {
      scrapeStatusText.textContent = `Error: ${msg.error}`;
    } else {
      const matched = msg.count ?? 0;
      const scraped = msg.scrapedTotal ?? matched;
      const statusText = scraped > matched
        ? `Done — ${scraped} scraped → ${matched} matched`
        : `Done — ${matched} projects sent to app`;
      scrapeStatusText.textContent = statusText;
      const txt = `Last: just now · ${matched} matched${scraped > matched ? ` (${scraped} scraped)` : ''}`;
      scrapeLastText.textContent  = txt;
      scrapeLastText2.textContent = txt;
      scrapeLastLine.classList.remove('hidden');
      scrapeLastLine2.classList.remove('hidden');
      chrome.storage.local.set({ lastScrapeTime: Date.now(), lastScrapeCount: matched });
    }
  }
});

// ── Auto-scrape toggle ────────────────────────────────────────────────────────

autoScrapeToggle.addEventListener('change', async () => {
  const enabled  = autoScrapeToggle.checked;
  const interval = parseInt(scheduleInterval.value, 10) || 15;
  await chrome.storage.local.set({ autoScrape: enabled, scheduleInterval: interval });
  chrome.runtime.sendMessage({ type: enabled ? 'AUTO_SCRAPE_ON' : 'AUTO_SCRAPE_OFF' });
  updateNextRunLabel();
});

scheduleInterval.addEventListener('change',  saveSchedule);
scheduleStartHour.addEventListener('change', saveSchedule);
scheduleEndHour.addEventListener('change',   saveSchedule);

// ── Helpers ───────────────────────────────────────────────────────────────────

function showConnectMsg(text, type) {
  connectMsg.className = `msg msg-${type}`;
  connectMsg.textContent = text;
  connectMsg.classList.remove('hidden');
  if (type === 'success' || type === 'info') {
    setTimeout(() => connectMsg.classList.add('hidden'), 4000);
  }
}

function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Search suggestions ────────────────────────────────────────────────────────

const SUGGESTION_KEYWORDS = [
  'React', 'React Native', 'Next.js', 'Vue.js', 'Angular', 'TypeScript', 'JavaScript',
  'Svelte', 'Nuxt.js', 'Gatsby', 'Tailwind CSS', 'Bootstrap',
  'Node.js', 'Express.js', 'NestJS', 'Python', 'Django', 'FastAPI', 'Flask',
  'PHP', 'Laravel', 'Go developer', 'Java developer', 'Spring Boot', 'C# .NET',
  'Ruby on Rails', 'Rust developer',
  'Flutter', 'iOS developer', 'Android developer', 'Swift', 'Kotlin',
  'WordPress', 'Shopify', 'Webflow', 'WooCommerce', 'Magento',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Firebase', 'Supabase', 'Redis',
  'AWS developer', 'Docker', 'DevOps engineer', 'Kubernetes', 'CI/CD',
  'Google Cloud', 'Azure', 'Terraform', 'Linux admin',
  'AI developer', 'Machine learning', 'ChatGPT integration', 'LangChain', 'OpenAI API',
  'TensorFlow', 'PyTorch', 'computer vision', 'NLP developer',
  'web scraping', 'data scraping', 'Selenium', 'Playwright', 'Puppeteer',
  'n8n automation', 'Zapier integration',
  'UI/UX designer', 'Figma designer', 'logo design', 'graphic designer',
  'full stack developer', 'backend developer', 'frontend developer', 'MERN stack',
  'MEAN stack', 'LAMP stack',
  'blockchain developer', 'Solidity', 'smart contract', 'Web3 developer', 'NFT developer',
  'SEO specialist', 'content writer', 'copywriter', 'email marketing',
  'data analyst', 'Power BI', 'Tableau', 'Excel automation', 'data engineer',
  'GraphQL', 'REST API', 'WebSocket', 'Chrome extension', 'mobile app developer',
  'SaaS developer', 'API integration', 'webhook integration',
  'cybersecurity', 'penetration testing', 'QA engineer', 'test automation',
];

let _suggDebounce = null;

function showSuggestions(val) {
  const current = val.trim().toLowerCase();
  if (current.length < 1) { hideSuggestions(); return; }
  const matches = SUGGESTION_KEYWORDS
    .filter(k => k.toLowerCase().includes(current) && !selectedKeywords.includes(k))
    .slice(0, 7);
  if (matches.length === 0) { hideSuggestions(); return; }
  suggestionsBox.innerHTML = '';
  matches.forEach(kw => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.innerHTML = `<span class="suggestion-icon">+</span>${kw}`;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      addKeyword(kw);
      keywordInput.value = '';
      hideSuggestions();
      keywordInput.focus();
    });
    suggestionsBox.appendChild(item);
  });
  suggestionsBox.classList.remove('hidden');
}

function hideSuggestions() {
  suggestionsBox.classList.add('hidden');
  suggestionsBox.innerHTML = '';
}

keywordInput.addEventListener('input', () => {
  clearTimeout(_suggDebounce);
  _suggDebounce = setTimeout(() => showSuggestions(keywordInput.value), 120);
});
keywordInput.addEventListener('blur', () => {
  setTimeout(hideSuggestions, 200);
});

// ── Start ─────────────────────────────────────────────────────────────────────

init();
