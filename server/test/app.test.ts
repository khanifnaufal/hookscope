import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Health check', () => {
  it('GET /health returns ok', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string }>();
    expect(body.status).toBe('ok');
  });
});
