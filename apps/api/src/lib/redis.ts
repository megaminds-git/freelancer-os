import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on('error', (err) => {
  if (process.env.NODE_ENV !== 'test') {
    console.error('[Redis] Error:', err.message);
  }
});

redis.on('connect', () => {
  console.log('[Redis] Connected');
});

// Cache helpers - return null/do nothing if Redis is unavailable
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (err) {
    console.warn(`[Redis] Get failed for key "${key}":`, err);
    return null;
  }
}

export async function setCache(key: string, value: unknown, ttlSeconds = 3600): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    console.warn(`[Redis] Set failed for key "${key}":`, err);
  }
}

export async function delCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    console.warn(`[Redis] Del failed for key "${key}":`, err);
  }
}

export async function delCachePattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.warn(`[Redis] Pattern delete failed for pattern "${pattern}":`, err);
  }
}

export default redis;
