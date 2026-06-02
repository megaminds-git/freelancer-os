import { Router, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { z } from 'zod';
import { validate } from '../middleware/validate';

const router = Router();
router.use(authenticate);

const TokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['web', 'android', 'ios']).default('web'),
});

// POST /api/v1/notifications/token — register an FCM device token
router.post('/token', validate(TokenSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Upsert so duplicate tokens are idempotent
    await prisma.$executeRaw`
      INSERT INTO fcm_tokens (id, user_id, token, platform, created_at)
      VALUES (gen_random_uuid(), ${req.userId}, ${req.body.token}, ${req.body.platform}, NOW())
      ON CONFLICT (token) DO UPDATE SET user_id = ${req.userId}, platform = ${req.body.platform}
    `.catch(async () => {
      // Table may not exist yet — create it dynamically
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS fcm_tokens (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token TEXT UNIQUE NOT NULL,
          platform TEXT NOT NULL DEFAULT 'web',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;
      await prisma.$executeRaw`
        INSERT INTO fcm_tokens (id, user_id, token, platform, created_at)
        VALUES (gen_random_uuid()::text, ${req.userId}, ${req.body.token}, ${req.body.platform}, NOW())
        ON CONFLICT (token) DO UPDATE SET user_id = ${req.userId}
      `;
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/notifications/token — remove an FCM token on logout
router.delete('/token', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    if (token) {
      await prisma.$executeRaw`
        DELETE FROM fcm_tokens WHERE user_id = ${req.userId} AND token = ${token}
      `.catch(() => null);
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
