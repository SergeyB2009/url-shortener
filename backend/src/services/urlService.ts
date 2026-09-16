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
  cacheIncrBy,
  cacheGetDelNumber,
  cacheScan,
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

/**
 * Возвращает статистику. READ-ONLY: не пишет ни в БД, ни в Redis.
 *
 * Гонка с flush: мы читаем БД и буфер отдельно, без транзакции.
 * Узкое окно задвоения существует (если flush сработает между
 * нашими двумя read'ами), но для MVP это допустимо — окно
 * составляет миллисекунды, а flush идёт раз в 30 секунд.
 *
 * Порядок чтения (БД → буфер) минимизирует окно:
 * если flush успел до чтения БД — буфер уже 0, сумма верна.
 * если flush идёт после чтения буфера — наши данные уже зафиксированы.
 */
export const getStats = async (
  shortCode: string
): Promise<UrlRecord | null> => {
  const record = await findByShortCode(shortCode);
  if (!record) return null;

  const bufferedRaw = await cacheGet(`${CLICKS_PREFIX}${shortCode}`);
  const buffered = bufferedRaw ? parseInt(bufferedRaw, 10) : 0;

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
 *
 * Атомарность: GETDEL атомарно читает и удаляет ключ. Если flush
 * запущен параллельно с другим flush — только один получит значение.
 *
 * При ошибке БД возвращаем значение в буфер через INCRBY.
 */
export const flushClicksToDb = async (): Promise<void> => {
  const keys = await cacheScan(`${CLICKS_PREFIX}*`);
  for (const key of keys) {
    const shortCode = key.slice(CLICKS_PREFIX.length);
    const value = await cacheGetDelNumber(key);
    if (value > 0) {
      try {
        await incrementClicksBy(shortCode, value);
        console.log(`[Flush] ${shortCode}: +${value} clicks saved to DB`);
      } catch (err) {
        console.error(`[Flush] error for ${shortCode}, restoring buffer`);
        await cacheIncrBy(key, value);
        throw err;
      }
    }
  }
};