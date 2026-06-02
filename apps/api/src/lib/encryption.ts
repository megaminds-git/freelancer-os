/**
 * AES-256-GCM encryption for sensitive data stored in the database
 * (platform OAuth tokens, refresh tokens, session cookies).
 *
 * The encryption key is derived from JWT_SECRET using scrypt so that
 * no additional environment variable is required. Every stored value
 * carries its own random IV and authentication tag, so the same plaintext
 * produces a different ciphertext every time.
 *
 * Format stored in DB:  hex(iv) + ":" + hex(authTag) + ":" + hex(ciphertext)
 */

import crypto from 'crypto';

const ALGORITHM   = 'aes-256-gcm';
const SALT        = 'freelancer-os-v1-token-enc';
let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;

  if (process.env.ENCRYPTION_KEY) {
    const raw = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    if (raw.length === 32) {
      _key = raw;
      return _key;
    }
  }

  // Derive a 32-byte key from JWT_SECRET (deterministic — survives restarts)
  const secret = process.env.JWT_SECRET || 'fallback-insecure-jwt-secret';
  _key = crypto.scryptSync(secret, SALT, 32);
  return _key;
}

/**
 * Encrypt plaintext and return a storable string.
 * Safe to call with any non-empty string.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv  = crypto.randomBytes(12); // 96-bit IV recommended for GCM

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();

  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':');
}

/**
 * Decrypt a value previously produced by `encrypt()`.
 * Returns null if the value cannot be decrypted (wrong key, corrupted data).
 */
export function decrypt(stored: string): string | null {
  try {
    const parts = stored.split(':');
    if (parts.length !== 3) return null;

    const [ivHex, tagHex, encHex] = parts;
    const key      = getKey();
    const iv       = Buffer.from(ivHex,  'hex');
    const tag      = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Returns true when the string looks like an encrypted blob produced by encrypt().
 * Used to avoid double-encrypting values that are already encrypted.
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
}

/**
 * Convenience: encrypt only if the value is not already encrypted.
 */
export function encryptIfNeeded(value: string): string {
  return isEncrypted(value) ? value : encrypt(value);
}
