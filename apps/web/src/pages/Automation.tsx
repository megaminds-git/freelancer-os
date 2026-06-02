/**
 * Automation page
 *
 * The browser extension is the single source of truth for all automation state:
 * keywords, platform, schedule, filters, and whether automation is running.
 *
 * When the extension is installed:
 *   - Config is loaded from extension storage on mount via FOS_GET_EXT_STATE.
 *   - FOS_EXT_STATE_CHANGED keeps the page in sync when the popup changes settings.
 *   - The extension's alarm drives timing; the web-page scheduler is suppressed.
 *   - Projects accumulate in the backend via POST /scraper/auto-results and are
 *     fetched here by GET /scraper/auto-results polling (every 10 s).
 *
 * Without the extension, the page runs its own interval-based scheduler that
 * calls the Python scraper or cached extension results directly.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useVoiceAssistantStore } from '../store/voiceAssistantStore';
import { useRegisterVoiceActions } from '../lib/voiceCommands/actionRegistry';
import {
  Bot, Play, Square, FlaskConical, CheckCircle2, AlertCircle, Clock,
  SlidersHorizontal, ExternalLink, DollarSign, Globe, Users, Brain,
  Bookmark, BookmarkCheck, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, RefreshCw,
  Link2, Zap, Star, Puzzle, Calendar,
} from 'lucide-react';
import { scraperApi } from '../lib/api';
import type { ScrapedProject } from '@freelancer-os/shared';
import clsx from 'clsx';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AutomationConfig {
  query:            string;
  platform:         'both' | 'upwork' | 'freelancer';
  intervalMinutes:  number;
  fetchLimit:       number;
  startTime:        string;   // "HH:MM"
  endTime:          string;   // "HH:MM"
  activeDays:       number[]; // 0=Sun … 6=Sat
  techStack:        string[];
  maxProposals:     string;
  minClientRating:  string;
  minClientReviews: string;
  includeKeywords:  string;
  excludeKeywords:  string;
  identityVerified: boolean;
  paymentVerified:  boolean;
  depositMade:      boolean;
  profileCompleted: boolean;
  minBudget:        string;
  maxBudget:        string;
}

interface RunLog {
  ts:      string;
  message: string;
  type:    'info' | 'success' | 'warn' | 'error';
}

// Extension storage shape (subset we care about)
interface ExtState {
  autoScrape?:       boolean;
  selectedKeywords?: string[];
  selectedTechStack?: string[];
  lastPlatform?:     string;
  scrapeFilters?:    {
    paymentVerified?: boolean;
    profileVerified?: boolean;
    depositMade?:     boolean;
    minReviews?:      number;
    minRating?:       number;
  };
  scheduleInterval?:  number;
  scheduleDays?:      number[];
  scheduleStartHour?: number;
  scheduleEndHour?:   number;
  lastScrapeTime?:    number;
  lastScrapeCount?:   number;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: AutomationConfig = {
  query:            '',
  platform:         'both',
  intervalMinutes:  15,
  fetchLimit:       30,
  startTime:        '05:00',
  endTime:          '17:00',
  activeDays:       [1, 2, 3, 4, 5],
  techStack:        [],
  maxProposals:     'any',
  minClientRating:  '',
  minClientReviews: '',
  includeKeywords:  '',
  excludeKeywords:  '',
  identityVerified: false,
  paymentVerified:  false,
  depositMade:      false,
  profileCompleted: false,
  minBudget:        '',
  maxBudget:        '',
};

const INTERVALS = [
  { label: 'Every 5 min',  value: 5  },
  { label: 'Every 10 min', value: 10 },
  { label: 'Every 15 min', value: 15 },
  { label: 'Every 30 min', value: 30 },
  { label: 'Every 1 hr',   value: 60 },
];

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const AUTO_PAGE_SIZE = 12;

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadStorage<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}

function parseBudgetMin(budget: string): number {
  const match = (budget ?? '').match(/\$?([\d,]+)/);
  return match ? parseInt(match[1].replace(',', ''), 10) : 0;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isWithinWindow(start: string, end: string): boolean {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const s   = timeToMinutes(start);
  const e   = timeToMinutes(end);
  if (s <= e) return cur >= s && cur <= e;
  return cur >= s || cur <= e;
}

function hourToTime(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function timeToHour(time: string): number {
  return parseInt(time.split(':')[0], 10) || 0;
}

/** Convert extension storage state into Automation page config fields. */
function extStateToConfigPatch(state: ExtState): Partial<AutomationConfig> {
  const patch: Partial<AutomationConfig> = {};
  if (Array.isArray(state.selectedKeywords) && state.selectedKeywords.length > 0) {
    patch.query = state.selectedKeywords.join(', ');
  }
  if (state.lastPlatform && ['both', 'upwork', 'freelancer'].includes(state.lastPlatform)) {
    patch.platform = state.lastPlatform as AutomationConfig['platform'];
  }
  if (typeof state.scheduleInterval === 'number') {
    patch.intervalMinutes = state.scheduleInterval;
  }
  if (typeof state.scheduleStartHour === 'number') {
    patch.startTime = hourToTime(state.scheduleStartHour);
  }
  if (typeof state.scheduleEndHour === 'number') {
    patch.endTime = hourToTime(state.scheduleEndHour);
  }
  if (Array.isArray(state.scheduleDays)) {
    patch.activeDays = state.scheduleDays;
  }
  if (Array.isArray(state.selectedTechStack)) {
    patch.techStack = state.selectedTechStack;
  }
  if (state.scrapeFilters) {
    const f = state.scrapeFilters;
    if (f.paymentVerified !== undefined) patch.paymentVerified  = f.paymentVerified;
    if (f.profileVerified !== undefined) patch.identityVerified = f.profileVerified;
    if (f.depositMade     !== undefined) patch.depositMade      = f.depositMade;
    if (typeof f.minReviews === 'number') patch.minClientReviews = f.minReviews > 0 ? String(f.minReviews) : '';
    if (typeof f.minRating  === 'number') patch.minClientRating  = f.minRating  > 0 ? String(f.minRating)  : '';
  }
  return patch;
}

/** Convert Automation page config back into extension storage shape. */
function configToExtState(config: AutomationConfig): Record<string, unknown> {
  return {
    selectedKeywords: config.query.split(',').map(k => k.trim()).filter(Boolean),
    lastQuery:        config.query,
    lastPlatform:     config.platform,
    scheduleInterval: config.intervalMinutes,
    scheduleStartHour: timeToHour(config.startTime),
    scheduleEndHour:   timeToHour(config.endTime),
    scheduleDays:      config.activeDays,
    selectedTechStack: config.techStack,
    scrapeFilters: {
      paymentVerified: config.paymentVerified,
      profileVerified: config.identityVerified,
      depositMade:     config.depositMade,
      minReviews: config.minClientReviews ? parseInt(config.minClientReviews, 10) || 0 : 0,
      minRating:  config.minClientRating  ? parseFloat(config.minClientRating)  || 0 : 0,
    },
  };
}

