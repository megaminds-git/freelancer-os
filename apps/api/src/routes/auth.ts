import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { redis } from '../lib/redis';
import { SignupSchema, LoginSchema } from '@freelancer-os/shared';
import { validate } from '../middleware/validate';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { sendOtpEmail } from '../lib/email';
import { createOtp, verifyOtp, getCooldownTtl } from '../lib/otp';
import { z } from 'zod';

const router = Router();

async function createOtpOrThrow(email: string, purpose: 'verify' | 'reset'): Promise<string> {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw createError('OTP email is not configured on the server. Set GMAIL_USER and GMAIL_APP_PASSWORD, then restart the API.', 503);
  }

  try {
    const otp = await createOtp(email, purpose);
    if (!otp) throw createError('Please wait before requesting another code.', 429);
    return otp;
  } catch (err) {
    if ((err as Error & { status?: number }).status) throw err;
    throw createError('Verification service is temporarily unavailable. Please try again.', 503);
  }
}

async function sendOtpOrThrow(email: string, otp: string, purpose: 'verify' | 'reset'): Promise<void> {
  try {
    await sendOtpEmail(email, otp, purpose);
  } catch {
    throw createError('Unable to send verification code right now. Check Gmail app-password configuration and retry.', 503);
  }
}

function generateTokens(userId: string) {
  const secret = process.env.JWT_SECRET!;
  const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!;

  const accessToken  = jwt.sign({ userId }, secret, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId }, refreshSecret, { expiresIn: '7d' });

  return { accessToken, refreshToken };
}

// POST /api/v1/auth/signup
router.post('/signup', validate(SignupSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, name } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // If they registered but never verified, let them resend
      if (!existing.emailVerified) {
        try {
          const otp = await createOtpOrThrow(email, 'verify');
          await sendOtpOrThrow(email, otp, 'verify');
        } catch {
          // Keep response stable even if OTP services are temporarily unavailable.
        }
        return res.status(409).json({ error: 'Email already registered but not verified. A new verification code has been sent.', requiresVerification: true, email });
      }
      throw createError('Email already registered', 409);
    }

    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        email,
        password: hashed,
        name,
        emailVerified: false,
        profile: { create: { skills: [], platforms: [] } },
      },
    });

    const otp = await createOtpOrThrow(email, 'verify');
    await sendOtpOrThrow(email, otp, 'verify');

    res.status(201).json({ requiresVerification: true, email, message: 'Verification code sent to your email.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/verify-email
router.post('/verify-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) throw createError('Email and OTP are required', 400);

    const valid = await verifyOtp(email, 'verify', String(otp));
    if (!valid) throw createError('Invalid or expired verification code', 400);

    const user = await prisma.user.update({
      where: { email },
      data: { emailVerified: true },
      select: { id: true, email: true, name: true, timezone: true, avatarUrl: true },
    });

    const { accessToken, refreshToken } = generateTokens(user.id);
    await redis.set(`refresh:${user.id}`, refreshToken, 'EX', 60 * 60 * 24 * 7);

    res.json({ user, accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/resend-otp
router.post('/resend-otp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, purpose } = req.body;
    if (!email || !['verify', 'reset'].includes(purpose)) throw createError('Invalid request', 400);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal whether email exists — just say "sent if valid"
      return res.json({ message: 'If that email exists, a new code has been sent.' });
    }

    const otp = await createOtpOrThrow(email, purpose as 'verify' | 'reset');

    await sendOtpOrThrow(email, otp, purpose as 'verify' | 'reset');
    res.json({ message: 'Verification code sent.' });
  } catch (err) {
    if ((err as Error & { status?: number }).status === 429) {
      const ttl = await getCooldownTtl(req.body.email, req.body.purpose as 'verify' | 'reset');
      return res.status(429).json({ error: `Please wait ${ttl} second(s) before requesting a new code.`, cooldownSeconds: ttl });
    }
    next(err);
  }
});

// POST /api/v1/auth/login
router.post('/login', validate(LoginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
    if (!user || !user.password) throw createError('Invalid credentials', 401);

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw createError('Invalid credentials', 401);

    if (!user.emailVerified) {
      // Resend verification code automatically
      try {
        const otp = await createOtpOrThrow(email, 'verify');
        await sendOtpOrThrow(email, otp, 'verify');
      } catch {
        // Keep login behavior stable; frontend still routes user to verification.
      }
      return res.status(403).json({ error: 'Email not verified. A verification code has been sent.', requiresVerification: true, email });
    }

    // Auto-heal: create UserProfile if missing
    if (!user.profile) {
      await prisma.userProfile.create({ data: { userId: user.id, skills: [], platforms: [] } });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);
    await redis.set(`refresh:${user.id}`, refreshToken, 'EX', 60 * 60 * 24 * 7);

    res.json({
      user: { id: user.id, email: user.email, name: user.name, timezone: user.timezone, avatarUrl: user.avatarUrl },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw createError('Refresh token required', 400);

    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!;
    const payload = jwt.verify(refreshToken, refreshSecret) as { userId: string };

    const stored = await redis.get(`refresh:${payload.userId}`);
    if (stored !== refreshToken) throw createError('Invalid refresh token', 401);

    const { accessToken, refreshToken: newRefresh } = generateTokens(payload.userId);
    await redis.set(`refresh:${payload.userId}`, newRefresh, 'EX', 60 * 60 * 24 * 7);

    res.json({ accessToken, refreshToken: newRefresh });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await redis.del(`refresh:${req.userId}`);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, name: true, timezone: true, avatarUrl: true, createdAt: true },
    });
    if (!user) throw createError('User not found', 404);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/forgot-password
router.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email) throw createError('Email is required', 400);

    const user = await prisma.user.findUnique({ where: { email } });
    // Always return success to avoid user enumeration
    if (!user) return res.json({ message: 'If that email exists, a reset code has been sent.' });

    const otp = await createOtpOrThrow(email, 'reset');

    await sendOtpOrThrow(email, otp, 'reset');
    res.json({ message: 'If that email exists, a reset code has been sent.' });
  } catch (err) {
    if ((err as Error & { status?: number }).status === 429) {
      const ttl = await getCooldownTtl(req.body.email, 'reset');
      return res.status(429).json({ error: `Please wait ${ttl} second(s) before requesting again.`, cooldownSeconds: ttl });
    }
    next(err);
  }
});

