import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { migrate, closeClient } from '../src/db/client.js';

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
  closeClient();
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

describe('PATCH /api/endpoints/:id', () => {
  let endpointId: string;
  let manageToken: string;

  beforeAll(async () => {
    const res = await app.inject({ method: 'POST', url: '/api/endpoints' });
    const body = res.json<{ id: string; manage_token: string }>();
    endpointId = body.id;
    manageToken = body.manage_token;
  });

  it('updates custom response settings successfully', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/endpoints/${endpointId}`,
      headers: { authorization: `Bearer ${manageToken}` },
      payload: {
        response_status: 201,
        response_body: '{"created":true}',
        response_content_type: 'application/json',
        response_delay_ms: 100,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      response_status: number;
      response_body: string;
      response_content_type: string;
      response_delay_ms: number;
    }>();
    expect(body.response_status).toBe(201);
    expect(body.response_body).toBe('{"created":true}');
    expect(body.response_content_type).toBe('application/json');
    expect(body.response_delay_ms).toBe(100);

    // Verify /hook/:id serves custom response
    const hookRes = await app.inject({
      method: 'POST',
      url: `/hook/${endpointId}`,
      payload: { test: 1 },
    });
    expect(hookRes.statusCode).toBe(201);
    expect(hookRes.headers['content-type']).toContain('application/json');
    expect(hookRes.body).toBe('{"created":true}');
  });

  it('updates HMAC config and masks hmac_secret in response', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/endpoints/${endpointId}`,
      headers: { authorization: `Bearer ${manageToken}` },
      payload: {
        hmac_secret: 'my-super-secret',
        hmac_algo: 'sha256',
        hmac_header: 'X-Signature-256',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      hmac_secret: string | null;
      hmac_algo: string | null;
      hmac_header: string | null;
    }>();
    expect(body.hmac_secret).toBe('***');
    expect(body.hmac_algo).toBe('sha256');
    expect(body.hmac_header).toBe('X-Signature-256');
  });

  it('allows clearing HMAC config by setting null or empty string', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/endpoints/${endpointId}`,
      headers: { authorization: `Bearer ${manageToken}` },
      payload: {
        hmac_secret: null,
        hmac_algo: '',
        hmac_header: null,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      hmac_secret: string | null;
      hmac_algo: string | null;
      hmac_header: string | null;
    }>();
    expect(body.hmac_secret).toBeNull();
    expect(body.hmac_algo).toBeNull();
    expect(body.hmac_header).toBeNull();
  });

  it('rejects invalid status code with 400', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/endpoints/${endpointId}`,
      headers: { authorization: `Bearer ${manageToken}` },
      payload: {
        response_status: 999,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects delay greater than 10000ms with 400', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/endpoints/${endpointId}`,
      headers: { authorization: `Bearer ${manageToken}` },
      payload: {
        response_delay_ms: 15000,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without authorization token', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/endpoints/${endpointId}`,
      payload: {
        response_status: 200,
      },
    });

    expect(res.statusCode).toBe(401);
  });
});
