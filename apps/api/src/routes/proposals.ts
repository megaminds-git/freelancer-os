import { Router, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { ProposalSchema, ProposalStatusSchema } from '@freelancer-os/shared';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

function expiresAt(): Date {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

// GET /api/v1/proposals
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, platform, page = '1', limit = '20' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: Record<string, unknown> = {
      userId: req.userId,
      isReference: false,
      expiresAt: { gte: new Date() },
    };
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

    res.json({ proposals, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/proposals/references
router.get('/references', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const refs = await prisma.proposal.findMany({
      where: { userId: req.userId, isReference: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(refs);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/proposals
router.post('/', validate(ProposalSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const proposal = await prisma.proposal.create({
      data: { ...req.body, userId: req.userId!, expiresAt: expiresAt() },
    });

    await prisma.analyticsEvent.create({
      data: {
        userId: req.userId!,
        eventType: 'proposal_created',
        metadata: { proposalId: proposal.id, platform: proposal.platform },
      },
    });

    res.status(201).json(proposal);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/proposals/:id
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const proposal = await prisma.proposal.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: { files: true },
    });
    if (!proposal) throw createError('Proposal not found', 404);
    res.json(proposal);
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/proposals/:id/status
router.put('/:id/status', validate(ProposalStatusSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const proposal = await prisma.proposal.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!proposal) throw createError('Proposal not found', 404);

    const updated = await prisma.proposal.update({
      where: { id: req.params.id },
      data: { status: req.body.status },
    });

    await prisma.analyticsEvent.create({
      data: {
        userId: req.userId!,
        eventType: 'proposal_status_updated',
        metadata: { proposalId: proposal.id, status: req.body.status },
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/proposals/:id/save-reference
router.post('/:id/save-reference', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const proposal = await prisma.proposal.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!proposal) throw createError('Proposal not found', 404);

    // Create a permanent reference copy
    const reference = await prisma.proposal.create({
      data: {
        ...proposal,
        id: undefined,
        isReference: true,
        expiresAt: new Date('2099-01-01'),
      } as Parameters<typeof prisma.proposal.create>[0]['data'],
    });

    res.json(reference);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/proposals/:id
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const proposal = await prisma.proposal.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!proposal) throw createError('Proposal not found', 404);

    await prisma.proposal.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/proposals/export/csv
router.get('/export/csv', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const proposals = await prisma.proposal.findMany({
      where: { userId: req.userId, isReference: false, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    const header = 'Title,Platform,Status,BidAmount,Currency,ClientCountry,CreatedAt\n';
    const rows = proposals.map(p =>
      `"${p.projectTitle}","${p.platform}","${p.status}","${p.bidAmount}","${p.currency}","${p.clientCountry}","${p.createdAt.toISOString()}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="proposals.csv"');
    res.send(header + rows);
  } catch (err) {
    next(err);
  }
});

export default router;
