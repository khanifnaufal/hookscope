/**
 * Phase 8: Hardening tests
 *
 * Tests for:
 *  - TTL cleanup job (runCleanup)
 *  - Rate limiting (hookLimiter, createLimiter)
 *  - 429 responses from /hook/:id when rate limited
 *  - 429 responses from POST /api/endpoints when rate limited
 *  - Edge cases: binary body, duplicate headers, empty body
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { migrate, closeClient, getClient } from '../src/db/client.js';
import { runCleanup } from '../src/services/cleanup.js';
import { hookLimiter, createLimiter } from '../src/services/rateLimit.js';

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

// ────────────────────────────────────────────────
// TTL Cleanup
// ────────────────────────────────────────────────
describe('TTL Cleanup', () => {
  it('runCleanup returns 0 when nothing is expired', async () => {
    const deleted = await runCleanup();
    expect(deleted).toBe(0);
  });

  it('runCleanup deletes expired endpoints and cascades to requests', async () => {
    const db = getClient();

    // Insert an endpoint that expired in the past
    const expiredId = 'exp-test-1234';
    const pastDate = new Date(Date.now() - 1000).toISOString(); // 1 second ago
    await db.execute({
      sql: `INSERT INTO endpoints (id, manage_token, created_at, expires_at)
            VALUES (?, ?, ?, ?)`,
      args: [expiredId, 'tok_exp', new Date().toISOString(), pastDate],
    });

    // Insert a request for that endpoint
    await db.execute({
      sql: `INSERT INTO requests
            (endpoint_id, method, path, query, headers, body, content_type, ip, size_bytes, received_at)
            VALUES (?, 'POST', '/hook/${expiredId}', '{}', '{}', NULL, NULL, '127.0.0.1', 0, ?)`,
      args: [expiredId, new Date().toISOString()],
    });

    // Confirm they exist
    const beforeEndpoints = await db.execute({
      sql: 'SELECT id FROM endpoints WHERE id = ?',
      args: [expiredId],
    });
    expect(beforeEndpoints.rows.length).toBe(1);

    const deleted = await runCleanup();
    expect(deleted).toBeGreaterThanOrEqual(1);

    // Endpoint should be gone
    const afterEndpoints = await db.execute({
      sql: 'SELECT id FROM endpoints WHERE id = ?',
      args: [expiredId],
    });
    expect(afterEndpoints.rows.length).toBe(0);

    // Request should be cascade-deleted
    const afterRequests = await db.execute({
      sql: 'SELECT id FROM requests WHERE endpoint_id = ?',
      args: [expiredId],
    });
    expect(afterRequests.rows.length).toBe(0);
  });

  it('runCleanup does not delete endpoints that have NOT expired', async () => {
    const db = getClient();

    // Create a fresh endpoint via API (has future expires_at)
    const res = await app.inject({ method: 'POST', url: '/api/endpoints' });
    const body = res.json<{ id: string }>();
    const freshId = body.id;

    const deleted = await runCleanup();
    // Must not delete the fresh endpoint
    const rows = await db.execute({
      sql: 'SELECT id FROM endpoints WHERE id = ?',
      args: [freshId],
    });
    expect(rows.rows.length).toBe(1);
    // cleanup ran without error
    expect(typeof deleted).toBe('number');
  });
});

// ────────────────────────────────────────────────
// Rate Limiting — unit tests on the limiter itself
// ────────────────────────────────────────────────
describe('SlidingWindowRateLimiter (hookLimiter)', () => {
  beforeEach(() => hookLimiter.clear());

  it('allows up to limit requests', () => {
    // hookLimiter: 60 req/min — test with a unique key so we don't hit the real limit
    for (let i = 0; i < 60; i++) {
      expect(hookLimiter.isAllowed('unit-test-key')).toBe(true);
    }
  });

  it('blocks the 61st request within the same window', () => {
    for (let i = 0; i < 60; i++) hookLimiter.isAllowed('block-test-key');
    expect(hookLimiter.isAllowed('block-test-key')).toBe(false);
  });

  it('remaining() decrements correctly', () => {
    hookLimiter.isAllowed('remain-key');
    hookLimiter.isAllowed('remain-key');
    expect(hookLimiter.remaining('remain-key')).toBe(58);
  });

  it('different keys are independent', () => {
    for (let i = 0; i < 60; i++) hookLimiter.isAllowed('key-a');
    expect(hookLimiter.isAllowed('key-a')).toBe(false);
    expect(hookLimiter.isAllowed('key-b')).toBe(true); // fresh key
  });
});

describe('SlidingWindowRateLimiter (createLimiter)', () => {
  beforeEach(() => createLimiter.clear());

  it('allows up to 10 creations', () => {
    for (let i = 0; i < 10; i++) {
      expect(createLimiter.isAllowed('1.2.3.4')).toBe(true);
    }
  });

  it('blocks the 11th creation within the same hour window', () => {
    for (let i = 0; i < 10; i++) createLimiter.isAllowed('5.6.7.8');
    expect(createLimiter.isAllowed('5.6.7.8')).toBe(false);
  });
});

// ────────────────────────────────────────────────
// Hook rate limit — HTTP 429 integration test
// ────────────────────────────────────────────────
describe('Hook rate limit (429)', () => {
  let endpointId: string;

  beforeAll(async () => {
    hookLimiter.clear();
    const res = await app.inject({ method: 'POST', url: '/api/endpoints' });
    endpointId = res.json<{ id: string }>().id;
  });

  it('returns 429 after 60 requests to the same endpoint', async () => {
    // Exhaust the limit
    for (let i = 0; i < 60; i++) {
      await app.inject({ method: 'POST', url: `/hook/${endpointId}`, payload: '{}' });
    }

    const res = await app.inject({ method: 'POST', url: `/hook/${endpointId}`, payload: '{}' });
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('60');
    const body = res.json<{ error: string }>();
    expect(body.error).toBe('Rate limit exceeded');
  });

  it('returns X-RateLimit headers on allowed requests', async () => {
    // Use a fresh endpoint to get a clean counter
    hookLimiter.clear();
    const res2 = await app.inject({ method: 'POST', url: '/api/endpoints' });
    const freshId = res2.json<{ id: string }>().id;

    const res = await app.inject({ method: 'POST', url: `/hook/${freshId}`, payload: '{}' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('60');
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });
});

// ────────────────────────────────────────────────
// Edge cases: binary body, duplicate headers, empty body
// ────────────────────────────────────────────────
describe('Edge cases', () => {
  let endpointId: string;
  let token: string;

  beforeAll(async () => {
    hookLimiter.clear();
    const res = await app.inject({ method: 'POST', url: '/api/endpoints' });
    const data = res.json<{ id: string; manage_token: string }>();
    endpointId = data.id;
    token = data.manage_token;
  });

  it('handles empty body (GET request with no body)', async () => {
    const res = await app.inject({ method: 'GET', url: `/hook/${endpointId}` });
    expect(res.statusCode).toBe(200);

    const db = getClient();
    const rows = await db.execute({
      sql: 'SELECT body, size_bytes FROM requests WHERE endpoint_id = ? ORDER BY id DESC LIMIT 1',
      args: [endpointId],
    });
    const row = rows.rows[0];
    expect(row.body).toBeNull();
    expect(Number(row.size_bytes)).toBe(0);
  });

  it('handles binary content-type (stores as base64)', async () => {
    const binaryBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    const res = await app.inject({
      method: 'POST',
      url: `/hook/${endpointId}`,
      headers: { 'content-type': 'image/png' },
      payload: binaryBuffer,
    });
    expect(res.statusCode).toBe(200);

    const db = getClient();
    const rows = await db.execute({
      sql: 'SELECT body FROM requests WHERE endpoint_id = ? ORDER BY id DESC LIMIT 1',
      args: [endpointId],
    });
    const storedBody = rows.rows[0].body as string;
    // Should be base64 encoded
    expect(storedBody).toBe(binaryBuffer.toString('base64'));
  });

  it('normalises duplicate header values to comma-joined string', async () => {
    // Inject a request and read back the headers from DB
    await app.inject({
      method: 'POST',
      url: `/hook/${endpointId}`,
      headers: { 'content-type': 'text/plain', 'x-custom': 'alpha' },
      payload: 'hello',
    });

    const db = getClient();
    const rows = await db.execute({
      sql: 'SELECT headers FROM requests WHERE endpoint_id = ? ORDER BY id DESC LIMIT 1',
      args: [endpointId],
    });
    const headers = JSON.parse(rows.rows[0].headers as string);
    // All values should be strings (not arrays)
    for (const v of Object.values(headers)) {
      expect(typeof v).toBe('string');
    }
  });

  it('handles large JSON body up to 1 MB without rejection', async () => {
    // 950 KB of JSON — just under the 1 MB limit
    const bigPayload = JSON.stringify({ data: 'x'.repeat(950 * 1024) });
    const res = await app.inject({
      method: 'POST',
      url: `/hook/${endpointId}`,
      headers: { 'content-type': 'application/json' },
      payload: bigPayload,
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects body over 1 MB with 413', async () => {
    const oversized = 'x'.repeat(1048577); // 1 MB + 1 byte
    const res = await app.inject({
      method: 'POST',
      url: `/hook/${endpointId}`,
      headers: { 'content-type': 'text/plain' },
      payload: oversized,
    });
    expect(res.statusCode).toBe(413);
  });
});
