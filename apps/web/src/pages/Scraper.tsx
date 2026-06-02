import { useState, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useVoiceAssistantStore } from '../store/voiceAssistantStore';
import { useRegisterVoiceActions } from '../lib/voiceCommands/actionRegistry';
import {
  Search, ExternalLink, Globe, DollarSign, Users,
  AlertCircle, CheckCircle2, Brain, RefreshCw, Clock,
  Link2, SlidersHorizontal, X,
  Bookmark, BookmarkCheck, CheckSquare, RotateCcw, ChevronLeft, ChevronRight, Puzzle,
} from 'lucide-react';
import { scraperApi, connectionsApi } from '../lib/api';
import { ScraperQuerySchema, type ScraperQueryInput } from '@freelancer-os/shared';
import type { ScrapedProject } from '@freelancer-os/shared';
import { SEARCH_KEYWORDS, POPULAR_KEYWORDS } from '../lib/searchKeywords';
import clsx from 'clsx';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey = 'default' | 'budget_asc' | 'budget_desc' | 'proposals_asc' | 'proposals_desc';

interface Filters {
  platform: string;
  minProposals: string;
  maxProposals: string;
  minClientRating: string;
  minBudget: string;
  maxBudget: string;
  includeKeywords: string;
  excludeKeywords: string;
  identityVerified: boolean;
  paymentVerified: boolean;
  depositMade: boolean;
  profileCompleted: boolean;
}

