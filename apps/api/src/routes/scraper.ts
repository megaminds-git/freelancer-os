import { Router, Response, NextFunction } from 'express';
import axios from 'axios';
import { AuthRequest, authenticate } from '../middleware/auth';
import { ScraperQuerySchema } from '@freelancer-os/shared';
import { validate } from '../middleware/validate';
import { getCache, setCache, delCache } from '../lib/redis';
import prisma from '../lib/prisma';
import rateLimit from 'express-rate-limit';

const router: Router = Router();

const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:8001';

function normalizeQuery(query: string): string {
  return String(query || '').trim().toLowerCase();
}

// GET /api/v1/scraper/status
router.get('/status', async (_req, res) => {
  try {
    await axios.get(`${SCRAPER_URL}/health`, { timeout: 5000 });
    res.json({ status: 'online', url: SCRAPER_URL });
  } catch {
    res.json({ status: 'offline', url: SCRAPER_URL });
  }
});

const scraperLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many scraper requests, please slow down.' },
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
});

// POST /api/v1/scraper/search
router.post(
  '/search',
  scraperLimiter,
  authenticate,
  validate(ScraperQuerySchema),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { query, platform, limit } = req.body;
      const userId      = req.userId ?? 'anon';
      const normalizedQ = normalizeQuery(query as string);
      const plat        = String(platform || 'both').toLowerCase();
      const noCache     = req.query.noCache === '1';

      const cacheKey = `scraper:${userId}:${plat}:${normalizedQ}:${limit}`;

      if (!noCache) {
        // ── 1. Check extension results first (highest priority) ──────────────
        const extKeys = plat === 'both'
          ? [
              `ext-results:${userId}:both:${normalizedQ}`,
              `ext-results:${userId}:upwork:${normalizedQ}`,
              `ext-results:${userId}:freelancer:${normalizedQ}`,
            ]
          : [
              `ext-results:${userId}:${plat}:${normalizedQ}`,
              `ext-results:${userId}:both:${normalizedQ}`,
            ];

        const seenExtIds = new Set<string>();
        const extProjects: unknown[] = [];

        for (const key of extKeys) {
          const cached = await getCache<unknown[]>(key);
          if (cached && Array.isArray(cached)) {
            for (const p of cached) {
              const pid = (p as Record<string, unknown>).id as string | undefined;
              if (pid && seenExtIds.has(pid)) continue;
              if (pid) seenExtIds.add(pid);
              extProjects.push(p);
            }
          }
        }

        if (extProjects.length > 0) {
          console.log(`[search] Found ${extProjects.length} extension results in Redis for query '${normalizedQ}'`);
          res.json({
            projects:         extProjects,
            platformOutcomes: {},
            cached:           true,
            source:           'extension',
            total:            extProjects.length,
          });
          return;
        }

        // ── 2. Check regular cache ───────────────────────────────────────────
        const cachedResult = await getCache(cacheKey);
        if (cachedResult) {
          res.json({ projects: cachedResult, cached: true, platformOutcomes: {}, source: 'cache' });
          return;
        }
      } else {
        // noCache: delete existing scraper cache so fresh result replaces it
        await delCache(cacheKey).catch(() => {});
      }

      // ── 3. Call Python scraper ─────────────────────────────────────────────
      let response;
      try {
        response = await axios.post(
          `${SCRAPER_URL}/scrape`,
          { query, platform, limit, user_id: req.userId ?? null },
          { timeout: 60000 },
        );
      } catch (scraperErr: unknown) {
        const isConnectionError =
          axios.isAxiosError(scraperErr) &&
          (scraperErr.code === 'ECONNREFUSED' ||
            scraperErr.code === 'ENOTFOUND' ||
            scraperErr.code === 'ETIMEDOUT' ||
            !scraperErr.response);

        if (isConnectionError) {
          res.status(503).json({
            error: 'Scraper service is offline. Make sure the Python scraper is running on port 8001.',
            hint: 'Run: cd apps/scraper && python api.py',
            scraperOffline: true,
            projects: [],
            platformOutcomes: {},
          });
        } else {
          const data = axios.isAxiosError(scraperErr) ? scraperErr.response?.data : {};
          res.status(200).json({
            projects: [],
            platformOutcomes: {},
            scraperError: true,
            error: data?.error ?? String(scraperErr),
          });
        }
        return;
      }

      const projects         = response.data.projects ?? [];
      const platformOutcomes = response.data.platformOutcomes ?? {};

      const anySuccess = Object.values(platformOutcomes as Record<string, { status: string }>)
        .some(o => o.status === 'success');
      if (anySuccess || projects.length > 0) {
        await setCache(cacheKey, projects, 120);
      }

      res.json({
        projects,
        platformOutcomes,
        cached: false,
        source: 'scraper',
        total: response.data.total ?? projects.length,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/scraper/save
router.post('/save', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { title, description, budget, skills, clientCountry, url, platform } = req.body;

    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    if (url) {
      const existing = await prisma.projectRecord.findFirst({
        where: { userId: req.userId!, url },
      });
      if (existing) {
        res.json({ saved: false, duplicate: true, record: existing });
        return;
      }
    }

    const record = await prisma.projectRecord.create({
      data: {
        userId:        req.userId!,
        title:         String(title || '').trim() || 'Untitled Project',
        description:   String(description || ''),
        clientCountry: String(clientCountry || 'Unknown'),
        techStack:     Array.isArray(skills) ? skills : [],
        platform:      String(platform || 'upwork'),
        url:           url ? String(url) : null,
        bidAmount:     0,
      },
    });

    res.json({ saved: true, duplicate: false, record });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/scraper/saved
router.get('/saved', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const records = await prisma.projectRecord.findMany({
      where:   { userId: req.userId! },
      orderBy: { scrapedAt: 'desc' },
      take:    200,
    });
    res.json({ records });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/scraper/saved/:id
router.delete('/saved/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await prisma.projectRecord.deleteMany({ where: { id, userId: req.userId! } });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// ── Extension results ─────────────────────────────────────────────────────────

// POST /api/v1/scraper/extension-results
router.post('/extension-results', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { platform, query, projects } = req.body as {
      platform?: string;
      query?: string;
      projects?: unknown[];
    };

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'query is required' });
      return;
    }
    if (!Array.isArray(projects)) {
      res.status(400).json({ error: 'projects must be an array' });
      return;
    }

    const userId      = req.userId!;
    const normalizedQ = normalizeQuery(query);
    const plat        = String(platform || 'both').toLowerCase();
    const cacheKey    = `ext-results:${userId}:${plat}:${normalizedQ}`;

    // Extension already applies 24-hour freshness via _postedMs before sending.
    // Store all received projects; do not re-filter by date string (date-only strings
    // from Freelancer parse to midnight and falsely fail the freshness check).
    await setCache(cacheKey, projects, 86400); // 24-hour TTL (was 600s — too short)
    console.log(`[extension-results] Stored ${projects.length} project(s) for user ${userId}, query='${normalizedQ}', platform='${plat}'`);

    res.json({ success: true, received: projects.length, fresh: projects.length, platform: plat, query: normalizedQ });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/scraper/extension-results
router.get('/extension-results', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { query, platform } = req.query as { query?: string; platform?: string };

    if (!query) {
      res.json({ projects: [], cached: false });
      return;
    }

    const userId      = req.userId!;
    const normalizedQ = normalizeQuery(query as string);
    const plat        = String(platform || 'both').toLowerCase();

    const keys = plat === 'both'
      ? [
          `ext-results:${userId}:both:${normalizedQ}`,
          `ext-results:${userId}:upwork:${normalizedQ}`,
          `ext-results:${userId}:freelancer:${normalizedQ}`,
        ]
      : [
          `ext-results:${userId}:${plat}:${normalizedQ}`,
          `ext-results:${userId}:both:${normalizedQ}`,
        ];

    const seenIds = new Set<string>();
    const merged: unknown[] = [];

    for (const key of keys) {
      const cached = await getCache<unknown[]>(key);
      if (cached && Array.isArray(cached)) {
        for (const p of cached) {
          const pid = (p as Record<string, unknown>).id as string | undefined;
          if (pid && seenIds.has(pid)) continue;
          if (pid) seenIds.add(pid);
          merged.push(p);
        }
      }
    }

    res.json({ projects: merged, cached: merged.length > 0, source: 'extension' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/scraper/extension-results — bust cache for a query (used by Refresh)
router.delete('/extension-results', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { query, platform } = req.query as { query?: string; platform?: string };

    if (!query) {
      res.status(400).json({ error: 'query is required' });
      return;
    }

    const userId      = req.userId!;
    const normalizedQ = normalizeQuery(query as string);
    const plat        = String(platform || 'both').toLowerCase();

    const keysToDelete = plat === 'both'
      ? [
          `ext-results:${userId}:both:${normalizedQ}`,
          `ext-results:${userId}:upwork:${normalizedQ}`,
          `ext-results:${userId}:freelancer:${normalizedQ}`,
          `scraper:${userId}:both:${normalizedQ}:50`,
          `scraper:${userId}:both:${normalizedQ}:100`,
        ]
      : [
          `ext-results:${userId}:${plat}:${normalizedQ}`,
          `ext-results:${userId}:both:${normalizedQ}`,
          `scraper:${userId}:${plat}:${normalizedQ}:50`,
          `scraper:${userId}:${plat}:${normalizedQ}:100`,
        ];

    await Promise.allSettled(keysToDelete.map(k => delCache(k)));

    res.json({ success: true, cleared: keysToDelete.length });
  } catch (err) {
    next(err);
  }
});

// Returns true when a postedAt string represents a project from the last 24 hours.
// Accepts both RFC 2822 (Upwork RSS) and "Jan 15, 2025" (Freelancer) formats.
// Unknown / unparseable dates are treated as fresh so they are not silently dropped.
function is24hFresh(postedAt: unknown): boolean {
  if (!postedAt || typeof postedAt !== 'string') return true;
  const ms = new Date(postedAt as string).getTime();
  if (isNaN(ms)) return true;
  return Date.now() - ms <= 24 * 60 * 60 * 1000;
}

// POST /api/v1/scraper/auto-results — extension auto-scrape pushes results here
// Frontend Automation page polls GET /scraper/auto-results to show activity
router.post('/auto-results', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { platform, query, projects, source } = req.body as {
      platform?: string;
      query?: string;
      projects?: unknown[];
      source?: string;
    };

    if (!Array.isArray(projects)) {
      res.status(400).json({ error: 'projects must be an array' });
      return;
    }

    const userId = req.userId!;
    const ts     = new Date().toISOString();
    const plat   = String(platform || 'both');
    const q      = String(query || '');

    // Extension already applies strict 24-hour freshness via _postedMs before sending.
    // Do NOT re-filter here — Freelancer's date-only postedAt string ("Apr 27, 2026")
    // parses to midnight UTC and falsely fails the 24-hour check for same-day projects.
    const receivedCount  = projects.length;
    const allProjects    = projects as Array<Record<string, unknown>>;

    console.log(`[auto-results] Received ${receivedCount} project(s) from extension for user ${userId}, query "${q}" on ${plat}`);

    // Store as a run log entry in Redis (list, capped at 50 entries)
    const logKey  = `auto-log:${userId}`;
    const entry   = JSON.stringify({
      ts, platform: plat, query: q,
      received: receivedCount, fresh: receivedCount, // extension pre-filtered
      source: source || 'extension',
    });
    await import('../lib/redis').then(({ redis }) => {
      return redis.lpush(logKey, entry).then(() => redis.ltrim(logKey, 0, 49)).then(() => redis.expire(logKey, 60 * 60 * 24 * 7));
    });

    // Store projects in Redis so Automation page can display them.
    // Only keep projects from the current run (this run's fresh projects), capped at 500.
    // We do NOT merge with the old cache here — each run replaces with a new deduplicated set
    // to prevent the saved count from accumulating beyond what was actually scraped.
    const projKey  = `auto-projects:${userId}`;
    const seenRunIds = new Set<string>();
    const currentRunProjects = allProjects.filter((p) => {
      const pid = String(p.id || '');
      if (!pid || seenRunIds.has(pid)) return false;
      seenRunIds.add(pid);
      return true;
    }).slice(0, 500);
    await setCache(projKey, currentRunProjects, 60 * 60 * 24); // 24-hour TTL

    // Also persist new projects to DB (ProjectRecord) — deduplicate by URL
    let dbSaved = 0;
    for (const p of currentRunProjects) {
      try {
        const url = p.url ? String(p.url) : null;
        if (url) {
          const dup = await prisma.projectRecord.findFirst({ where: { userId, url } });
          if (dup) continue;
        }
        await prisma.projectRecord.create({
          data: {
            userId,
            title:         String(p.title || '').trim() || 'Untitled',
            description:   String(p.description || '').substring(0, 2000),
            clientCountry: String(p.clientCountry || 'Unknown'),
            techStack:     Array.isArray(p.skills) ? (p.skills as string[]) : [],
            platform:      String(p.platform || 'upwork'),
            url,
            bidAmount:     0,
          },
        });
        dbSaved++;
      } catch { /* skip individual save errors */ }
    }

    if (dbSaved > 0) {
      console.log(`[auto-results] Saved ${dbSaved} new project(s) to DB for user ${userId}`);
    }

    console.log(`[auto-results] Stored ${currentRunProjects.length} project(s) for current run for user ${userId}`);
    res.json({
      success: true,
      received: receivedCount,
      fresh: receivedCount,
      stored: currentRunProjects.length,
      dbSaved,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/scraper/clear-results — clears Redis auto-projects + log for the user
router.delete('/clear-results', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { redis } = await import('../lib/redis');
    await Promise.allSettled([
      redis.del(`auto-projects:${userId}`),
      redis.del(`auto-log:${userId}`),
    ]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/scraper/auto-results — Automation page polls for extension auto-scrape results
router.get('/auto-results', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId   = req.userId!;
    const logKey   = `auto-log:${userId}`;
    const projKey  = `auto-projects:${userId}`;

    const [logEntries, projects] = await Promise.all([
      import('../lib/redis').then(({ redis }) => redis.lrange(logKey, 0, 49)),
      getCache<unknown[]>(projKey),
    ]);

    const logs = (logEntries ?? []).map(e => { try { return JSON.parse(e); } catch { return null; } }).filter(Boolean);

    res.json({
      projects: projects ?? [],
      logs,
      total: (projects ?? []).length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
