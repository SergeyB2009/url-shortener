import {
  findByShortCode,
  insertUrl,
  incrementClicks,
  UrlRecord,
} from '../repositories/urlRepository';
import { generateShortCode } from '../utils/codeGenerator';
import { cacheGet, cacheSet, cacheDel } from '../cache/redisClient';
import { config } from '../config';

const CACHE_PREFIX = 'url:';
const MAX_COLLISION_RETRIES = 5;

export interface ShortenResult {
  shortCode: string;
  shortUrl: string;
}

export const shortenUrl = async (
  originalUrl: string
): Promise<ShortenResult> => {
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
    const shortCode = generateShortCode();
    const existing = await findByShortCode(shortCode);
    if (!existing) {
      await insertUrl(shortCode, originalUrl);
      return {
        shortCode,
        shortUrl: `${config.baseUrl}/${shortCode}`,
      };
    }
  }
  throw new Error('Failed to generate unique short code');
};

export const resolveShortCode = async (
  shortCode: string
): Promise<string | null> => {
  const cacheKey = `${CACHE_PREFIX}${shortCode}`;

  // 1. Пытаемся получить из Redis
  const cached = await cacheGet(cacheKey);
  if (cached) {
    console.log(`[Cache] HIT for ${shortCode}`);
    await incrementClicks(shortCode);
    return cached;
  }

  console.log(`[Cache] MISS for ${shortCode}, reading from DB`);
  // 2. Идём в БД
  const record = await findByShortCode(shortCode);
  if (!record) return null;

  // 3. Сохраняем в Redis с TTL
  await cacheSet(cacheKey, record.original_url, config.redis.ttl);
  await incrementClicks(shortCode);
  return record.original_url;
};

export const getStats = async (
  shortCode: string
): Promise<UrlRecord | null> => {
  return findByShortCode(shortCode);
};

export const invalidateCache = async (shortCode: string): Promise<void> => {
  await cacheDel(`${CACHE_PREFIX}${shortCode}`);
};