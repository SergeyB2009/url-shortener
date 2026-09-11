import Redis from 'ioredis';
import { config } from '../config';

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  lazyConnect: false,
});

redis.on('error', (err) => {
  console.error('[Redis] error:', err.message);
});

export const cacheGet = async (key: string): Promise<string | null> => {
  return redis.get(key);
};

export const cacheSet = async (
  key: string,
  value: string,
  ttl: number
): Promise<void> => {
  await redis.set(key, value, 'EX', ttl);
};

export const cacheDel = async (key: string): Promise<void> => {
  await redis.del(key);
};

export const cacheIncr = async (key: string): Promise<number> => {
  return redis.incr(key);
};

export const cacheGetNumber = async (key: string): Promise<number> => {
  const val = await redis.get(key);
  return val ? parseInt(val, 10) : 0;
};

export const cacheKeys = async (pattern: string): Promise<string[]> => {
  return redis.keys(pattern);
};