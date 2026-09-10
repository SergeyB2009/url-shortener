import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db/pool';
import { redis } from '../src/cache/redisClient';

const app = createApp();

beforeAll(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS urls (
      id SERIAL PRIMARY KEY,
      short_code VARCHAR(10) UNIQUE NOT NULL,
      original_url TEXT NOT NULL,
      clicks INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
});

afterAll(async () => {
  await pool.query('TRUNCATE urls RESTART IDENTITY');
  await pool.end();
  await redis.quit();
});

describe('POST /api/shorten', () => {
  it('should create a short URL', async () => {
    const res = await request(app)
      .post('/api/shorten')
      .send({ originalUrl: 'https://example.com' });
    expect(res.status).toBe(201);
    expect(res.body.shortCode).toHaveLength(6);
    expect(res.body.shortUrl).toContain(res.body.shortCode);
  });

  it('should reject invalid URL', async () => {
    const res = await request(app)
      .post('/api/shorten')
      .send({ originalUrl: 'not-a-url' });
    expect(res.status).toBe(400);
  });
});

describe('GET /:shortCode', () => {
  it('should redirect and increment clicks', async () => {
    const createRes = await request(app)
      .post('/api/shorten')
      .send({ originalUrl: 'https://example.com' });
    const { shortCode } = createRes.body;

    const res = await request(app).get(`/${shortCode}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com');

    const statsRes = await request(app).get(`/api/stats/${shortCode}`);
    expect(statsRes.body.clicks).toBe(1);
  });

  it('should return 404 for unknown code', async () => {
    const res = await request(app).get('/zzzzzz');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/stats/:shortCode', () => {
  it('should return stats', async () => {
    const createRes = await request(app)
      .post('/api/shorten')
      .send({ originalUrl: 'https://example.com' });
    const { shortCode } = createRes.body;

    const res = await request(app).get(`/api/stats/${shortCode}`);
    expect(res.status).toBe(200);
    expect(res.body.originalUrl).toBe('https://example.com');
    expect(res.body.clicks).toBe(0);
    expect(res.body.createdAt).toBeDefined();
  });
});