/**
 * STRICT FILTERING: A project passes only if it matches ALL selected criteria
 * Uses AND logic for all filters (keywords, verification, ratings, budget, etc.)
 * 
 * Keyword matching:
 * - Main query keywords: OR logic (at least one must match)
 * - Include keywords: AND logic (all must match)
 * - Exclude keywords: AND logic (none must match)
 * - Tech stack: AND logic (all selected techs must be present)
 */
function matchesConfig(project: ScrapedProject, cfg: AutomationConfig): boolean {
  const text = `${project.title || ''} ${project.description || ''}`.toLowerCase();

  // 1. MAIN QUERY KEYWORDS (OR logic: at least one must match)
  // If keywords are set, project must contain at least one
  if (cfg.query.trim()) {
    const keywords = cfg.query.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    if (keywords.length > 0) {
      const hasKeyword = keywords.some(kw => text.includes(kw));
      if (!hasKeyword) return false;
    }
  }

  // 2. INCLUDE KEYWORDS (AND logic: ALL must appear in title/description)
  if (cfg.includeKeywords.trim()) {
    const kws = cfg.includeKeywords.toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
    if (!kws.every(k => text.includes(k))) return false;
  }

  // 3. EXCLUDE KEYWORDS (AND logic: NONE must appear in title/description)
  if (cfg.excludeKeywords.trim()) {
    const kws = cfg.excludeKeywords.toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
    if (kws.some(k => text.includes(k))) return false;
  }

  // 4. TECH STACK (AND logic: ALL selected techs must be present)
  if (cfg.techStack.length > 0) {
    const skillSet = (project.skills ?? []).map(s => s.toLowerCase());
    const norm = (s: string) => s.toLowerCase().replace(/[.\s]/g, '');
    
    // ALL tech stack items must be present
    const hasAllTechs = cfg.techStack.every(t => {
      const tl = t.toLowerCase();
      const tlN = norm(t);
      return skillSet.some(s => s.includes(tl) || norm(s).includes(tlN))
        || text.includes(tl) || norm(text).includes(tlN);
    });
    if (!hasAllTechs) return false;
  }

  // 5. VERIFICATION FLAGS (AND logic: all selected must be true)
  if (cfg.identityVerified && project.identityVerified === false) return false;
  if (cfg.paymentVerified && project.paymentVerified === false) return false;
  if (cfg.depositMade && project.depositMade === false) return false;
  if (cfg.profileCompleted && project.profileCompleted === false) return false;

  // 6. NUMERIC FILTERS (AND logic: all must pass)
  if (cfg.minClientRating) {
    const min = parseFloat(cfg.minClientRating);
    if (project.clientRating == null || project.clientRating < min) return false;
  }

  if (cfg.minClientReviews) {
    const min = parseInt(cfg.minClientReviews, 10);
    if (!isNaN(min) && (project.clientReviewCount == null || project.clientReviewCount < min)) return false;
  }

  if (cfg.minBudget) {
    const min = parseFloat(cfg.minBudget);
    if (!isNaN(min) && parseBudgetMin(project.budget) < min) return false;
  }

  if (cfg.maxBudget) {
    const max = parseFloat(cfg.maxBudget);
    if (!isNaN(max) && parseBudgetMin(project.budget) > max) return false;
  }

  if (cfg.maxProposals !== 'any') {
    const max = parseInt(cfg.maxProposals, 10);
    if ((project.proposalsCount ?? 999) > max) return false;
  }

  // All filters passed - project matches
  return true;
}