// POST /api/v1/auth/verify-reset-otp
// Verifies OTP and returns a short-lived signed reset token (not a full session)
const VerifyResetOtpSchema = z.object({ email: z.string().email(), otp: z.string().length(6) });
router.post('/verify-reset-otp', validate(VerifyResetOtpSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, otp } = req.body;

    const valid = await verifyOtp(email, 'reset', String(otp));
    if (!valid) throw createError('Invalid or expired reset code', 400);

    const secret     = process.env.JWT_SECRET!;
    const resetToken = jwt.sign({ email, purpose: 'reset' }, secret, { expiresIn: '15m' });

    res.json({ resetToken });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/reset-password
const ResetPasswordSchema = z.object({ resetToken: z.string(), newPassword: z.string().min(8) });
router.post('/reset-password', validate(ResetPasswordSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { resetToken, newPassword } = req.body;

    const secret = process.env.JWT_SECRET!;
    let payload: { email: string; purpose: string };
    try {
      payload = jwt.verify(resetToken, secret) as { email: string; purpose: string };
    } catch {
      throw createError('Invalid or expired reset token', 400);
    }

    if (payload.purpose !== 'reset') throw createError('Invalid token', 400);

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { email: payload.email },
      data: { password: hashed, emailVerified: true },
    });

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/extension-token — generate a long-lived token for the Chrome extension
router.post('/extension-token', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const secret = process.env.JWT_SECRET!;
    const extensionToken = jwt.sign({ userId: req.userId }, secret, { expiresIn: '30d' });
    await redis.set(`ext-token:${req.userId}`, extensionToken, 'EX', 60 * 60 * 24 * 30);
    res.json({ extensionToken, expiresIn: '30d', message: 'Paste this token in the Freelancer OS Chrome Extension' });
  } catch (err) {
    next(err);
  }
});

export default router;
