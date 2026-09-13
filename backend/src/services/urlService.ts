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
 * Возвращает статистику.
 *
 * ВАЖНО про гонку: если между чтением clicks из БД и чтением буфера
 * из Redis сработает flush, то значение в БД уже включает то, что
 * было в буфере, а сам буфер обнулится. Тогда мы сложим DB + 0 — нормально.
 *
 * Обратный случай: flush начался, incrementClicksBy в БД прошёл,
 * но cacheDel ещё не сделал — тогда в буфере всё ещё лежит значение,
 * и мы сложим DB + буфер, задвоив.
 *
 * Решение: читаем буфер ДО чтения из БД. Если между ними flush сработал —
 * буфер обнулится, а DB уже содержит клики, ничего не задвоится.
 * Если flush случится после чтения буфера, но до чтения БД — буфер
 * в БД уже слит, а мы его ещё раз прибавим — снова задвоение.
 *
 * Поэтому используем GETDEL-семантику: если буфер в Redis есть — 
 * "забираем" его и добавляем к DB. flush тоже использует GETDEL,
 * так что либо мы забираем, либо flush — но не оба.
 */
export const getStats = async (
  shortCode: string
): Promise<UrlRecord | null> => {
  const record = await findByShortCode(shortCode);
  if (!record) return null;

  // Атомарно забираем буфер. Если flush уже его забрал — получим 0.
  const buffered = await cacheGetDelNumber(`${CLICKS_PREFIX}${shortCode}`);

  // Записываем в БД то, что забрали, чтобы не потерять
  if (buffered > 0) {
    await incrementClicksBy(shortCode, buffered);
  }

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
 * Атомарность: используем GETDEL, который атомарно читает и удаляет
 * ключ. Если flush запущен параллельно с другим flush или с getStats —
 * только один получит значение, второй получит 0. Клики не задвоятся.
 *
 * Если процесс упадёт после GETDEL, но до incrementClicksBy —
 * клики потеряются. Это осознанный компромисс: лучше потерять один
 * интервал (≤30 секунд), чем задвоить счётчики.
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
        // Если БД упала — возвращаем значение в Redis, чтобы не потерять
        console.error(`[Flush] error for ${shortCode}, restoring buffer`);
        await cacheIncr(key);
        for (let i = 1; i < value; i++) {
          await cacheIncr(key);
        }
        throw err;
      }
    }
  }
};