function fmt(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Automation() {
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const authUserId   = useAuthStore(s => s.user?.id) ?? 'guest';

  // User-scoped storage keys — prevents one user's data leaking to another
  const KEY_CONFIG  = `fos_${authUserId}_autoConfig`;
  const KEY_ENABLED = `fos_${authUserId}_autoEnabled`;
  const KEY_MATCHED = `fos_${authUserId}_matchedProjects`;
  const KEY_SAVED   = `fos_${authUserId}_savedProjects`;

  const [config, setConfig] = useState<AutomationConfig>(() => {
    const uid = useAuthStore.getState().user?.id ?? 'guest';
    return loadStorage<AutomationConfig>(`fos_${uid}_autoConfig`, DEFAULT_CONFIG);
  });
  const [enabled,         setEnabled]         = useState(() => {
    const uid = useAuthStore.getState().user?.id ?? 'guest';
    return loadStorage<boolean>(`fos_${uid}_autoEnabled`, false);
  });
  const [running,         setRunning]          = useState(false);
  const [matchedProjects, setMatchedProjects]  = useState<ScrapedProject[]>(() => {
    const uid = useAuthStore.getState().user?.id ?? 'guest';
    return loadStorage<ScrapedProject[]>(`fos_${uid}_matchedProjects`, []);
  });
  const [savedProjects,   setSavedProjects]    = useState<ScrapedProject[]>(() => {
    const uid = useAuthStore.getState().user?.id ?? 'guest';
    return loadStorage<ScrapedProject[]>(`fos_${uid}_savedProjects`, []);
  });
  const [logs,            setLogs]             = useState<RunLog[]>([]);
  const [lastRun,         setLastRun]          = useState<string | null>(null);
  const [nextRunIn,       setNextRunIn]        = useState<string>('—');
  const [showFilters,     setShowFilters]      = useState(true);
  const [stackSearch,     setStackSearch]      = useState('');
  const [matchedPage,     setMatchedPage]      = useState(1);
  const [showSavedPanel,  setShowSavedPanel]   = useState(false);
  const [scraperOnline,   setScraperOnline]    = useState<boolean | null>(null);
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [extensionStatus,    setExtensionStatus]    = useState('');
  // true while a change originated from the extension (suppresses write-back loop)
  const isUpdatingFromExtRef = useRef(false);
  // debounce timer for pushing config changes to extension
  const configSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextFireRef   = useRef<number | null>(null);
  const runCycleRef   = useRef<((manual?: boolean) => Promise<void>) | null>(null);
  const seenAutoTsRef   = useRef<Set<string>>(new Set());
  const prevPlatformRef = useRef(config.platform);

  // ── Extension detection ────────────────────────────────────────────────────

  useEffect(() => {
    const win = window as Window & { __FOS_EXTENSION_INSTALLED__?: boolean };
    if (win.__FOS_EXTENSION_INSTALLED__) { setExtensionInstalled(true); return; }
    const t = setTimeout(() => { if (win.__FOS_EXTENSION_INSTALLED__) setExtensionInstalled(true); }, 800);
    return () => clearTimeout(t);
  }, []);

  // ── Load initial extension state once the extension is detected ────────────
  // Also request state periodically to catch any missed updates

  useEffect(() => {
    if (!extensionInstalled) return;
    window.dispatchEvent(new CustomEvent('FOS_GET_EXT_STATE'));
    // Reinitialize state every 5s to catch any missed updates from extension
    const interval = setInterval(() => {
      window.dispatchEvent(new CustomEvent('FOS_GET_EXT_STATE'));
    }, 5000);
    return () => clearInterval(interval);
  }, [extensionInstalled]);

  // ── Apply extension state (used for both initial load and delta updates) ───
  // When extension is installed, ALL state comes from extension — page is read-only

  const applyExtState = useCallback((state: ExtState) => {
    isUpdatingFromExtRef.current = true;

    // Always apply extension state when it arrives
    if (typeof state.autoScrape === 'boolean') {
      setEnabled(state.autoScrape);
    }
    const patch = extStateToConfigPatch(state);
    if (Object.keys(patch).length > 0) {
      setConfig(prev => ({ ...prev, ...patch }));
    }

    // Clear the suppression flag after React has processed the queued state updates.
    setTimeout(() => { isUpdatingFromExtRef.current = false; }, 200);
  }, []);

  // ── Listen for extension state events ─────────────────────────────────────

  useEffect(() => {
    function onExtState(e: Event) {
      applyExtState((e as CustomEvent<ExtState>).detail || {});
    }
    function onExtStateChanged(e: Event) {
      applyExtState((e as CustomEvent<ExtState>).detail || {});
    }
    function onExtContextInvalidated() {
      setExtensionInstalled(false);
      setExtensionStatus('Extension reloaded. Refresh this page to reconnect automation bridge.');
      setLogs(prev => [{ ts: fmt(new Date()), message: 'Extension context invalidated. Refresh page to reconnect.', type: 'warn' as const }, ...prev].slice(0, 50));
    }
    window.addEventListener('FOS_EXT_STATE',         onExtState);
    window.addEventListener('FOS_EXT_STATE_CHANGED', onExtStateChanged);
    window.addEventListener('FOS_EXT_CONTEXT_INVALIDATED', onExtContextInvalidated);
    return () => {
      window.removeEventListener('FOS_EXT_STATE',         onExtState);
      window.removeEventListener('FOS_EXT_STATE_CHANGED', onExtStateChanged);
      window.removeEventListener('FOS_EXT_CONTEXT_INVALIDATED', onExtContextInvalidated);
    };
  }, [applyExtState]);

  // ── Persist config to localStorage ────────────────────────────────────────

  useEffect(() => {
    localStorage.setItem(KEY_CONFIG, JSON.stringify(config));
  }, [config, KEY_CONFIG]);

  useEffect(() => {
    localStorage.setItem(KEY_ENABLED, JSON.stringify(enabled));
  }, [enabled, KEY_ENABLED]);

  useEffect(() => {
    localStorage.setItem(KEY_MATCHED, JSON.stringify(matchedProjects.slice(0, 200)));
  }, [matchedProjects, KEY_MATCHED]);

  useEffect(() => {
    localStorage.setItem(KEY_SAVED, JSON.stringify(savedProjects));
  }, [savedProjects, KEY_SAVED]);

  // ── Voice: pending command from cross-page navigation ─────────────────────
  const voicePending      = useVoiceAssistantStore((s) => s.sessionContext.pendingCommand);
  const clearVoicePending = useVoiceAssistantStore((s) => s.setPendingCommand);

  useEffect(() => {
    if (voicePending?.type === 'automation') {
      setEnabled(voicePending.payload?.action === 'start');
      clearVoicePending(null);
    }
  }, [voicePending]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same-page voice command via CustomEvent (already on /automation)
  useEffect(() => {
    function onAriaCommand(e: Event) {
      const detail = (e as CustomEvent).detail as { type: string; payload: Record<string, string> };
      if (detail?.type === 'automation') {
        setEnabled(detail.payload?.action === 'start');
      }
    }
    window.addEventListener('aria:command', onAriaCommand);
    return () => window.removeEventListener('aria:command', onAriaCommand);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Register voice actions for this page
  useRegisterVoiceActions(() => [
    {
      id: 'automation.start',
      route: '/automation',
      label: 'Start automation',
      description: 'Enable automated project scraping',
      keywords: ['start', 'enable', 'turn on', 'activate', 'begin'],
      execute: () => setEnabled(true),
    },
    {
      id: 'automation.stop',
      route: '/automation',
      label: 'Stop automation',
      description: 'Disable automated project scraping',
      keywords: ['stop', 'disable', 'turn off', 'deactivate', 'pause'],
      execute: () => setEnabled(false),
    },
  ], []);

  // ── Re-filter matched projects when platform changes ──────────────────────
  // Prevents projects from the previously selected platform from lingering.
  useEffect(() => {
    if (prevPlatformRef.current === config.platform) return;
    prevPlatformRef.current = config.platform;
    if (config.platform !== 'both') {
      setMatchedProjects(prev => prev.filter(p => p.platform === config.platform));
    }
  }, [config.platform]);

  // ── Push config changes back to extension (debounced, skip loop) ──────────
  // When extension is installed, only sync if the change didn't come FROM the extension

  useEffect(() => {
    if (!extensionInstalled || isUpdatingFromExtRef.current) return;
    if (configSyncTimerRef.current) clearTimeout(configSyncTimerRef.current);
    configSyncTimerRef.current = setTimeout(() => {
      if (isUpdatingFromExtRef.current) return; // still syncing from ext
      window.dispatchEvent(new CustomEvent('FOS_SET_EXT_STATE', {
        detail: configToExtState(config),
      }));
      // After pushing config, request fresh state to ensure sync
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('FOS_GET_EXT_STATE'));
      }, 300);
    }, 600);
    return () => { if (configSyncTimerRef.current) clearTimeout(configSyncTimerRef.current); };
  }, [config, extensionInstalled]);

  // ── Scraper status ────────────────────────────────────────────────────────

  useEffect(() => {
    scraperApi.status()
      .then(d => setScraperOnline(d?.status === 'online'))
      .catch(() => setScraperOnline(false));
  }, []);

  // ── Logging ───────────────────────────────────────────────────────────────

  const addLog = useCallback((message: string, type: RunLog['type'] = 'info') => {
    setLogs(prev => [{ ts: fmt(new Date()), message, type }, ...prev].slice(0, 50));
  }, []);

  // ── Extension scrape event listener ───────────────────────────────────────

  useEffect(() => {
    function onScrapeEvent(e: Event) {
      const msg = (e as CustomEvent<{ type: string; message?: string }>).detail;
      if (msg.type === 'SCRAPE_STATUS') {
        setExtensionStatus(msg.message || 'Extension scraping…');
        addLog(`Extension: ${msg.message || 'Scraping…'}`, 'info');
      } else if (msg.type === 'SCRAPE_DONE') {
        setExtensionStatus('');
        setRunning(false);
        const doneMsg = msg as unknown as { type: string; error?: string; count?: number; scrapedTotal?: number };
        if (doneMsg.error) {
          addLog(`Extension error: ${doneMsg.error}`, 'error');
        } else {
          addLog(`Done — ${doneMsg.scrapedTotal ?? 0} scraped → ${doneMsg.count ?? 0} matched`, 'success');
        }
        // Give backend 2 s to store the results, then fetch immediately
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['automation-auto-results'] });
        }, 2000);
        // Also refresh extension state to get latest counts
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('FOS_GET_EXT_STATE'));
        }, 2500);
      }
    }
    window.addEventListener('FOS_SCRAPE_EVENT', onScrapeEvent);
    return () => window.removeEventListener('FOS_SCRAPE_EVENT', onScrapeEvent);
  }, [addLog, queryClient]);

  // ── Auto-results polling ──────────────────────────────────────────────────
  // Poll whenever the page thinks automation is active. With extension sync,
  // `enabled` mirrors the extension's autoScrape flag — so polling runs
  // automatically when the extension is running, even after a page refresh.
  // Also poll when extension is installed to catch any scrapes (manual, auto, or test).

  // Poll whenever automation is enabled OR the extension is installed.
  // Extension-installed mode polls passively so results from any scrape
  // (manual popup scrape, auto alarm, Test Now) appear without `enabled` being true.
  const isPollingActive = enabled || extensionInstalled;
  const { data: autoResultsData, refetch: refetchAutoResults } = useQuery({
    queryKey:        ['automation-auto-results'],
    queryFn:         scraperApi.getAutoResults,
    enabled:         isPollingActive,
    refetchInterval: isPollingActive ? 10_000 : false,
    staleTime:       0,
  });

  // Ensure polling is active when extension is detected
  useEffect(() => {
    if (extensionInstalled && isPollingActive) {
      refetchAutoResults();
    }
  }, [extensionInstalled, isPollingActive, refetchAutoResults]);

  useEffect(() => {
    if (!autoResultsData) return;

    if (Array.isArray(autoResultsData.logs)) {
      const newEntries: RunLog[] = [];
      for (const l of autoResultsData.logs as Array<{ ts: string; platform: string; query: string; received?: number; fresh?: number; count?: number }>) {
        if (seenAutoTsRef.current.has(l.ts)) continue;
        seenAutoTsRef.current.add(l.ts);
        const matched = l.fresh ?? l.count ?? 0;
        const total   = l.received ?? matched;
        const detail  = total > matched ? `${matched} matched (${total} scraped)` : `${matched} project(s)`;
        newEntries.push({
          ts:      fmt(new Date(l.ts)),
          message: `[Auto-scrape] ${detail} for "${l.query}" on ${l.platform}`,
          type:    'success',
        });
      }
      if (newEntries.length > 0) {
        setLogs(prev => [...newEntries, ...prev].slice(0, 50));
      }
    }

    if (Array.isArray(autoResultsData.projects) && autoResultsData.projects.length > 0) {
      const incomingProjects = autoResultsData.projects as ScrapedProject[];
      // Platform filter — only show projects from the selected platform
      const platformFiltered = config.platform === 'both'
        ? incomingProjects
        : incomingProjects.filter(p => p.platform === config.platform);
      // Always apply client-side filters. The extension pre-filters basic criteria
      // (keywords, techStack, verifications, rating, reviews) but the Automation page
      // may have additional filters (includeKeywords, excludeKeywords, maxProposals,
      // budget) that are not synced to the extension. matchesConfig is a no-op when
      // all filter fields are at their defaults, so this never hides valid projects.
      const filtered = platformFiltered.filter(p => matchesConfig(p, config));

      console.log(
        `[Automation] auto-results poll: received=${incomingProjects.length}` +
        ` platform_filtered=${platformFiltered.length} matched=${filtered.length}`,
      );

      if (extensionInstalled) {
        setMatchedProjects((prev) => {
          const existingIds = new Set(prev.map(p => p.id));
          const newOnes = filtered.filter(p => !existingIds.has(p.id));
          if (newOnes.length > 0) {
            console.log(`[Automation] Adding ${newOnes.length} new project(s) from extension`);
            setTimeout(() => addLog(`${newOnes.length} project(s) synced from extension`, 'success'), 0);
            setMatchedPage(1);
          }
          return newOnes.length > 0 ? [...newOnes, ...prev] : prev;
        });
      } else {
        setMatchedProjects(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newOnes = filtered.filter(p => !existingIds.has(p.id));
          if (newOnes.length > 0) {
            console.log(`[Automation] Adding ${newOnes.length} new project(s) to UI`);
            setTimeout(() => addLog(`${newOnes.length} new project(s) added (${incomingProjects.length} received → ${filtered.length} matched)`, 'success'), 0);
          }
          return newOnes.length > 0 ? [...newOnes, ...prev] : prev;
        });
      }

      // Auto-save filtered matches
      setSavedProjects(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const toSave = filtered.filter(p => !existingIds.has(p.id));
        toSave.forEach(p => {
          scraperApi.saveProject({
            id: p.id, title: p.title, description: p.description,
            budget: p.budget, skills: p.skills, clientCountry: p.clientCountry,
            url: p.url, platform: p.platform,
          }).catch(() => {});
        });
        return toSave.length > 0 ? [...toSave, ...prev] : prev;
      });
    }
  }, [autoResultsData, config, addLog, extensionInstalled]);

  // ── Extension trigger helper ───────────────────────────────────────────────

  function triggerExtScrape(query: string, platform: string) {
    if (!extensionInstalled) return;
    window.dispatchEvent(new CustomEvent('FOS_SCRAPE_REQUEST', {
      detail: { query, platform: platform || 'both' },
    }));
    setExtensionStatus('Extension scraping…');
    addLog(`Triggered extension scrape for "${query}"`, 'info');
  }

  // ── Run cycle (used when extension is NOT installed) ──────────────────────

  const runCycle = useCallback(async (manual = false) => {
    if (running) return;
    if (!manual && !isWithinWindow(config.startTime, config.endTime)) {
      addLog(`Skipped — outside window (${config.startTime}–${config.endTime})`, 'warn');
      return;
    }
    if (!config.query.trim()) {
      addLog('Skipped — no search query configured', 'warn');
      return;
    }

    setRunning(true);
    addLog(`Cycle started: "${config.query}" on ${config.platform}`, 'info');

    try {
      const data = await scraperApi.search({
        query:    config.query,
        platform: config.platform,
        limit:    config.fetchLimit,
      });

      const outcomes = (data.platformOutcomes ?? {}) as Record<string, { status: string; count: number; message: string }>;
      Object.entries(outcomes).forEach(([platform, outcome]) => {
        const cap = platform.charAt(0).toUpperCase() + platform.slice(1);
        if (outcome.status === 'success') {
          addLog(`${cap}: fetched ${outcome.count} project(s)`, 'info');
        } else if (outcome.status === 'platform_blocked') {
          addLog(`${cap}: blocked — ${outcome.message || 'connect your account in Profile'}`, 'warn');
        } else if (outcome.status === 'empty') {
          addLog(`${cap}: 0 results for this query`, 'info');
        } else if (outcome.status === 'error') {
          addLog(`${cap}: ${outcome.message || 'error'}`, 'error');
        }
      });

      const fetched: ScrapedProject[] = data.projects ?? [];
      if (Object.keys(outcomes).length === 0) addLog(`Fetched ${fetched.length} projects`, 'info');

      const newMatches = fetched.filter(p => matchesConfig(p, config));
      addLog(`${newMatches.length} matched`, newMatches.length > 0 ? 'success' : 'info');

      if (newMatches.length > 0) {
        let dedupedCount = 0;
        setMatchedProjects(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const deduped = newMatches.filter(p => !existingIds.has(p.id));
          dedupedCount = deduped.length;
          return deduped.length > 0 ? [...deduped, ...prev] : prev;
        });
        setSavedProjects(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const toSave = newMatches.filter(p => !existingIds.has(p.id));
          toSave.forEach(p => {
            scraperApi.saveProject({
              id: p.id, title: p.title, description: p.description,
              budget: p.budget, skills: p.skills, clientCountry: p.clientCountry,
              url: p.url, platform: p.platform,
            }).catch(() => {});
          });
          if (toSave.length > 0) setTimeout(() => addLog(`Auto-saved ${toSave.length} project(s)`, 'success'), 0);
          return toSave.length > 0 ? [...toSave, ...prev] : prev;
        });
        setTimeout(() => {
          if (dedupedCount < newMatches.length) {
            addLog(`${newMatches.length - dedupedCount} duplicate(s) skipped`, 'info');
          }
        }, 0);
      }
      setLastRun(fmt(new Date()));
    } catch (err: unknown) {
      const isOffline =
        err instanceof Error &&
        (err.message.includes('503') || err.message.includes('Network') || err.message.includes('ECONNREFUSED'));
      if (isOffline && extensionInstalled) {
        addLog('Scraper offline — falling back to extension', 'warn');
        triggerExtScrape(config.query, config.platform);
        return;
      } else if (isOffline) {
        addLog('Scraper offline. Install the extension or start python api.py', 'error');
      } else {
        addLog(`Cycle error: ${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    } finally {
      setRunning(false);
    }
  }, [running, config, addLog, extensionInstalled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { runCycleRef.current = runCycle; }, [runCycle]);

  // ── Scheduler (only active when extension is NOT installed) ───────────────
  // When the extension is present, its chrome.alarms handle timing. The page
  // only needs to poll getAutoResults and react to the FOS_SCRAPE_EVENT.

  useEffect(() => {
    if (!enabled || extensionInstalled) {
      if (intervalRef.current)  clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      nextFireRef.current = null;
      setNextRunIn(extensionInstalled && enabled ? 'Via extension' : '—');
      return;
    }

    const ms = config.intervalMinutes * 60 * 1000;
    nextFireRef.current = Date.now() + ms;

    intervalRef.current = setInterval(() => {
      nextFireRef.current = Date.now() + ms;
      runCycleRef.current?.(false);
    }, ms);

    countdownRef.current = setInterval(() => {
      if (nextFireRef.current === null) return;
      const remaining = Math.max(0, nextFireRef.current - Date.now());
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setNextRunIn(`${m}:${String(s).padStart(2, '0')}`);
    }, 1000);

    return () => {
      if (intervalRef.current)  clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [enabled, config.intervalMinutes, extensionInstalled]);

  // ── Config helpers ─────────────────────────────────────────────────────────
  // When extension is installed, config changes are synced to extension automatically.
  // The page is read-only for extension-controlled settings.

  function setField<K extends keyof AutomationConfig>(key: K, value: AutomationConfig[K]) {
    setConfig(prev => ({ ...prev, [key]: value }));
  }

  function toggleStack(s: string) {
    setConfig(prev => ({
      ...prev,
      techStack: prev.techStack.includes(s)
        ? prev.techStack.filter(x => x !== s)
        : [...prev.techStack, s],
    }));
  }

  function toggleDay(d: number) {
    setConfig(prev => ({
      ...prev,
      activeDays: (prev.activeDays ?? []).includes(d)
        ? (prev.activeDays ?? []).filter(x => x !== d)
        : [...(prev.activeDays ?? []), d],
    }));
  }

  // ── Start / Stop ──────────────────────────────────────────────────────────

  function handleToggleEnable() {
    // When extension is installed, keywords come from extension storage — skip local query check
    if (!enabled && !config.query.trim() && !extensionInstalled) {
      addLog('Set a search query before enabling automation', 'warn');
      return;
    }
    const next = !enabled;
    setEnabled(next);

    // Sync toggle back to extension immediately — include full config so keywords
    // are in extension storage before the immediate scrape cycle fires.
    if (extensionInstalled) {
      window.dispatchEvent(new CustomEvent('FOS_SET_EXT_STATE', {
        detail: { ...configToExtState(config), autoScrape: next },
      }));
      // Request fresh state after toggle to ensure sync
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('FOS_GET_EXT_STATE'));
      }, 300);
    }

    if (next) addLog('Automation enabled', 'success');
    else      addLog('Automation stopped', 'info');
  }

  function handleTest() {
    if (extensionInstalled) {
      // Drive the test through the extension so results flow through auto-results
      if (!config.query.trim()) { addLog('Set a search query first', 'warn'); return; }
      setRunning(true);
      triggerExtScrape(config.query, config.platform);
    } else {
      runCycle(true);
    }
  }

  function saveProjectManual(p: ScrapedProject) {
    setSavedProjects(prev => {
      if (prev.some(x => x.id === p.id)) return prev;
      scraperApi.saveProject({
        id: p.id, title: p.title, description: p.description,
        budget: p.budget, skills: p.skills, clientCountry: p.clientCountry,
        url: p.url, platform: p.platform,
      }).catch(() => {});
      return [...prev, p];
    });
  }

  function unsaveProject(id: string) {
    setSavedProjects(prev => prev.filter(p => p.id !== id));
    scraperApi.deleteSaved(id).catch(() => {});
  }

  function clearSavedProjects() {
    savedProjects.forEach(p => scraperApi.deleteSaved(p.id).catch(() => {}));
    setSavedProjects([]);
  }

  function goToAnalyze(p: ScrapedProject) {
    navigate('/ai-analyze', { state: { project: p } });
  }

  function clearMatched() {
    setMatchedProjects([]);
    setMatchedPage(1);
    addLog('Matched projects cleared', 'info');
    scraperApi.clearResults().catch(() => {});
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const withinWindow    = isWithinWindow(config.startTime, config.endTime);
  const totalMatchPages = Math.max(1, Math.ceil(matchedProjects.length / AUTO_PAGE_SIZE));
  const safeMPage       = Math.min(matchedPage, totalMatchPages);
  const visibleMatched  = matchedProjects.slice((safeMPage - 1) * AUTO_PAGE_SIZE, safeMPage * AUTO_PAGE_SIZE);

  const statusLabel = enabled
    ? running
      ? 'Running cycle...'
      : extensionInstalled
        ? 'Active — extension running'
        : withinWindow
          ? `Active — next in ${nextRunIn}`
          : 'Paused — outside window'
    : 'Stopped';

  const statusColor = enabled
    ? running
      ? 'text-primary'
      : 'text-emerald-600'
    : 'text-slate-400';

  const statusDot = enabled
    ? running
      ? 'bg-primary animate-pulse'
      : 'bg-emerald-500'
    : 'bg-slate-300';

  const activeFilterCount = [
    config.maxProposals !== 'any',
    !!config.minClientRating,
    !!config.minClientReviews,
    !!config.minBudget,
    !!config.maxBudget,
    !!config.includeKeywords.trim(),
    !!config.excludeKeywords.trim(),
    config.identityVerified,
    config.paymentVerified,
    config.depositMade,
    config.profileCompleted,
  ].filter(Boolean).length;

  return (
    <div className="flex h-full overflow-hidden">
    <div className="flex-1 overflow-y-auto">
    <div className="page-shell">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-dark flex items-center gap-2">
            <Bot size={22} className="text-primary" /> Automation
          </h1>
          <p className="text-slate-500 mt-0.5 text-sm">
            {extensionInstalled
              ? 'Extension-driven — settings sync with popup in real time'
              : 'Auto-fetch projects matching your criteria on a schedule'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowSavedPanel(v => !v)}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              showSavedPanel
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-white border-slate-200 text-slate-500 hover:border-primary/30 hover:text-primary',
            )}
          >
            <Bookmark size={11} />
            Saved {savedProjects.length > 0 && <span className="ml-0.5 bg-primary text-white rounded-full px-1.5 py-0.5 text-[9px] font-bold">{savedProjects.length}</span>}
          </button>

          <span className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border',
            scraperOnline === true
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : scraperOnline === false
                ? 'bg-red-50 border-red-200 text-red-600'
                : 'bg-slate-50 border-slate-200 text-slate-400',
          )}>
            <Zap size={10} />
            {scraperOnline === true ? 'Scraper Online' : scraperOnline === false ? 'Offline' : 'Checking...'}
          </span>

          {extensionInstalled && (
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border bg-primary/5 border-primary/20 text-primary">
              <Puzzle size={10} /> Extension Active
            </span>
          )}
        </div>
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6">
        <div className="card px-4 py-3 flex items-center gap-3">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', enabled ? 'bg-emerald-50' : 'bg-slate-50')}>
            <span className={clsx('w-2.5 h-2.5 rounded-full', statusDot)} />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Status</p>
            <p className={clsx('text-xs font-semibold leading-tight', statusColor)}>{enabled ? (running ? 'Running' : 'Active') : 'Stopped'}</p>
          </div>
        </div>
        <div className="card px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={14} className="text-primary" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Matched</p>
            <p className="text-xs font-semibold text-dark">{matchedProjects.length}</p>
          </div>
        </div>
        <div className="card px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
            <Bookmark size={14} className="text-amber-500" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Saved</p>
            <p className="text-xs font-semibold text-dark">{savedProjects.length}</p>
          </div>
        </div>
        <div className="card px-4 py-3 flex items-center gap-3 hidden sm:flex">
          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
            <Clock size={14} className="text-slate-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Next Run</p>
            <p className="text-xs font-semibold text-dark truncate">{nextRunIn}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,440px)_1fr] gap-6">

        {/* ── LEFT: Config ────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Search query + platform */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-dark flex items-center gap-2">
              <SlidersHorizontal size={14} className="text-primary" /> Search Configuration
              {extensionInstalled && (
                <span className="ml-auto text-[10px] text-primary/60 font-normal flex items-center gap-1">
                  <Puzzle size={9} /> synced with extension
                </span>
              )}
            </h2>

            <div>
              <label className="label">Search Keywords</label>
              <input
                value={config.query}
                onChange={e => setField('query', e.target.value)}
                className="input"
                placeholder="e.g. React developer, Python scraper..."
              />
              {extensionInstalled && (
                <p className="text-[10px] text-slate-400 mt-1">
                  Changes sync to the extension popup automatically
                </p>
              )}
            </div>

            <div>
              <label className="label">Platform</label>
              <select
                value={config.platform}
                onChange={e => setField('platform', e.target.value as AutomationConfig['platform'])}
                className="input"
              >
                <option value="both">Both Platforms</option>
                <option value="upwork">Upwork Only</option>
                <option value="freelancer">Freelancer Only</option>
              </select>
            </div>
          </div>

          {/* Schedule */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-dark flex items-center gap-2">
              <Clock size={14} className="text-primary" /> Schedule
            </h2>

            <div>
              <label className="label">Run Interval</label>
              <div className="flex flex-wrap gap-2">
                {INTERVALS.map(iv => (
                  <button
                    key={iv.value}
                    type="button"
                    onClick={() => setField('intervalMinutes', iv.value)}
                    className={clsx(
                      'text-xs px-3 py-1.5 rounded-lg border transition-colors',
                      config.intervalMinutes === iv.value
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-primary/40',
                    )}
                  >
                    {iv.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Start Time</label>
                <input
                  type="time"
                  value={config.startTime}
                  onChange={e => setField('startTime', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label">End Time</label>
                <input
                  type="time"
                  value={config.endTime}
                  onChange={e => setField('endTime', e.target.value)}
                  className="input"
                />
              </div>
            </div>

            {/* Active days */}
            <div>
              <label className="label flex items-center gap-1.5">
                <Calendar size={11} /> Active Days
              </label>
              <div className="flex gap-1.5 mt-1">
                {DAY_LABELS.map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={clsx(
                      'w-8 h-8 rounded-lg text-xs font-semibold border transition-colors',
                      (config.activeDays ?? []).includes(idx)
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-slate-400 border-slate-200 hover:border-primary/30',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <p className={clsx(
              'text-xs flex items-center gap-1.5',
              withinWindow ? 'text-emerald-600' : 'text-slate-400',
            )}>
              <span className={clsx('w-1.5 h-1.5 rounded-full', withinWindow ? 'bg-emerald-500' : 'bg-slate-300')} />
              {withinWindow
                ? `Within window (${config.startTime} – ${config.endTime})`
                : `Outside window — fetching paused until ${config.startTime}`}
            </p>
          </div>

          {/* Tech stack filter */}
          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-dark flex items-center gap-2">
              <Link2 size={14} className="text-primary" /> Tech Stack Filter
              {config.techStack.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-medium">
                  {config.techStack.length}
                </span>
              )}
            </h2>

            {config.techStack.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {config.techStack.map(s => (
                  <span key={s} className="badge badge-blue gap-1 text-xs">
                    {s}
                    <button onClick={() => toggleStack(s)} className="opacity-60 hover:opacity-100">
                      <X size={9} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative">
              <input
                value={stackSearch}
                onChange={e => setStackSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && stackSearch.trim()) {
                    e.preventDefault();
                    toggleStack(stackSearch.trim());
                    setStackSearch('');
                  }
                }}
                className="input text-xs"
                placeholder="Type a technology and press Enter..."
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Enter any technology name (e.g., React, Python, Docker, etc.)
              </p>
            </div>

            {config.techStack.length === 0 && (
              <p className="text-xs text-slate-400">No tech stack filter — all projects will match</p>
            )}
          </div>

          {/* Advanced filters */}
          <div className="card p-5 space-y-3">
            <button
              type="button"
              onClick={() => setShowFilters(v => !v)}
              className="w-full flex items-center justify-between text-sm font-semibold text-dark"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal size={14} className="text-primary" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-medium">
                    {activeFilterCount} active
                  </span>
                )}
              </span>
              {showFilters
                ? <ChevronUp size={14} className="text-slate-400" />
                : <ChevronDown size={14} className="text-slate-400" />}
            </button>

            {showFilters && (
              <div className="space-y-4 pt-1">
                <div className="flex flex-wrap gap-4">
                  <div>
                    <label className="label text-[11px]">Max Proposals</label>
                    <select
                      value={config.maxProposals}
                      onChange={e => setField('maxProposals', e.target.value)}
                      className="input w-36 text-xs"
                    >
                      <option value="any">Any</option>
                      <option value="5">5 or fewer</option>
                      <option value="10">10 or fewer</option>
                      <option value="20">20 or fewer</option>
                      <option value="50">50 or fewer</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-[11px]">Min Client Rating</label>
                    <select
                      value={config.minClientRating}
                      onChange={e => setField('minClientRating', e.target.value)}
                      className="input w-36 text-xs"
                    >
                      <option value="">Any</option>
                      <option value="3">3+ stars</option>
                      <option value="4">4+ stars</option>
                      <option value="4.5">4.5+ stars</option>
                      <option value="4.8">4.8+ stars</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-[11px]">Min Client Reviews</label>
                    <select
                      value={config.minClientReviews}
                      onChange={e => setField('minClientReviews', e.target.value)}
                      className="input w-36 text-xs"
                    >
                      <option value="">Any</option>
                      <option value="1">1+</option>
                      <option value="3">3+</option>
                      <option value="5">5+</option>
                      <option value="10">10+</option>
                      <option value="25">25+</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4">
                  <div className="flex-1 min-w-28">
                    <label className="label text-[11px]">Min Budget ($)</label>
                    <input
                      type="number" min="0"
                      value={config.minBudget}
                      onChange={e => setField('minBudget', e.target.value)}
                      className="input text-xs"
                      placeholder="e.g. 100"
                    />
                  </div>
                  <div className="flex-1 min-w-28">
                    <label className="label text-[11px]">Max Budget ($)</label>
                    <input
                      type="number" min="0"
                      value={config.maxBudget}
                      onChange={e => setField('maxBudget', e.target.value)}
                      className="input text-xs"
                      placeholder="e.g. 5000"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-4">
                  <div className="flex-1 min-w-48">
                    <label className="label text-[11px]">
                      Include Keywords <span className="text-slate-400">(comma-separated)</span>
                    </label>
                    <input
                      value={config.includeKeywords}
                      onChange={e => setField('includeKeywords', e.target.value)}
                      className="input text-xs"
                      placeholder="e.g. API, dashboard"
                    />
                  </div>
                  <div className="flex-1 min-w-48">
                    <label className="label text-[11px]">
                      Exclude Keywords <span className="text-slate-400">(comma-separated)</span>
                    </label>
                    <input
                      value={config.excludeKeywords}
                      onChange={e => setField('excludeKeywords', e.target.value)}
                      className="input text-xs"
                      placeholder="e.g. WordPress, Wix"
                    />
                  </div>
                </div>

                <div>
                  <label className="label text-[11px] mb-2">Client Verification</label>
                  <div className="flex flex-wrap gap-3">
                    {([
                      ['identityVerified', 'Identity Verified'],
                      ['paymentVerified',  'Payment Verified'],
                      ['depositMade',      'Deposit Made'],
                      ['profileCompleted', 'Profile Completed'],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={config[key]}
                          onChange={e => setField(key, e.target.checked)}
                          className="rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        <span className="text-xs text-slate-600">{label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Flags are enforced only when the platform provides the data.
                  </p>
                </div>

                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfig(prev => ({
                      ...prev,
                      maxProposals: 'any', minClientRating: '', minClientReviews: '',
                      minBudget: '', maxBudget: '',
                      includeKeywords: '', excludeKeywords: '',
                      identityVerified: false, paymentVerified: false,
                      depositMade: false, profileCompleted: false,
                    }))}
                    className="text-xs text-slate-400 hover:text-danger flex items-center gap-1"
                  >
                    <X size={11} /> Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleToggleEnable}
                disabled={scraperOnline === false && !extensionInstalled}
                className={clsx(
                  'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all border shadow-sm',
                  enabled
                    ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100 hover:shadow-none'
                    : 'bg-primary border-primary text-white hover:bg-primary/90 hover:shadow-none',
                  (scraperOnline === false && !extensionInstalled) && 'opacity-50 cursor-not-allowed',
                )}
              >
                {enabled
                  ? <><Square size={14} /> Stop Automation</>
                  : <><Play size={14} fill="currentColor" /> Start Automation</>}
              </button>

              <button
                onClick={handleTest}
                disabled={running || (scraperOnline === false && !extensionInstalled)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium border transition-all',
                  'bg-white border-slate-200 text-slate-600 hover:border-primary/40 hover:text-primary hover:bg-primary/5',
                  (running || (scraperOnline === false && !extensionInstalled)) && 'opacity-50 cursor-not-allowed',
                )}
              >
                {running
                  ? <><RefreshCw size={12} className="animate-spin" /> {extensionStatus || 'Running...'}</>
                  : <><FlaskConical size={12} /> Test Now</>}
              </button>
            </div>

            {scraperOnline === false && !extensionInstalled && (
              <p className="text-xs text-red-500 flex items-center gap-1.5 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                <AlertCircle size={11} /> Start the scraper or install the extension
              </p>
            )}
            {scraperOnline === false && extensionInstalled && (
              <p className="text-xs text-primary flex items-center gap-1.5 bg-primary/5 px-3 py-2 rounded-lg border border-primary/10">
                <CheckCircle2 size={11} /> Extension active — scraper not required
              </p>
            )}

            {lastRun && (
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Clock size={10} /> Last run: {lastRun}
              </p>
            )}
          </div>

          {/* Activity log */}
          {logs.length > 0 && (
            <div className="card p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Zap size={10} className="text-primary" /> Activity Log
              </p>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {logs.map((l, i) => (
                  <div key={i} className={clsx(
                    'text-[11px] flex gap-2 items-start px-2 py-1 rounded',
                    l.type === 'success' ? 'text-emerald-700 bg-emerald-50/60'
                      : l.type === 'warn'  ? 'text-amber-700 bg-amber-50/60'
                      : l.type === 'error' ? 'text-red-600 bg-red-50/60'
                      : 'text-slate-500',
                  )}>
                    <span className="text-slate-300 flex-shrink-0 font-mono">{l.ts}</span>
                    <span>{l.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Matched Projects ──────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-dark flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-500" />
              Matched Projects
              {matchedProjects.length > 0 && (
                <span className="px-2 py-0.5 bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-full text-[10px] font-bold">
                  {matchedProjects.length}
                </span>
              )}
            </h2>
            {matchedProjects.length > 0 && (
              <button onClick={clearMatched} className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors">
                <X size={11} /> Clear
              </button>
            )}
          </div>

          {matchedProjects.length === 0 && (
            <div className="card p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
                <Bot size={28} className="text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-600">No matches yet</p>
              <p className="text-xs text-slate-400 mt-1.5 max-w-xs mx-auto">
                {extensionInstalled
                  ? enabled
                    ? 'Waiting for the extension to push results…'
                    : 'Enable automation or click Test Now to begin.'
                  : config.query
                    ? 'Click "Test Now" or "Start Automation" to fetch projects.'
                    : 'Set a search query above, then start automation.'}
              </p>
            </div>
          )}

          <div className="space-y-3">
            {visibleMatched.map(project => {
              const isSaved = savedProjects.some(p => p.id === project.id);
              return (
                <div key={project.id} className={clsx(
                  'card p-4 border-l-2 transition-shadow hover:shadow-md',
                  project.platform === 'upwork' ? 'border-l-emerald-400' : 'border-l-blue-400',
                )}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-dark text-sm leading-tight">{project.title}</h3>
                        <span className={clsx(
                          'badge text-[10px] capitalize',
                          project.platform === 'upwork' ? 'badge-success' : 'badge-blue',
                        )}>
                          {project.platform}
                        </span>
                      </div>

                      <p className="text-sm text-slate-600 line-clamp-2 mb-3">{project.description}</p>

                      <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500">
                        {project.budget && (
                          <span className="flex items-center gap-1">
                            <DollarSign size={11} className="text-success" />{project.budget}
                          </span>
                        )}
                        {project.clientCountry && (
                          <span className="flex items-center gap-1">
                            <Globe size={11} />{project.clientCountry}
                          </span>
                        )}
                        {project.proposalsCount != null && (
                          <span className="flex items-center gap-1">
                            <Users size={11} />{project.proposalsCount} proposals
                          </span>
                        )}
                        {project.clientRating != null && (
                          <span className="flex items-center gap-1 text-amber-500">
                            <Star size={10} className="fill-amber-400" />
                            {project.clientRating.toFixed(1)}
                          </span>
                        )}
                        {project.clientReviewCount != null && (
                          <span className="flex items-center gap-1 text-slate-400">
                            {project.clientReviewCount} reviews
                          </span>
                        )}
                      </div>

                      {(project.identityVerified || project.paymentVerified || project.profileCompleted) && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {project.identityVerified && <span className="badge badge-success text-[10px]">ID Verified</span>}
                          {project.paymentVerified  && <span className="badge badge-success text-[10px]">Payment Verified</span>}
                          {project.profileCompleted && <span className="badge badge-success text-[10px]">Profile Complete</span>}
                        </div>
                      )}

                      {project.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {project.skills.slice(0, 6).map(s => (
                            <span key={s} className="badge badge-gray text-[10px]">{s}</span>
                          ))}
                          {project.skills.length > 6 && (
                            <span className="badge badge-gray text-[10px]">+{project.skills.length - 6}</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <a
                        href={project.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1 justify-center"
                      >
                        <ExternalLink size={11} /> View
                      </a>
                      <button
                        onClick={() => goToAnalyze(project)}
                        className="btn-primary text-xs px-2.5 py-1.5 flex items-center gap-1 justify-center"
                      >
                        <Brain size={11} /> Analyze
                      </button>
                      <button
                        onClick={() => isSaved ? unsaveProject(project.id) : saveProjectManual(project)}
                        className={clsx(
                          'text-xs px-2.5 py-1.5 rounded border flex items-center gap-1 justify-center transition-colors',
                          isSaved
                            ? 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-amber-200 hover:text-amber-600',
                        )}
                      >
                        {isSaved
                          ? <><BookmarkCheck size={11} /> Saved</>
                          : <><Bookmark size={11} /> Save</>}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {matchedProjects.length > AUTO_PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                type="button"
                onClick={() => setMatchedPage(p => Math.max(1, p - 1))}
                disabled={safeMPage <= 1}
                className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-40"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="text-xs text-slate-500">
                Page {safeMPage} of {totalMatchPages}
              </span>
              <button
                type="button"
                onClick={() => setMatchedPage(p => Math.min(totalMatchPages, p + 1))}
                disabled={safeMPage >= totalMatchPages}
                className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-40"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>

    {/* ── Saved Projects Panel ──────────────────────────────────────────────── */}
    {showSavedPanel && (
      <div className="w-72 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <p className="text-sm font-semibold text-dark flex items-center gap-1.5">
            <BookmarkCheck size={14} className="text-primary" />
            Saved Projects ({savedProjects.length})
          </p>
          <div className="flex items-center gap-2">
            {savedProjects.length > 0 && (
              <button
                onClick={clearSavedProjects}
                className="text-[11px] text-slate-500 hover:text-red-500 transition-colors"
              >
                Clear all
              </button>
            )}
            <button onClick={() => setShowSavedPanel(false)} className="text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {savedProjects.length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-xs mt-4">
              <Bookmark size={24} className="mx-auto mb-2 text-slate-200" />
              No saved projects yet
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {savedProjects.map(p => (
                <div key={p.id} className="p-3 hover:bg-slate-50">
                  <p className="text-xs font-medium text-dark line-clamp-2 leading-tight mb-1">{p.title}</p>
                  <p className="text-[10px] text-slate-400 mb-2">
                    {p.budget ? `${p.budget} · ` : ''}{p.platform}
                  </p>
                  <div className="flex items-center gap-1">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center text-[10px] px-2 py-1 rounded border border-slate-200 text-slate-600 hover:border-primary/40 hover:text-primary transition-colors"
                    >
                      Open
                    </a>
                    <button
                      onClick={() => goToAnalyze(p)}
                      className="text-[10px] px-2 py-1 rounded border border-slate-200 text-slate-600 hover:border-primary/40 hover:text-primary transition-colors"
                    >
                      <Brain size={10} />
                    </button>
                    <button
                      onClick={() => unsaveProject(p.id)}
                      className="text-[10px] px-2 py-1 rounded border border-slate-200 text-slate-400 hover:border-red-200 hover:text-red-500 transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )}
    </div>
  );
}
