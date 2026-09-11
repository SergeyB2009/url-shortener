import { pool } from '../src/db/pool';
import { redis } from '../src/cache/redisClient';

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
  await pool.end();
  await redis.quit();
});

beforeEach(async () => {
  await pool.query('TRUNCATE urls RESTART IDENTITY');
  await redis.flushall();
});