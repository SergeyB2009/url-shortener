import request from 'supertest';
import { createApp } from '../src/app';
import { redis } from '../src/cache/redisClient';
import { pool } from '../src/db/pool';
import { flushClicksToDb } from '../src/services/urlService';

const app = createApp();

describe('flushClicksToDb', () => {
  it('should move buffered clicks from Redis to DB and clear buffer', async () => {
    const createRes = await request(app)
      .post('/api/shorten')
      .send({ originalUrl: 'https://example.com/flush-test' });
    const { shortCode } = createRes.body;

    await request(app).get(`/${shortCode}`);
    await request(app).get(`/${shortCode}`);
    await request(app).get(`/${shortCode}`);

    const bufferBefore = await redis.get(`url:clicks:${shortCode}`);
    expect(parseInt(bufferBefore ?? '0', 10)).toBe(3);

    const dbBefore = await pool.query(
      'SELECT clicks FROM urls WHERE short_code = $1',
      [shortCode]
    );
    expect(dbBefore.rows[0].clicks).toBe(0);

    await flushClicksToDb();

    const dbAfter = await pool.query(
      'SELECT clicks FROM urls WHERE short_code = $1',
      [shortCode]
    );
    expect(dbAfter.rows[0].clicks).toBe(3);

    const bufferAfter = await redis.get(`url:clicks:${shortCode}`);
    expect(bufferAfter).toBeNull();
  });

  it('should not double-count when flush runs twice', async () => {
    const createRes = await request(app)
      .post('/api/shorten')
      .send({ originalUrl: 'https://example.com/flush-twice' });
    const { shortCode } = createRes.body;

    await request(app).get(`/${shortCode}`);
    await request(app).get(`/${shortCode}`);

    await flushClicksToDb();
    await flushClicksToDb();

    const dbRow = await pool.query(
      'SELECT clicks FROM urls WHERE short_code = $1',
      [shortCode]
    );
    expect(dbRow.rows[0].clicks).toBe(2);
  });

  it('getStats should be read-only: not modify DB or Redis', async () => {
    const createRes = await request(app)
      .post('/api/shorten')
      .send({ originalUrl: 'https://example.com/read-only-stats' });
    const { shortCode } = createRes.body;

    // Три перехода — буфер в Redis = 3, БД = 0
    await request(app).get(`/${shortCode}`);
    await request(app).get(`/${shortCode}`);
    await request(app).get(`/${shortCode}`);

    const dbBefore = await pool.query(
      'SELECT clicks FROM urls WHERE short_code = $1',
      [shortCode]
    );
    const bufferBefore = await redis.get(`url:clicks:${shortCode}`);
    expect(dbBefore.rows[0].clicks).toBe(0);
    expect(parseInt(bufferBefore ?? '0', 10)).toBe(3);

    // Вызываем stats — она должна вернуть 0 + 3 = 3
    const statsRes = await request(app).get(`/api/stats/${shortCode}`);
    expect(statsRes.body.clicks).toBe(3);

    // Проверяем, что getStats НЕ изменила ни БД, ни Redis
    const dbAfter = await pool.query(
      'SELECT clicks FROM urls WHERE short_code = $1',
      [shortCode]
    );
    const bufferAfter = await redis.get(`url:clicks:${shortCode}`);
    expect(dbAfter.rows[0].clicks).toBe(0);
    expect(parseInt(bufferAfter ?? '0', 10)).toBe(3);
  });

  it('stats should remain correct after flush and new clicks', async () => {
    const createRes = await request(app)
      .post('/api/shorten')
      .send({ originalUrl: 'https://example.com/stats-after-flush' });
    const { shortCode } = createRes.body;

    // 2 перехода → буфер = 2, БД = 0
    await request(app).get(`/${shortCode}`);
    await request(app).get(`/${shortCode}`);

    // flush → БД = 2, буфер = 0
    await flushClicksToDb();

    const dbAfterFlush = await pool.query(
      'SELECT clicks FROM urls WHERE short_code = $1',
      [shortCode]
    );
    expect(dbAfterFlush.rows[0].clicks).toBe(2);

    // ещё 1 переход → буфер = 1, БД = 2
    await request(app).get(`/${shortCode}`);

    // stats: 2 (из БД) + 1 (из буфера) = 3
    const statsRes = await request(app).get(`/api/stats/${shortCode}`);
    expect(statsRes.body.clicks).toBe(3);
  });
});