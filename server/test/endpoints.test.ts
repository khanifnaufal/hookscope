import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/client.js';

// Use in-memory SQLite for tests
process.env.DATABASE_URL = ':memory:';
process.env.NODE_ENV = 'test';

let app: ReturnType<typeof buildApp>;

beforeAll(async () => {
  await migrate();
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('POST /api/endpoints', () => {
  it('creates a new endpoint and returns id, token, hook_url, expires_at', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/endpoints' });
    expect(res.statusCode).toBe(201);

    const body = res.json<{
      id: string;
      manage_token: string;
      hook_url: string;
      expires_at: string;
    }>();

    expect(body.id).toHaveLength(12);
    expect(body.manage_token).toHaveLength(32);
    expect(body.hook_url).toContain(`/hook/${body.id}`);
    expect(body.expires_at).toBeTruthy();
  });
});

describe('GET /api/endpoints/:id', () => {
  let endpointId: string;
  let manageToken: string;

  beforeAll(async () => {
    const res = await app.inject({ method: 'POST', url: '/api/endpoints' });
    const body = res.json<{ id: string; manage_token: string }>();
    endpointId = body.id;
    manageToken = body.manage_token;
  });

  it('returns endpoint details with valid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/endpoints/${endpointId}`,
      headers: { authorization: `Bearer ${manageToken}` },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<{ id: string; hook_url: string }>();
    expect(body.id).toBe(endpointId);
    expect(body.hook_url).toContain(`/hook/${endpointId}`);
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/endpoints/${endpointId}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with wrong token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/endpoints/${endpointId}`,
      headers: { authorization: 'Bearer wrongtoken' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('masks hmac_secret in response', async () => {
    const body = (
      await app.inject({
        method: 'GET',
        url: `/api/endpoints/${endpointId}`,
        headers: { authorization: `Bearer ${manageToken}` },
      })
    ).json<{ hmac_secret: string | null }>();
    // hmac_secret not set yet — should be null
    expect(body.hmac_secret).toBeNull();
  });
});
