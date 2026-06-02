import { Router, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AlertConfigSchema, COUNTRIES_TIMEZONES } from '@freelancer-os/shared';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
router.use(authenticate);

// GET /api/v1/alerts/config
router.get('/config', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const config = await prisma.alertConfig.findUnique({ where: { userId: req.userId } });
    res.json(config || null);
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/alerts/config
router.put('/config', validate(AlertConfigSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const config = await prisma.alertConfig.upsert({
      where: { userId: req.userId! },
      update: req.body,
      create: { userId: req.userId!, ...req.body },
    });
    res.json(config);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/alerts/timezones
router.get('/timezones', (_req, res) => {
  const timezones = Object.entries(COUNTRIES_TIMEZONES).map(([country, tz]) => ({
    country,
    timezone: tz,
  }));
  res.json(timezones);
});

// GET /api/v1/alerts/schedule
router.get('/schedule', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const config = await prisma.alertConfig.findUnique({ where: { userId: req.userId } });
    if (!config) {
      res.json({ schedule: [] });
      return;
    }

    const schedule = config.countries.map((country) => {
      const tz = COUNTRIES_TIMEZONES[country] || 'UTC';
      const now = new Date();
      const countryTime = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      }).format(now);
      return {
        country,
        timezone: tz,
        currentTime: countryTime,
        alertTime: '08:45',
        nextAlert: 'Tomorrow at 08:45',
      };
    });

    res.json({ schedule, enabled: config.enabled });
  } catch (err) {
    next(err);
  }
});

export default router;
