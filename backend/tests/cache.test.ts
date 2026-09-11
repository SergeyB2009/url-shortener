import request from 'supertest';
import { createApp } from '../src/app';
import { redis } from '../src/cache/redisClient';
import { pool } from '../src/db/pool';

const app = createApp();

describe('Redis caching', () => {
  it('should serve second request from Redis, not from DB', async () => {
    const createRes = await request(app)
      .post('/api/shorten')
      .send({ originalUrl: 'https://example.com/cache-test' });
    const { shortCode } = createRes.body;

    // Первый переход — MISS, кладёт в Redis
    const firstRes = await request(app).get(`/${shortCode}`);
    expect(firstRes.status).toBe(302);

    const cached = await redis.get(`url:${shortCode}`);
    expect(cached).toBe('https://example.com/cache-test');

    // Удаляем запись из БД. Если второй переход сработает —
    // значит URL отдан из Redis, а не из PostgreSQL
    await pool.query('DELETE FROM urls WHERE short_code = $1', [shortCode]);

    const secondRes = await request(app).get(`/${shortCode}`);
    expect(secondRes.status).toBe(302);
    expect(secondRes.headers.location).toBe('https://example.com/cache-test');
  });

  it('should buffer clicks in Redis on cache hit', async () => {
    const createRes = await request(app)
      .post('/api/shorten')
      .send({ originalUrl: 'https://example.com/clicks' });
    const { shortCode } = createRes.body;

    await request(app).get(`/${shortCode}`); // MISS, +1 буфер
    await request(app).get(`/${shortCode}`); // HIT, +1 буфер
    await request(app).get(`/${shortCode}`); // HIT, +1 буфер

    const buffered = await redis.get(`url:clicks:${shortCode}`);
    expect(parseInt(buffered ?? '0', 10)).toBe(3);

    // В БД пока 0 — flush ещё не было
    const dbRow = await pool.query(
      'SELECT clicks FROM urls WHERE short_code = $1',
      [shortCode]
    );
    expect(dbRow.rows[0].clicks).toBe(0);
  });
});