import crypto from 'crypto';
import { redis } from './redis';

const OTP_TTL_SECONDS  = 10 * 60;  // 10 minutes
const COOLDOWN_SECONDS = 60;        // 1 minute between resends

function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

export async function createOtp(email: string, purpose: 'verify' | 'reset'): Promise<string | null> {
  const cooldownKey = `otp:cooldown:${purpose}:${email}`;
  const onCooldown  = await redis.get(cooldownKey);
  if (onCooldown) return null; // caller should respond with 429

  const otp = generateOtp();
  const key = `otp:${purpose}:${email}`;
  await redis.set(key, otp, 'EX', OTP_TTL_SECONDS);
  await redis.set(cooldownKey, '1', 'EX', COOLDOWN_SECONDS);
  return otp;
}

export async function verifyOtp(email: string, purpose: 'verify' | 'reset', code: string): Promise<boolean> {
  const key   = `otp:${purpose}:${email}`;
  const stored = await redis.get(key);
  if (!stored || stored !== code) return false;
  await redis.del(key); // single-use
  return true;
}

export async function getCooldownTtl(email: string, purpose: 'verify' | 'reset'): Promise<number> {
  const cooldownKey = `otp:cooldown:${purpose}:${email}`;
  const ttl = await redis.ttl(cooldownKey);
  return ttl > 0 ? ttl : 0;
}