const DEFAULT_FILTERS: Filters = {
  platform: 'all',
  minProposals: '',
  maxProposals: 'any',
  minClientRating: '',
  minBudget: '',
  maxBudget: '',
  includeKeywords: '',
  excludeKeywords: '',
  identityVerified: false,
  paymentVerified: false,
  depositMade: false,
  profileCompleted: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseBudgetMin(budget: string): number {
  const match = budget.match(/\$?([\d,]+)/);
  return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
}

function parseBudgetMax(budget: string): number {
  const rangeMatch = budget.match(/\$[\d,]+\s*[–\-]\s*\$?([\d,]+)/);
  if (rangeMatch) return parseInt(rangeMatch[1].replace(/,/g, ''), 10);
  const matches = budget.match(/\$?([\d,]+)/g);
  if (matches && matches.length >= 2) return parseInt(matches[1].replace(/[$,]/g, ''), 10);
  if (matches && matches.length === 1 && !budget.includes('+')) return parseInt(matches[0].replace(/[$,]/g, ''), 10);
  return Infinity;
}

function applySort(projects: ScrapedProject[], sort: SortKey): ScrapedProject[] {
  if (sort === 'default') return projects;
  return [...projects].sort((a, b) => {
    if (sort === 'budget_asc')    return parseBudgetMin(a.budget) - parseBudgetMin(b.budget);
    if (sort === 'budget_desc')   return parseBudgetMin(b.budget) - parseBudgetMin(a.budget);
    if (sort === 'proposals_asc') return (a.proposalsCount ?? 999) - (b.proposalsCount ?? 999);
    if (sort === 'proposals_desc') return (b.proposalsCount ?? 0) - (a.proposalsCount ?? 0);
    return 0;
  });
}

/**
 * STRICT FILTERING: A project passes only if it matches ALL selected criteria
 * Uses AND logic for all filters (platform, proposals, rating, budget, keywords, etc.)
 */
function applyFilters(projects: ScrapedProject[], filters: Filters): ScrapedProject[] {
  return projects.filter((p) => {
    // 1. PLATFORM (AND logic: must match selected platform)
    if (filters.platform !== 'all' && p.platform !== filters.platform) return false;

    // 2. PROPOSALS (AND logic: all must pass)
    if (filters.maxProposals !== 'any') {
      const max = parseInt(filters.maxProposals, 10);
      if ((p.proposalsCount ?? 999) > max) return false;
    }

    if (filters.minProposals) {
      const min = parseInt(filters.minProposals, 10);
      if (!isNaN(min) && (p.proposalsCount ?? 0) < min) return false;
    }

    // 3. CLIENT RATING (AND logic: must meet minimum)
    if (filters.minClientRating) {
      const min = parseFloat(filters.minClientRating);
      if (p.clientRating == null || p.clientRating < min) return false;
    }

    // 4. BUDGET (AND logic: must be within range)
    if (filters.minBudget) {
      const min = parseInt(filters.minBudget, 10);
      if (!isNaN(min) && parseBudgetMin(p.budget) < min) return false;
    }

    if (filters.maxBudget) {
      const max = parseInt(filters.maxBudget, 10);
      if (!isNaN(max) && parseBudgetMax(p.budget) > max) return false;
    }

    // 5. INCLUDE KEYWORDS (AND logic: ALL must appear in title/description)
    if (filters.includeKeywords.trim()) {
      const kws = filters.includeKeywords.toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
      const text = `${p.title || ''} ${p.description || ''}`.toLowerCase();
      if (!kws.every(k => text.includes(k))) return false;
    }

    // 6. EXCLUDE KEYWORDS (AND logic: NONE must appear in title/description)
    if (filters.excludeKeywords.trim()) {
      const kws = filters.excludeKeywords.toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
      const text = `${p.title || ''} ${p.description || ''}`.toLowerCase();
      if (kws.some(k => text.includes(k))) return false;
    }

    // 7. VERIFICATION FLAGS (AND logic: all selected must be true)
    if (filters.identityVerified && p.identityVerified === false) return false;
    if (filters.paymentVerified && p.paymentVerified === false) return false;
    if (filters.depositMade && p.depositMade === false) return false;
    if (filters.profileCompleted && p.profileCompleted === false) return false;

    // All filters passed
    return true;
  });
}

function countActiveFilters(f: Filters): number {
  let n = 0;
  if (f.platform !== 'all') n++;
  if (f.maxProposals !== 'any') n++;
  if (f.minProposals) n++;
  if (f.minClientRating) n++;
  if (f.minBudget) n++;
  if (f.maxBudget) n++;
  if (f.includeKeywords.trim()) n++;
  if (f.excludeKeywords.trim()) n++;
  if (f.identityVerified) n++;
  if (f.paymentVerified) n++;
  if (f.depositMade) n++;
  if (f.profileCompleted) n++;
  return n;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Scraper() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoSearchFired = useRef(false);

  // Results & search state
  const [allResults,  setAllResults]  = useState<ScrapedProject[]>([]);
  const [page,        setPage]        = useState(1);
  const [lastSearch,  setLastSearch]  = useState<ScraperQueryInput | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analysisMap, setAnalysisMap] = useState<Record<string, {
    techFitScore: number; effortLevel: string; winningAngle: string;
    bidRange: { min: number; max: number };
  }>>({});
  const [resultSource, setResultSource] = useState<string>('');

  // Sort / filter
  const [showFilters, setShowFilters] = useState(false);
  const [sort,        setSort]        = useState<SortKey>('default');
  const [filters,     setFilters]     = useState<Filters>(DEFAULT_FILTERS);

  // Autocomplete
  const [inputFocused, setInputFocused] = useState(false);

  // Toast notification
  const [toast, setToast] = useState<{ message: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Saved / bidded projects (persisted to localStorage)
  const [savedProjects, setSavedProjects] = useState<ScrapedProject[]>(() =>
    loadFromStorage<ScrapedProject[]>('fos_savedProjects', []),
  );
  const [biddedIds, setBiddedIds] = useState<Set<string>>(() =>
    new Set(loadFromStorage<string[]>('fos_biddedIds', [])),
  );
  const [showSavedPanel, setShowSavedPanel] = useState(false);

  useEffect(() => {
    localStorage.setItem('fos_savedProjects', JSON.stringify(savedProjects));
  }, [savedProjects]);

  useEffect(() => {
    localStorage.setItem('fos_biddedIds', JSON.stringify([...biddedIds]));
  }, [biddedIds]);

  // Scraper health
  const { data: statusData } = useQuery({
    queryKey: ['scraper-status'],
    queryFn: scraperApi.status,
    refetchInterval: 30000,
  });

  // Platform connection status
  const { data: connectionStatus } = useQuery({
    queryKey: ['platform-connections-status'],
    queryFn: connectionsApi.status,
    staleTime: 30000,
  });

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<ScraperQueryInput>({
    resolver: zodResolver(ScraperQuerySchema),
    defaultValues: { platform: 'both', limit: 50 },
  });

  const queryValue      = watch('query') ?? '';
  const normalizedQuery = queryValue.trim().toLowerCase();

  // ── Voice: pending command from cross-page navigation ─────────────────────
  const voicePending      = useVoiceAssistantStore((s) => s.sessionContext.pendingCommand);
  const clearVoicePending = useVoiceAssistantStore((s) => s.setPendingCommand);
  const updateVoiceCtx    = useVoiceAssistantStore((s) => s.updateSessionContext);

  useEffect(() => {
    if (voicePending?.type === 'search' && voicePending.payload?.query) {
      const q = voicePending.payload.query;
      clearVoicePending(null);
      setValue('query', q, { shouldDirty: true, shouldValidate: true });
      setTimeout(() => handleSubmit(onSubmit)(), 0);
    }
  }, [voicePending]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same-page voice command via CustomEvent (already on /scraper)
  useEffect(() => {
    function onAriaCommand(e: Event) {
      const detail = (e as CustomEvent).detail as { type: string; payload: Record<string, string> };
      if (detail?.type === 'search' && detail.payload?.query) {
        setValue('query', detail.payload.query, { shouldDirty: true, shouldValidate: true });
        setTimeout(() => handleSubmit(onSubmit)(), 0);
      }
    }
    window.addEventListener('aria:command', onAriaCommand);
    return () => window.removeEventListener('aria:command', onAriaCommand);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Register voice actions for this page
  useRegisterVoiceActions(() => [
    {
      id: 'scraper.search',
      route: '/scraper',
      label: 'Search projects',
      description: 'Search for freelance projects by keyword',
      keywords: ['search', 'find', 'look for', 'query'],
      params: [{ name: 'query', type: 'string', description: 'Search keyword', required: true }],
      execute: (params) => {
        const q = String(params?.query ?? '');
        setValue('query', q, { shouldDirty: true, shouldValidate: true });
        setTimeout(() => handleSubmit(onSubmit)(), 0);
      },
    },
    {
      id: 'scraper.clear',
      route: '/scraper',
      label: 'Clear search',
      description: 'Clear current search results',
      keywords: ['clear', 'reset', 'new search'],
      execute: () => {
        setValue('query', '');
        setValue('platform', 'both');
      },
    },
  ], []);

  const suggestions = normalizedQuery.length === 0
    ? []
    : SEARCH_KEYWORDS
        .filter(s => s.toLowerCase().includes(normalizedQuery) && s.toLowerCase() !== normalizedQuery)
        .slice(0, 8);

  const [isRefreshing, setIsRefreshing] = useState(false);

  type PlatformOutcome = { status: string; count: number; message: string; error_code?: string };
  const [platformOutcomes, setPlatformOutcomes] = useState<Record<string, PlatformOutcome>>({});

  // Extension state
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [extensionStatus,    setExtensionStatus]    = useState('');

  // Extension results query — triggered explicitly, not on mount
  const { data: extensionResultsData, refetch: refetchExtResults } = useQuery({
    queryKey:  ['extension-results', lastSearch?.query, lastSearch?.platform],
    queryFn:   () => scraperApi.getExtensionResults(lastSearch!.query, lastSearch!.platform ?? 'both'),
    enabled:   !!lastSearch,
    refetchInterval: lastSearch && extensionStatus ? 10000 : false,
    staleTime: 0,
  });

  useEffect(() => {
    if (!extensionResultsData?.cached || !extensionResultsData.projects?.length) return;
    setResultSource('extension');
    setAllResults(prev => {
      const ids = new Set(prev.map(p => p.id));
      const fresh = (extensionResultsData.projects as ScrapedProject[]).filter((p: ScrapedProject) => !ids.has(p.id));
      if (!fresh.length) return prev;
      setToast({ message: `${fresh.length} new project${fresh.length !== 1 ? 's' : ''} from extension` });
      return [...fresh, ...prev];
    });
  }, [extensionResultsData]);

  // Detect extension presence (content script sets window.__FOS_EXTENSION_INSTALLED__)
  useEffect(() => {
    const win = window as Window & { __FOS_EXTENSION_INSTALLED__?: boolean };
    if (win.__FOS_EXTENSION_INSTALLED__) { setExtensionInstalled(true); return; }
    const t = setTimeout(() => { if (win.__FOS_EXTENSION_INSTALLED__) setExtensionInstalled(true); }, 800);
    return () => clearTimeout(t);
  }, []);

  // Listen for scrape events broadcast by app-bridge.js content script
  useEffect(() => {
    function onScrapeEvent(e: Event) {
      const msg = (e as CustomEvent<{ type: string; message?: string; projects?: ScrapedProject[] }>).detail;
      if (msg.type === 'SCRAPE_STATUS') {
        setExtensionStatus(msg.message || 'Extension scraping…');
      } else if (msg.type === 'SCRAPE_DONE') {
        setExtensionStatus('');
        if (msg.projects?.length) {
          setAllResults(prev => {
            const ids   = new Set(prev.map(p => p.id));
            const fresh = (msg.projects as ScrapedProject[]).filter(p => !ids.has(p.id));
            if (!fresh.length) return prev;
            setToast({ message: `${fresh.length} new project${fresh.length !== 1 ? 's' : ''} from extension` });
            return [...fresh, ...prev];
          });
        }
        refetchExtResults().then(({ data }) => {
          if (!data?.cached || !data.projects?.length) return;
          setAllResults(prev => {
            const ids   = new Set(prev.map(p => p.id));
            const fresh = (data.projects as ScrapedProject[]).filter((p: ScrapedProject) => !ids.has(p.id));
            return fresh.length ? [...fresh, ...prev] : prev;
          });
        });
      }
    }
    window.addEventListener('FOS_SCRAPE_EVENT', onScrapeEvent);
    return () => window.removeEventListener('FOS_SCRAPE_EVENT', onScrapeEvent);
  }, [refetchExtResults]);

  // ── Extension helpers ─────────────────────────────────────────────────────

  function triggerExtScrape(query: string, platform: string) {
    if (!extensionInstalled) return;
    window.dispatchEvent(new CustomEvent('FOS_SCRAPE_REQUEST', {
      detail: { query, platform: platform || 'both' },
    }));
    setExtensionStatus('Extension scraping…');
  }

  // ── Search mutation ───────────────────────────────────────────────────────

  const searchMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => scraperApi.search(data),
    onSuccess: (data) => {
      const projects        = data.projects ?? [];
      const source: string  = data.source   ?? '';
      setAllResults(projects);
      setPlatformOutcomes(data.platformOutcomes ?? {});
      setResultSource(source);
      // Sync results to ARIA session context so "open the second one" works
      updateVoiceCtx({
        lastProjectList: (projects as ScrapedProject[]).slice(0, 20).map((p, i) => ({
          id: p.id,
          title: p.title ?? '',
          url: p.url ?? '',
          index: i,
        })),
        lastSearchQuery: lastSearch?.query ?? '',
      });
      setPage(1);
    },
    onError: () => {
      // Even if server scraper fails, try to pull extension results
      if (lastSearch) {
        refetchExtResults().then(({ data }) => {
          if (data?.cached && data.projects?.length) {
            setAllResults(data.projects as ScrapedProject[]);
            setResultSource('extension');
            setPlatformOutcomes({});
          }
        });
      }
    },
  });

  // Auto-search when opened via extension "Search in Find Projects" button
  useEffect(() => {
    if (autoSearchFired.current) return;
    const q = searchParams.get('q');
    const p = searchParams.get('platform');
    if (!q) return;
    autoSearchFired.current = true;

    const platform = (['both', 'upwork', 'freelancer'].includes(p ?? ''))
      ? (p as 'both' | 'upwork' | 'freelancer')
      : 'both';

    setValue('query', q);
    setValue('platform', platform);

    const payload = { query: q, platform, limit: 50 };
    setLastSearch(payload);
    searchMutation.mutate(payload);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSubmit(data: ScraperQueryInput) {
    const payload = {
      ...data,
      identityVerified: filters.identityVerified || undefined,
      paymentVerified:  filters.paymentVerified  || undefined,
      depositMade:      filters.depositMade      || undefined,
      profileCompleted: filters.profileCompleted || undefined,
    };
    setLastSearch(payload as ScraperQueryInput);

    // If extension is installed and scraper is offline, go extension-first
    if (extensionInstalled && !isOnline) {
      triggerExtScrape(data.query, data.platform ?? 'both');
      return;
    }

    searchMutation.mutate(payload as ScraperQueryInput);
    // Also trigger extension scrape in parallel (results flow via FOS_SCRAPE_EVENT)
    triggerExtScrape(data.query, data.platform ?? 'both');
  }

  async function handleRefresh() {
    if (!lastSearch || isRefreshing) return;
    setIsRefreshing(true);
    try {
      // Clear both extension-results and scraper cache for this query
      await scraperApi.deleteExtensionResults(lastSearch.query, lastSearch.platform ?? 'both').catch(() => {});

      // Fetch completely fresh results, bypassing any remaining Redis cache
      const data = await scraperApi.search(lastSearch as Record<string, unknown>, true);
      const incoming: ScrapedProject[] = data.projects ?? [];
      setPlatformOutcomes(data.platformOutcomes ?? {});
      setResultSource(data.source ?? '');

      // Count how many are new compared to what was previously shown
      const prevIds = new Set(allResults.map(p => p.id));
      const newCount = incoming.filter(p => !prevIds.has(p.id)).length;

      // Replace the result list entirely so user sees current data
      setAllResults(incoming);
      setPage(1);

      if (newCount > 0) {
        setToast({ message: `Found ${newCount} new project${newCount !== 1 ? 's' : ''}` });
      } else {
        setToast({ message: 'No new projects found' });
      }

      // Also re-trigger extension scrape in parallel
      triggerExtScrape(lastSearch.query, lastSearch.platform ?? 'both');
    } catch {
      setToast({ message: 'Refresh failed — try again' });
    } finally {
      setIsRefreshing(false);
    }
  }

  async function analyzeProject(project: ScrapedProject) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { aiApi } = await import('../lib/api');
    setAnalyzingId(project.id);
    try {
      const result = await aiApi.analyze({
        projectTitle:       project.title,
        projectDescription: project.description,
        clientCountry:      project.clientCountry,
      });
      setAnalysisMap(prev => ({ ...prev, [project.id]: result }));
    } catch { /* ignore */ }
    finally { setAnalyzingId(null); }
  }

  function goToAIAnalyze(project: ScrapedProject) {
    navigate('/ai-analyze', { state: { project } });
  }

  function saveProject(project: ScrapedProject) {
    setSavedProjects(prev =>
      prev.some(p => p.id === project.id) ? prev : [...prev, project],
    );
  }

  function unsaveProject(id: string) {
    setSavedProjects(prev => prev.filter(p => p.id !== id));
  }

  function clearSavedProjects() {
    setSavedProjects([]);
  }

  function markBidded(project: ScrapedProject) {
    setBiddedIds(prev => new Set([...prev, project.id]));
    unsaveProject(project.id);
  }

  const isOnline          = statusData?.status === 'online';
  const activeFilterCount = countActiveFilters(filters);

  const withoutBidded = useMemo(() => allResults.filter(p => !biddedIds.has(p.id)), [allResults, biddedIds]);
  const processed     = useMemo(() => applyFilters(applySort(withoutBidded, sort), filters), [withoutBidded, sort, filters]);
  const totalPages    = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const safePage      = Math.min(page, totalPages);
  const visible       = processed.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const upworkCount     = allResults.filter(p => p.platform === 'upwork').length;
  const freelancerCount = allResults.filter(p => p.platform === 'freelancer').length;

  // ── Helper: should we suppress the reconnect/expired message? ────────────
  // If the platform IS connected (via extension), don't tell user to reconnect.
  const upworkConnected     = connectionStatus?.upwork     === true;
  const freelancerConnected = connectionStatus?.freelancer === true;

  return (
    <div className="flex h-full overflow-hidden">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-dark text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium pointer-events-none animate-in fade-in slide-in-from-top-2">
          {toast.message}
        </div>
      )}

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="page-shell">

          {/* Header */}
          <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-dark flex items-center gap-2">
                <Search size={22} className="text-primary" /> Find Projects
              </h1>
              <p className="text-slate-500 mt-0.5 mb-2">Search live freelance projects from Upwork &amp; Freelancer.com</p>

              {/* Compact connection status row under title */}
              <div className="flex items-center gap-2 flex-wrap">
                {(['upwork', 'freelancer'] as const).map(p => {
                  const connected = connectionStatus?.[p];
                  return (
                    <span key={p} className={clsx(
                      'flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
                      connected
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-slate-50 border-slate-200 text-slate-400',
                    )}>
                      <Link2 size={9} />
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                      {connected ? ' ✓' : ' —'}
                    </span>
                  );
                })}
                <span className={clsx(
                  'flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
                  isOnline
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-red-50 border-red-200 text-red-700',
                )}>
                  {isOnline
                    ? <><CheckCircle2 size={9} /> Scraper Online</>
                    : <><AlertCircle size={9} /> Scraper Offline</>}
                </span>
                {extensionInstalled && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-primary/5 border-primary/20 text-primary">
                    <Puzzle size={9} /> Extension
                  </span>
                )}
              </div>
            </div>

            {/* Saved panel toggle */}
            <button
              onClick={() => setShowSavedPanel(v => !v)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                showSavedPanel
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-primary/30 hover:text-primary',
              )}
            >
              <Bookmark size={12} />
              Saved {savedProjects.length > 0 && `(${savedProjects.length})`}
            </button>
          </div>

          {/* Offline warning */}
          {!isOnline && !extensionInstalled && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-800 font-medium">Scraper service not running</p>
              <p className="text-xs text-amber-700 mt-1">
                Start it with: <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">cd apps/scraper &amp;&amp; python api.py</code>
                {' '}or install the{' '}
                <span className="font-medium">Freelancer OS Chrome Extension</span>{' '}
                and click Scrape Now.
              </p>
            </div>
          )}
          {/* Extension-primary banner: scraper offline but extension connected */}
          {!isOnline && extensionInstalled && (
            <div className="mb-4 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-center gap-2 text-xs text-primary">
              <Puzzle size={14} className="flex-shrink-0" />
              <span>Scraper offline — <strong>extension is active</strong>. Search will use the extension directly.</span>
            </div>
          )}

          {/* Search form + inline filter button */}
          <div className="card relative z-20 overflow-visible p-5 mb-4">
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="flex gap-3 flex-wrap">
                {/* Search input with autocomplete */}
                <div className="flex-1 min-w-48 relative">
                  <input
                    {...register('query')}
                    className="input"
                    placeholder="e.g. React developer, WordPress, Python scraper..."
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setTimeout(() => setInputFocused(false), 150)}
                    autoComplete="off"
                  />

                  {/* Popular keywords — shown when focused + empty */}
                  {inputFocused && queryValue.trim().length === 0 && (
                    <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Popular Searches</p>
                      <div className="flex flex-wrap gap-1.5">
                        {POPULAR_KEYWORDS.map(kw => (
                          <button
                            key={kw}
                            type="button"
                            onMouseDown={() => {
                              setValue('query', kw, { shouldDirty: true, shouldValidate: true });
                              setInputFocused(false);
                            }}
                            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition"
                          >
                            {kw}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Filtered suggestions dropdown — shown while typing */}
                  {inputFocused && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                      {suggestions.map(s => (
                        <button
                          key={s}
                          type="button"
                          onMouseDown={() => {
                            setValue('query', s, { shouldDirty: true, shouldValidate: true });
                            setInputFocused(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-primary/5 hover:text-primary transition-colors flex items-center gap-2"
                        >
                          <Search size={11} className="text-slate-400 flex-shrink-0" />
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                  {errors.query && <p className="mt-1 text-xs text-danger">{errors.query.message}</p>}
                </div>

                <select {...register('platform')} className="input w-40">
                  <option value="both">Both Platforms</option>
                  <option value="upwork">Upwork Only</option>
                  <option value="freelancer">Freelancer Only</option>
                </select>

                {/* Inline filter toggle button */}
                <button
                  type="button"
                  onClick={() => setShowFilters(v => !v)}
                  title="Filters"
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all relative',
                    showFilters
                      ? 'bg-primary/5 border-primary/30 text-primary'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-primary/30 hover:text-primary',
                  )}
                >
                  <SlidersHorizontal size={14} />
                  {activeFilterCount > 0 && (
                    <span className="bg-primary text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                <button
                  type="submit"
                  disabled={searchMutation.isPending}
                  className="btn-primary"
                >
                  {searchMutation.isPending
                    ? <><RefreshCw size={14} className="animate-spin" /> Searching...</>
                    : <><Search size={14} /> Search</>}
                </button>
              </div>
            </form>

            {/* Extension scrape status */}
            {extensionStatus && (
              <div className="mt-3 flex items-center gap-2 text-xs text-primary">
                <RefreshCw size={12} className="animate-spin flex-shrink-0" />
                {extensionStatus}
              </div>
            )}

            {/* Filter panel */}
            {showFilters && (
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">

                {/* Row 1: Platform + Proposals + Rating */}
                <div className="flex flex-wrap gap-4">
                  <div>
                    <label className="label text-[11px]">Platform</label>
                    <select
                      value={filters.platform}
                      onChange={e => setFilters(f => ({ ...f, platform: e.target.value }))}
                      className="input w-36 text-xs"
                    >
                      <option value="all">All</option>
                      <option value="upwork">Upwork</option>
                      <option value="freelancer">Freelancer</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-[11px]">Max Proposals</label>
                    <select
                      value={filters.maxProposals}
                      onChange={e => setFilters(f => ({ ...f, maxProposals: e.target.value }))}
                      className="input w-32 text-xs"
                    >
                      <option value="any">Any</option>
                      <option value="5">≤ 5</option>
                      <option value="10">≤ 10</option>
                      <option value="20">≤ 20</option>
                      <option value="50">≤ 50</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-[11px]">Min Proposals</label>
                    <input
                      type="number" min="0"
                      value={filters.minProposals}
                      onChange={e => setFilters(f => ({ ...f, minProposals: e.target.value }))}
                      className="input w-28 text-xs"
                      placeholder="Any"
                    />
                  </div>
                  <div>
                    <label className="label text-[11px]">Min Client Rating</label>
                    <select
                      value={filters.minClientRating}
                      onChange={e => setFilters(f => ({ ...f, minClientRating: e.target.value }))}
                      className="input w-36 text-xs"
                    >
                      <option value="">Any</option>
                      <option value="3">3+ stars</option>
                      <option value="4">4+ stars</option>
                      <option value="4.5">4.5+ stars</option>
                      <option value="4.8">4.8+ stars</option>
                    </select>
                  </div>
                </div>

                {/* Row 2: Budget range */}
                <div className="flex flex-wrap gap-4">
                  <div>
                    <label className="label text-[11px]">Min Budget ($)</label>
                    <input
                      type="number" min="0"
                      value={filters.minBudget}
                      onChange={e => setFilters(f => ({ ...f, minBudget: e.target.value }))}
                      className="input w-32 text-xs"
                      placeholder="Any"
                    />
                  </div>
                  <div>
                    <label className="label text-[11px]">Max Budget ($)</label>
                    <input
                      type="number" min="0"
                      value={filters.maxBudget}
                      onChange={e => setFilters(f => ({ ...f, maxBudget: e.target.value }))}
                      className="input w-32 text-xs"
                      placeholder="Any"
                    />
                  </div>
                </div>

                {/* Row 3: Include / Exclude keywords */}
                <div className="flex flex-wrap gap-4">
                  <div className="flex-1 min-w-48">
                    <label className="label text-[11px]">Include Keywords <span className="text-slate-400">(comma-separated)</span></label>
                    <input
                      value={filters.includeKeywords}
                      onChange={e => setFilters(f => ({ ...f, includeKeywords: e.target.value }))}
                      className="input text-xs"
                      placeholder="e.g. React, TypeScript"
                    />
                  </div>
                  <div className="flex-1 min-w-48">
                    <label className="label text-[11px]">Exclude Keywords <span className="text-slate-400">(comma-separated)</span></label>
                    <input
                      value={filters.excludeKeywords}
                      onChange={e => setFilters(f => ({ ...f, excludeKeywords: e.target.value }))}
                      className="input text-xs"
                      placeholder="e.g. WordPress, Wix"
                    />
                  </div>
                </div>

                {/* Row 4: Client verification */}
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
                          checked={filters[key]}
                          onChange={e => setFilters(f => ({ ...f, [key]: e.target.checked }))}
                          className="rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        <span className="text-xs text-slate-600">{label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">Verification flags are sent to the scraper — availability depends on platform data.</p>
                </div>

                {/* Clear all */}
                {activeFilterCount > 0 && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setFilters(DEFAULT_FILTERS)}
                      className="text-xs text-slate-400 hover:text-danger flex items-center gap-1"
                    >
                      <X size={11} /> Clear all filters
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sort / refresh bar */}
          {allResults.length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <p className="text-sm text-slate-500 mr-auto">
                <span className="font-medium text-dark">{processed.length}</span>
                {activeFilterCount > 0 && ` of ${allResults.length}`} projects
                {resultSource === 'extension' && (
                  <span className="ml-1.5 text-[11px] text-primary font-medium">via extension</span>
                )}
                {(upworkCount > 0 || freelancerCount > 0) && (
                  <span className="ml-1.5 text-slate-400 text-xs">
                    ({[
                      freelancerCount > 0 && `Freelancer: ${freelancerCount}`,
                      upworkCount > 0     && `Upwork: ${upworkCount}`,
                    ].filter(Boolean).join(' · ')})
                  </span>
                )}
                {biddedIds.size > 0 && <span className="ml-1 text-slate-400 text-xs">· {biddedIds.size} hidden</span>}
              </p>

              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing || !lastSearch}
                className="btn-secondary text-xs px-3 flex items-center gap-1"
                title="Fetch new projects"
              >
                <RotateCcw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                Refresh
              </button>

              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                className="input w-44 text-xs"
              >
                <option value="default">Sort: Default</option>
                <option value="budget_desc">Budget: High → Low</option>
                <option value="budget_asc">Budget: Low → High</option>
                <option value="proposals_asc">Fewest Proposals</option>
                <option value="proposals_desc">Most Proposals</option>
              </select>
            </div>
          )}

          {/* Platform block warnings — only shown when connection is NOT active */}
          {Object.values(platformOutcomes).some(o => o.status === 'platform_blocked') && (
            <div className="space-y-2 mb-4">
              {platformOutcomes.upwork?.status === 'platform_blocked' && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                  <AlertCircle size={12} className="flex-shrink-0 text-amber-500" />
                  <span>
                    {platformOutcomes.upwork.error_code === 'UPWORK_NOT_CONNECTED' && !upworkConnected && (
                      <>Connect your Upwork account in <a href="/profile" className="underline font-medium text-amber-800">Profile</a> for search results.</>
                    )}
                    {platformOutcomes.upwork.error_code === 'UPWORK_NOT_CONNECTED' && upworkConnected && (
                      <>Upwork account is connected — using extension results. If projects don&apos;t appear, click Scrape in the extension.</>
                    )}
                    {platformOutcomes.upwork.error_code === 'UPWORK_COOKIES_EXPIRED' && !upworkConnected && (
                      <>Your Upwork session has expired. <a href="/profile" className="underline font-medium text-amber-800">Reconnect your account</a> to resume.</>
                    )}
                    {platformOutcomes.upwork.error_code === 'UPWORK_COOKIES_EXPIRED' && upworkConnected && (
                      <>Upwork search temporarily unavailable. Your account is connected — try again in a minute or click Scrape in the extension.</>
                    )}
                    {platformOutcomes.upwork.error_code === 'UPWORK_RATE_LIMIT' && (
                      <>Upwork rate limit hit. Wait a minute then try again.</>
                    )}
                    {(!platformOutcomes.upwork.error_code || platformOutcomes.upwork.error_code === 'UPWORK_CLOUDFLARE_BLOCK') && (
                      <>Upwork is temporarily blocking requests. Try again in a few minutes{!upworkConnected && <>, or <a href="/profile" className="underline font-medium text-amber-800">connect your account</a> for better results</>}.</>
                    )}
                  </span>
                </div>
              )}
              {platformOutcomes.freelancer?.status === 'platform_blocked' && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                  <AlertCircle size={12} className="flex-shrink-0 text-amber-500" />
                  <span>
                    {freelancerConnected
                      ? <>Freelancer search temporarily unavailable. Your account is connected — try again in a minute.</>
                      : <>Freelancer API temporarily unavailable.{platformOutcomes.freelancer.message && <> {platformOutcomes.freelancer.message}</>}</>}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Error state — scraper is down */}
          {searchMutation.isError && allResults.length === 0 && !extensionInstalled && (
            <div className="card p-5 text-center text-danger mb-4">
              <AlertCircle size={24} className="mx-auto mb-2" />
              <p className="text-sm font-medium">Scraper service is offline</p>
              <p className="text-xs text-slate-500 mt-1">
                Start it with:{' '}
                <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">cd apps/scraper &amp;&amp; python api.py</code>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Or install the <span className="font-medium text-primary">Freelancer OS Chrome Extension</span> to scrape directly from your browser.
              </p>
            </div>
          )}

          {/* Results */}
          {visible.length > 0 && (
            <div className="space-y-3">
              {visible.map(project => {
                const analysis    = analysisMap[project.id];
                const isAnalyzing = analyzingId === project.id;
                const isSaved     = savedProjects.some(p => p.id === project.id);

                return (
                  <div key={project.id} className="card p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-dark text-sm">{project.title}</h3>
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
                          {project.proposalsCount !== null && project.proposalsCount !== undefined && (
                            <span className="flex items-center gap-1">
                              <Users size={11} />{project.proposalsCount} proposals
                            </span>
                          )}
                          {project.clientRating !== null && project.clientRating !== undefined && (
                            <span className="flex items-center gap-1 text-amber-500">
                              ★ {project.clientRating.toFixed(1)}
                            </span>
                          )}
                          {project.postedAt && (
                            <span className="flex items-center gap-1">
                              <Clock size={11} />{project.postedAt}
                            </span>
                          )}
                        </div>

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

                        {analysis && (
                          <div className="mt-3 bg-primary/5 border border-primary/15 rounded-lg p-3 text-xs">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="flex items-center gap-1 font-medium text-primary">
                                <Brain size={11} /> AI Analysis
                              </span>
                              <span className={clsx(
                                'font-semibold',
                                analysis.techFitScore >= 70 ? 'text-success' : analysis.techFitScore >= 40 ? 'text-warning' : 'text-danger',
                              )}>
                                Fit: {analysis.techFitScore}/100
                              </span>
                              <span className="text-slate-600">Bid: ${analysis.bidRange.min}–${analysis.bidRange.max}</span>
                              <span className="badge badge-gray capitalize">{analysis.effortLevel} effort</span>
                            </div>
                            <p className="text-slate-600 mt-1.5">{analysis.winningAngle}</p>
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
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
                          onClick={() => goToAIAnalyze(project)}
                          className="btn-primary text-xs px-2.5 py-1.5 flex items-center gap-1 justify-center"
                        >
                          <Brain size={11} /> Analyze
                        </button>

                        <button
                          onClick={() => analyzeProject(project)}
                          disabled={isAnalyzing || !!analysis}
                          className={clsx(
                            'text-xs px-2.5 py-1.5 rounded border flex items-center gap-1 justify-center transition-colors',
                            analysis
                              ? 'bg-success/10 text-success border-success/20 cursor-default'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-primary/40 hover:text-primary',
                          )}
                        >
                          {isAnalyzing
                            ? <RefreshCw size={11} className="animate-spin" />
                            : analysis
                              ? <><CheckCircle2 size={11} /> Done</>
                              : <><RefreshCw size={11} /> Quick</>}
                        </button>

                        <button
                          onClick={() => isSaved ? unsaveProject(project.id) : saveProject(project)}
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

                        <button
                          onClick={() => markBidded(project)}
                          className="text-xs px-2.5 py-1.5 rounded border bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 flex items-center gap-1 justify-center transition-colors"
                        >
                          <CheckSquare size={11} /> Bid
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {processed.length > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-40"
              >
                <ChevronLeft size={13} />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - safePage) <= 2)
                .reduce<(number | '...')[]>((acc, n, idx, arr) => {
                  if (idx > 0 && (n as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                  acc.push(n);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === '...'
                    ? <span key={`ellipsis-${idx}`} className="text-xs text-slate-400 px-1">…</span>
                    : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setPage(item as number)}
                        className={clsx(
                          'text-xs w-8 h-8 rounded border transition-colors',
                          item === safePage
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-primary/40',
                        )}
                      >
                        {item}
                      </button>
                    ),
                )}

              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-40"
              >
                <ChevronRight size={13} />
              </button>

              <span className="text-xs text-slate-400 ml-1">
                Page {safePage} of {totalPages}
              </span>
            </div>
          )}

          {/* Empty state */}
          {!searchMutation.isPending && allResults.length === 0 && (
            <div className="card p-12 text-center text-slate-400">
              <Search size={32} className="mx-auto mb-3 text-slate-200" />
              {searchMutation.isError || (searchMutation.isSuccess && allResults.length === 0) ? (
                <>
                  <p className="text-sm font-medium">No projects found</p>
                  <p className="text-xs text-slate-400 mt-2">
                    {extensionInstalled
                      ? 'Open extension and click Scrape Now.'
                      : 'Try different keywords or connect your accounts in Profile.'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Search for projects to see results here</p>
                  {(!connectionStatus?.upwork || !connectionStatus?.freelancer) && (
                    <p className="text-xs text-slate-400 mt-2">
                      Connect your accounts in{' '}
                      <a href="/profile" className="text-primary underline">Profile</a>{' '}
                      for authenticated search results.
                    </p>
                  )}
                  {!extensionInstalled && (
                    <p className="text-xs text-slate-400 mt-2">
                      Install the{' '}
                      <span className="font-medium text-primary">Freelancer OS Chrome Extension</span>{' '}
                      to scrape projects directly from your browser.{' '}
                      <a href="/settings" className="text-primary underline">Get token in Settings</a>
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* No results after filter */}
          {!searchMutation.isPending && allResults.length > 0 && processed.length === 0 && (
            <div className="card p-8 text-center text-slate-400">
              <SlidersHorizontal size={24} className="mx-auto mb-2 text-slate-200" />
              <p className="text-sm">No projects match the current filters.</p>
              <button
                type="button"
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="mt-3 text-xs text-primary underline"
              >
                Clear filters
              </button>
            </div>
          )}

          {/* Bidded projects info */}
          {biddedIds.size > 0 && (
            <div className="mt-4 flex items-center justify-between text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5">
              <span>{biddedIds.size} project{biddedIds.size !== 1 ? 's' : ''} hidden (already bid)</span>
              <button
                onClick={() => setBiddedIds(new Set())}
                className="text-primary hover:underline flex items-center gap-1"
              >
                <RotateCcw size={10} /> Reset
              </button>
            </div>
          )}

        </div>
      </div>

      {/* ── Saved Projects Panel (right) ──────────────────────────────────── */}
      {showSavedPanel && (
        <div className="w-64 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col h-full">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-dark flex items-center gap-1.5">
              <BookmarkCheck size={14} className="text-primary" />
              Saved ({savedProjects.length})
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
                  <div key={p.id} className="p-3 hover:bg-slate-50 group">
                    <p className="text-xs font-medium text-dark line-clamp-2 leading-tight mb-1">{p.title}</p>
                    <p className="text-[10px] text-slate-400 mb-2">{p.budget} · {p.platform}</p>
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
                        onClick={() => navigate('/ai-analyze', { state: { project: p } })}
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
