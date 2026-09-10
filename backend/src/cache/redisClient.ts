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