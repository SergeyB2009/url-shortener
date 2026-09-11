import {
  findByShortCode,
  insertUrl,
  incrementClicksBy,
  deleteByShortCode,
  UrlRecord,
} from '../repositories/urlRepository';
import { generateShortCode } from '../utils/codeGenerator';
import {
  cacheGet,
  cacheSet,
  cacheDel,
  cacheIncr,
  cacheGetNumber,
  cacheKeys,
} from '../cache/redisClient';
import { config } from '../config';
import { ValidationError } from '../middleware/errorHandler';

const CACHE_PREFIX = 'url:';
const CLICKS_PREFIX = 'url:clicks:';
const MAX_COLLISION_RETRIES = 5;

export interface ShortenResult {
  shortCode: string;
  shortUrl: string;
}

/**
 * Проверяет, ведёт ли URL на наш собственный сервис.
 * Это защита от циклических редиректов: если сократить ссылку
 * на наш же домен, переход по ней снова попадёт в наш редирект.
 */
export const isSelfReferencing = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    const base = new URL(config.baseUrl);
    return parsed.host === base.host;
  } catch {
    return false;
  }
};

export const shortenUrl = async (
  originalUrl: string
): Promise<ShortenResult> => {
  if (isSelfReferencing(originalUrl)) {
    throw new ValidationError(
      'Cannot shorten URLs pointing to this service (circular redirect)'
    );
  }

  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
    const shortCode = generateShortCode();
    try {
      await insertUrl(shortCode, originalUrl);
      return {
        shortCode,
        shortUrl: `${config.baseUrl}/${shortCode}`,
      };
    } catch (err) {
      const pgCode = (err as { code?: string }).code;
      if (pgCode === '23505') {
        console.log(`[Collision] short code ${shortCode}, retrying...`);
        continue;
      }
      throw err;
    }
  }

  throw new Error('Failed to generate unique short code after retries');
};

export const resolveShortCode = async (
  shortCode: string
): Promise<string | null> => {
  const cacheKey = `${CACHE_PREFIX}${shortCode}`;

  const cached = await cacheGet(cacheKey);
  if (cached) {
    console.log(`[Cache] HIT for ${shortCode}`);
    await cacheIncr(`${CLICKS_PREFIX}${shortCode}`);
    return cached;
  }

  console.log(`[Cache] MISS for ${shortCode}, reading from DB`);
  const record = await findByShortCode(shortCode);
  if (!record) return null;

  await cacheSet(cacheKey, record.original_url, config.redis.ttl);
  await cacheIncr(`${CLICKS_PREFIX}${shortCode}`);
  return record.original_url;
};

export const getStats = async (
  shortCode: string
): Promise<UrlRecord | null> => {
  const record = await findByShortCode(shortCode);
  if (!record) return null;

  const buffered = await cacheGetNumber(`${CLICKS_PREFIX}${shortCode}`);
  return { ...record, clicks: record.clicks + buffered };
};

export const deleteUrl = async (shortCode: string): Promise<boolean> => {
  const deleted = await deleteByShortCode(shortCode);
  if (deleted) {
    await invalidateCache(shortCode);
  }
  return deleted;
};

export const invalidateCache = async (shortCode: string): Promise<void> => {
  await cacheDel(`${CACHE_PREFIX}${shortCode}`);
  await cacheDel(`${CLICKS_PREFIX}${shortCode}`);
};

/**
 * Сбрасывает накопленные в Redis клики в PostgreSQL.
 * Запускается по таймеру из server.ts.
 */
export const flushClicksToDb = async (): Promise<void> => {
  const keys = await cacheKeys(`${CLICKS_PREFIX}*`);
  for (const key of keys) {
    const shortCode = key.slice(CLICKS_PREFIX.length);
    const value = await cacheGetNumber(key);
    if (value > 0) {
      await incrementClicksBy(shortCode, value);
      await cacheDel(key);
      console.log(`[Flush] ${shortCode}: +${value} clicks saved to DB`);
    }
  }
};