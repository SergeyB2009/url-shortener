import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('shortCode validation', () => {
  it('should reject shortCode with invalid characters', async () => {
    const res = await request(app).get('/api/stats/invalid!code');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('should reject shortCode longer than 10 chars', async () => {
    const res = await request(app).get('/api/stats/abcdefghijklmnop');
    expect(res.status).toBe(400);
  });

  it('should accept valid shortCode format and return 404 if not exists', async () => {
    const res = await request(app).get('/api/stats/abc123');
    expect(res.status).toBe(404);
  });
});