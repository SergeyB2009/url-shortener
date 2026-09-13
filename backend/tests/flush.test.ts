import request from 'supertest';
import { createApp } from '../src/app';
import { redis } from '../src/cache/redisClient';
import { pool } from '../src/db/pool';
import { flushClicksToDb } from '../src/services/urlService';

const app = createApp();

describe('flushClicksToDb', () => {
  it('should move buffered clicks from Redis to DB and clear buffer', async () => {
    // 1. Создаём ссылку
    const createRes = await request(app)
      .post('/api/shorten')
      .send({ originalUrl: 'https://example.com/flush-test' });
    const { shortCode } = createRes.body;

    // 2. Делаем 3 перехода — клики буферизуются в Redis
    await request(app).get(`/${shortCode}`);
    await request(app).get(`/${shortCode}`);
    await request(app).get(`/${shortCode}`);

    // Проверяем, что буфер в Redis = 3, а в БД = 0
    const bufferBefore = await redis.get(`url:clicks:${shortCode}`);
    expect(parseInt(bufferBefore ?? '0', 10)).toBe(3);

    const dbBefore = await pool.query(
      'SELECT clicks FROM urls WHERE short_code = $1',
      [shortCode]
    );
    expect(dbBefore.rows[0].clicks).toBe(0);

    // 3. Запускаем flush вручную (не ждём setInterval)
    await flushClicksToDb();

    // 4. Проверяем: в БД клики появились, буфер очищен
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
    await flushClicksToDb(); // второй раз — буфер уже пуст

    const dbRow = await pool.query(
      'SELECT clicks FROM urls WHERE short_code = $1',
      [shortCode]
    );
    expect(dbRow.rows[0].clicks).toBe(2); // не 4
  });

  it('should keep stats correct after flush', async () => {
    const createRes = await request(app)
      .post('/api/shorten')
      .send({ originalUrl: 'https://example.com/stats-after-flush' });
    const { shortCode } = createRes.body;

    await request(app).get(`/${shortCode}`);
    await request(app).get(`/${shortCode}`);
    await flushClicksToDb();

    // Ещё один переход после flush — буфер снова наполнится
    await request(app).get(`/${shortCode}`);

    const statsRes = await request(app).get(`/api/stats/${shortCode}`);
    expect(statsRes.body.clicks).toBe(3); // 2 из БД + 1 из буфера
  });
});