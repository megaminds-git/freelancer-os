import { Router, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { TemplateComponentSchema, ProposalTemplateSchema } from '@freelancer-os/shared';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// ── Template Components ───────────────────────────────────────────────────────
router.get('/components', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { type } = req.query;
    const components = await prisma.templateComponent.findMany({
      where: { userId: req.userId, ...(type ? { type: String(type) } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    res.json(components);
  } catch (err) {
    next(err);
  }
});

router.post('/components', validate(TemplateComponentSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const component = await prisma.templateComponent.create({
      data: { ...req.body, userId: req.userId! },
    });
    res.status(201).json(component);
  } catch (err) {
    next(err);
  }
});

router.put('/components/:id', validate(TemplateComponentSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const component = await prisma.templateComponent.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!component) throw createError('Component not found', 404);

    const updated = await prisma.templateComponent.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/components/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const component = await prisma.templateComponent.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!component) throw createError('Component not found', 404);

    await prisma.templateComponent.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
});

// ── Proposal Templates ────────────────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const templates = await prisma.proposalTemplate.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(templates);
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(ProposalTemplateSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const template = await prisma.proposalTemplate.create({
      data: { ...req.body, userId: req.userId! },
    });
    res.status(201).json(template);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', validate(ProposalTemplateSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const template = await prisma.proposalTemplate.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!template) throw createError('Template not found', 404);

    const updated = await prisma.proposalTemplate.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const template = await prisma.proposalTemplate.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!template) throw createError('Template not found', 404);

    await prisma.proposalTemplate.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
