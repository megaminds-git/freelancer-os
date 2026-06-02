import { Router, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /api/v1/records — proposal history with expiry info
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, platform, page = '1', limit = '20' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: Record<string, unknown> = { userId: req.userId, isReference: false };
    if (status) where.status = status;
    if (platform) where.platform = platform;

    const [proposals, total] = await Promise.all([
      prisma.proposal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.proposal.count({ where }),
    ]);

    res.json({ records: proposals, total, page: Number(page) });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/records/stats
router.get('/stats', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const proposals = await prisma.proposal.findMany({
      where: { userId: req.userId, isReference: false },
      select: { status: true, platform: true, bidAmount: true, techStack: true, clientCountry: true },
    });

    const total = proposals.length;
    const won = proposals.filter(p => p.status === 'won').length;
    const lost = proposals.filter(p => p.status === 'lost').length;
    const pending = proposals.filter(p => p.status === 'pending').length;
    const noResponse = proposals.filter(p => p.status === 'no_response').length;

    // Win rate by platform
    const platformMap: Record<string, { total: number; won: number }> = {};
    proposals.forEach(p => {
      if (!platformMap[p.platform]) platformMap[p.platform] = { total: 0, won: 0 };
      platformMap[p.platform].total++;
      if (p.status === 'won') platformMap[p.platform].won++;
    });

    const byPlatform = Object.entries(platformMap).map(([platform, data]) => ({
      platform,
      total: data.total,
      won: data.won,
      winRate: Math.round((data.won / data.total) * 100),
    }));

    // Win rate by country
    const countryMap: Record<string, { total: number; won: number }> = {};
    proposals.forEach(p => {
      const c = p.clientCountry || 'Unknown';
      if (!countryMap[c]) countryMap[c] = { total: 0, won: 0 };
      countryMap[c].total++;
      if (p.status === 'won') countryMap[c].won++;
    });

    const byCountry = Object.entries(countryMap)
      .map(([country, data]) => ({
        country,
        total: data.total,
        won: data.won,
        winRate: Math.round((data.won / data.total) * 100),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    res.json({
      total,
      won,
      lost,
      pending,
      noResponse,
      winRate: total > 0 ? Math.round((won / total) * 100) : 0,
      byPlatform,
      byCountry,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/records/export/csv
router.get('/export/csv', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const proposals = await prisma.proposal.findMany({
      where: { userId: req.userId, isReference: false },
      orderBy: { createdAt: 'desc' },
    });

    const header = 'Title,Platform,Status,BidAmount,Currency,ClientCountry,TechStack,CreatedAt,ExpiresAt\n';
    const rows = proposals.map(p =>
      `"${p.projectTitle}","${p.platform}","${p.status}","${p.bidAmount}","${p.currency}","${p.clientCountry}","${p.techStack.join(';')}","${p.createdAt.toISOString()}","${p.expiresAt.toISOString()}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="records.csv"');
    res.send(header + rows);
  } catch (err) {
    next(err);
  }
});

export default router;
