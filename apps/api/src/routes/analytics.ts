import { Router, Response, NextFunction } from 'express';
import axios from 'axios';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /api/v1/analytics/dashboard
router.get('/dashboard', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalProposals, wonProposals, weeklyProposals, avgBid, alertConfig, recentProposals] = await Promise.all([
      prisma.proposal.count({ where: { userId: req.userId, isReference: false } }),
      prisma.proposal.count({ where: { userId: req.userId, status: 'won' } }),
      prisma.proposal.count({ where: { userId: req.userId, isReference: false, createdAt: { gte: weekAgo } } }),
      prisma.proposal.aggregate({ where: { userId: req.userId }, _avg: { bidAmount: true } }),
      prisma.alertConfig.findUnique({ where: { userId: req.userId } }),
      prisma.proposal.findMany({
        where: { userId: req.userId, isReference: false },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, projectTitle: true, status: true, bidAmount: true, platform: true, createdAt: true },
      }),
    ]);

    res.json({
      totalProposals,
      wonProposals,
      winRate: totalProposals > 0 ? Math.round((wonProposals / totalProposals) * 100) : 0,
      avgBidAmount: Math.round(avgBid._avg.bidAmount || 0),
      proposalsThisWeek: weeklyProposals,
      activeAlerts: alertConfig?.countries?.length || 0,
      recentProposals,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/analytics/timeline
router.get('/timeline', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const days = Number(req.query.days) || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const proposals = await prisma.proposal.findMany({
      where: { userId: req.userId, isReference: false, createdAt: { gte: startDate } },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by day
    const byDay: Record<string, { total: number; won: number }> = {};
    proposals.forEach(p => {
      const day = p.createdAt.toISOString().split('T')[0];
      if (!byDay[day]) byDay[day] = { total: 0, won: 0 };
      byDay[day].total++;
      if (p.status === 'won') byDay[day].won++;
    });

    const timeline = Object.entries(byDay).map(([date, data]) => ({
      date,
      proposals: data.total,
      won: data.won,
    }));

    res.json(timeline);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/analytics/heatmap
router.get('/heatmap', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const proposals = await prisma.proposal.findMany({
      where: { userId: req.userId, isReference: false },
      select: { createdAt: true, status: true },
    });

    // Heatmap: [hour][dayOfWeek] = count
    const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    const winmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));

    proposals.forEach(p => {
      const day = p.createdAt.getUTCDay();
      const hour = p.createdAt.getUTCHours();
      heatmap[day][hour]++;
      if (p.status === 'won') winmap[day][hour]++;
    });

    res.json({ heatmap, winmap });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/analytics/activity-calendar?month=YYYY-MM
router.get('/activity-calendar', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const queryMonth = typeof req.query.month === 'string' ? req.query.month : '';
    const isValidMonth = /^\d{4}-\d{2}$/.test(queryMonth);

    const monthStart = isValidMonth
      ? new Date(`${queryMonth}-01T00:00:00.000Z`)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));

    const proposals = await prisma.proposal.findMany({
      where: {
        userId: req.userId,
        isReference: false,
        createdAt: {
          gte: monthStart,
          lt: monthEnd,
        },
      },
      select: {
        createdAt: true,
        platform: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const byDay: Record<string, { count: number; platforms: Set<string> }> = {};
    for (const p of proposals) {
      const dateKey = p.createdAt.toISOString().split('T')[0];
      if (!byDay[dateKey]) byDay[dateKey] = { count: 0, platforms: new Set<string>() };
      byDay[dateKey].count += 1;
      byDay[dateKey].platforms.add(p.platform);
    }

    const days = Object.entries(byDay).map(([date, value]) => ({
      date,
      proposals: value.count,
      platforms: Array.from(value.platforms),
    }));

    res.json({
      month: monthStart.toISOString().slice(0, 7),
      days,
    });
  } catch (err) {
    next(err);
  }
});

type FeedItem = {
  title: string;
  snippet: string;
  source: string;
  url: string;
  publishedAt: string;
};

// GET /api/v1/analytics/live-feed
router.get('/live-feed', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const timeout = 7000;

    const [hnAi, hnTech, devtoAi] = await Promise.allSettled([
      axios.get('https://hn.algolia.com/api/v1/search_by_date?query=ai&tags=story&hitsPerPage=8', { timeout }),
      axios.get('https://hn.algolia.com/api/v1/search_by_date?query=technology&tags=story&hitsPerPage=8', { timeout }),
      axios.get('https://dev.to/api/articles?tag=ai&per_page=8', { timeout }),
    ]);

    const hnItems: FeedItem[] = [hnAi, hnTech]
      .filter((r): r is PromiseFulfilledResult<{ data: { hits?: Array<Record<string, unknown>> } }> => r.status === 'fulfilled')
      .flatMap((r) => r.value.data.hits ?? [])
      .map((hit) => {
        const title = typeof hit.title === 'string' ? hit.title : 'Untitled story';
        const storyUrl = typeof hit.url === 'string' ? hit.url : '';
        const snippetSource = typeof hit.story_text === 'string' ? hit.story_text : title;
        const snippet = snippetSource.replace(/\s+/g, ' ').trim().slice(0, 180);
        const publishedAt = typeof hit.created_at === 'string' ? hit.created_at : new Date().toISOString();

        return {
          title,
          snippet,
          source: 'Hacker News',
          url: storyUrl,
          publishedAt,
        };
      })
      .filter((item) => item.url.startsWith('http'));

    const devtoItems: FeedItem[] = devtoAi.status === 'fulfilled'
      ? (Array.isArray(devtoAi.value.data) ? devtoAi.value.data : []).map((article: Record<string, unknown>) => {
        const title = typeof article.title === 'string' ? article.title : 'Untitled article';
        const description = typeof article.description === 'string' ? article.description : title;
        const snippet = description.replace(/\s+/g, ' ').trim().slice(0, 180);
        const publishedAt = typeof article.published_at === 'string' ? article.published_at : new Date().toISOString();
        const url = typeof article.url === 'string' ? article.url : '';

        return {
          title,
          snippet,
          source: 'Dev.to',
          url,
          publishedAt,
        };
      }).filter((item) => item.url.startsWith('http'))
      : [];

    const deduped = new Map<string, FeedItem>();
    for (const item of [...hnItems, ...devtoItems]) {
      if (!deduped.has(item.url)) deduped.set(item.url, item);
    }

    const items = Array.from(deduped.values())
      .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))
      .slice(0, 12);

    res.json({
      updatedAt: new Date().toISOString(),
      items,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
