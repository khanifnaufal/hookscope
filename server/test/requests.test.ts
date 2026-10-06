import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { migrate, closeClient, getClient } from '../src/db/client.js';

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

describe('Requests API (Fase 3)', () => {
  let endpointId: string;
  let manageToken: string;

  beforeAll(async () => {
    // Create test endpoint
    const createRes = await app.inject({ method: 'POST', url: '/api/endpoints' });
    const createBody = createRes.json<{ id: string; manage_token: string }>();
    endpointId = createBody.id;
    manageToken = createBody.manage_token;

    // Send some requests to capture
    await app.inject({
      method: 'POST',
      url: `/hook/${endpointId}`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ item: 'laptop', price: 1200 }),
    });

    await app.inject({
      method: 'GET',
      url: `/hook/${endpointId}?search=laptop&sort=asc`,
    });

    await app.inject({
      method: 'POST',
      url: `/hook/${endpointId}/checkout`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ order_id: 'ord-123', status: 'paid' }),
    });
  });

  describe('GET /api/endpoints/:id/requests', () => {
    it('requires valid manage_token', async () => {
      const noAuth = await app.inject({
        method: 'GET',
        url: `/api/endpoints/${endpointId}/requests`,
      });
      expect(noAuth.statusCode).toBe(401);

      const wrongAuth = await app.inject({
        method: 'GET',
        url: `/api/endpoints/${endpointId}/requests`,
        headers: { authorization: 'Bearer wrong-token' },
      });
      expect(wrongAuth.statusCode).toBe(401);
    });

    it('returns paginated list of requests with parsed json fields', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/endpoints/${endpointId}/requests?limit=2&offset=0`,
        headers: { authorization: `Bearer ${manageToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json<{
        items: Array<{
          id: number;
          method: string;
          path: string;
          query: Record<string, unknown>;
          headers: Record<string, unknown>;
          body: string | null;
        }>;
        total: number;
        limit: number;
        offset: number;
      }>();

      expect(data.total).toBe(3);
      expect(data.limit).toBe(2);
      expect(data.offset).toBe(0);
      expect(data.items.length).toBe(2);

      // Verify newest first
      expect(data.items[0].path).toBe(`/hook/${endpointId}/checkout`);
      expect(typeof data.items[0].headers).toBe('object');
      expect(typeof data.items[0].query).toBe('object');
    });

    it('filters requests by HTTP method', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/endpoints/${endpointId}/requests?method=GET`,
        headers: { authorization: `Bearer ${manageToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json<{ items: Array<{ method: string }>; total: number }>();
      expect(data.total).toBe(1);
      expect(data.items[0].method).toBe('GET');
    });

    it('searches requests by text in body, path, or query', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/endpoints/${endpointId}/requests?search=checkout`,
        headers: { authorization: `Bearer ${manageToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json<{ items: Array<{ path: string }>; total: number }>();
      expect(data.total).toBe(1);
      expect(data.items[0].path).toBe(`/hook/${endpointId}/checkout`);

      const resBodySearch = await app.inject({
        method: 'GET',
        url: `/api/endpoints/${endpointId}/requests?search=ord-123`,
        headers: { authorization: `Bearer ${manageToken}` },
      });
      expect(resBodySearch.statusCode).toBe(200);
      const dataBody = resBodySearch.json<{ total: number }>();
      expect(dataBody.total).toBe(1);
    });
  });

  describe('GET /api/endpoints/:id/requests/:rid', () => {
    it('returns detail of a single request', async () => {
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/endpoints/${endpointId}/requests`,
        headers: { authorization: `Bearer ${manageToken}` },
      });
      const firstId = listRes.json<{ items: Array<{ id: number }> }>().items[0].id;

      const detailRes = await app.inject({
        method: 'GET',
        url: `/api/endpoints/${endpointId}/requests/${firstId}`,
        headers: { authorization: `Bearer ${manageToken}` },
      });

      expect(detailRes.statusCode).toBe(200);
      const detail = detailRes.json<{ id: number; endpoint_id: string; method: string }>();
      expect(detail.id).toBe(firstId);
      expect(detail.endpoint_id).toBe(endpointId);
    });

    it('returns 404 for non-existent request ID', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/endpoints/${endpointId}/requests/999999`,
        headers: { authorization: `Bearer ${manageToken}` },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json<{ error: string }>().error).toBe('Request not found');
    });
  });

  describe('DELETE /api/endpoints/:id/requests/:rid', () => {
    it('deletes a single request', async () => {
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/endpoints/${endpointId}/requests`,
        headers: { authorization: `Bearer ${manageToken}` },
      });
      const targetId = listRes.json<{ items: Array<{ id: number }> }>().items[0].id;

      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/endpoints/${endpointId}/requests/${targetId}`,
        headers: { authorization: `Bearer ${manageToken}` },
      });
      expect(delRes.statusCode).toBe(200);
      expect(delRes.json<{ ok: boolean }>().ok).toBe(true);

      // Verify 404 after deletion
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/endpoints/${endpointId}/requests/${targetId}`,
        headers: { authorization: `Bearer ${manageToken}` },
      });
      expect(getRes.statusCode).toBe(404);
    });

    it('returns 404 when deleting non-existent request', async () => {
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/endpoints/${endpointId}/requests/999999`,
        headers: { authorization: `Bearer ${manageToken}` },
      });
      expect(delRes.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/endpoints/:id/requests', () => {
    it('deletes all requests for an endpoint', async () => {
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/endpoints/${endpointId}/requests`,
        headers: { authorization: `Bearer ${manageToken}` },
      });

      expect(delRes.statusCode).toBe(200);
      const body = delRes.json<{ ok: boolean; count: number }>();
      expect(body.ok).toBe(true);
      expect(body.count).toBeGreaterThan(0);

      // List should now be empty
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/endpoints/${endpointId}/requests`,
        headers: { authorization: `Bearer ${manageToken}` },
      });
      expect(listRes.json<{ total: number; items: unknown[] }>().total).toBe(0);
      expect(listRes.json<{ items: unknown[] }>().items.length).toBe(0);
    });
  });

  describe('DELETE /api/endpoints/:id', () => {
    it('deletes endpoint and all its data', async () => {
      const createRes = await app.inject({ method: 'POST', url: '/api/endpoints' });
      const { id, manage_token } = createRes.json<{ id: string; manage_token: string }>();

      // Send request to hook
      await app.inject({ method: 'POST', url: `/hook/${id}`, payload: 'test' });

      // Delete endpoint
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/endpoints/${id}`,
        headers: { authorization: `Bearer ${manage_token}` },
      });
      expect(delRes.statusCode).toBe(200);
      expect(delRes.json<{ ok: boolean }>().ok).toBe(true);

      // Endpoint is now gone (token revoked -> 401)
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/endpoints/${id}`,
        headers: { authorization: `Bearer ${manage_token}` },
      });
      expect(getRes.statusCode).toBe(401);

      // Webhook capture is now 404
      const hookRes = await app.inject({ method: 'POST', url: `/hook/${id}`, payload: 'test' });
      expect(hookRes.statusCode).toBe(404);
    });
  });

  describe('FIFO Cap (500 requests limit)', () => {
    it('caps requests at 500 and discards oldest when exceeding limit', async () => {
      const createRes = await app.inject({ method: 'POST', url: '/api/endpoints' });
      const { id } = createRes.json<{ id: string }>();
      const db = getClient();

      // Seed 500 requests in chunks for stability
      const baseTime = Date.now() - 1000 * 60 * 60; // 1 hour ago
      for (let chunk = 0; chunk < 5; chunk++) {
        const statements = [];
        for (let j = 1; j <= 100; j++) {
          const i = chunk * 100 + j;
          statements.push({
            sql: `INSERT INTO requests (endpoint_id, method, path, query, headers, body, content_type, ip, size_bytes, received_at)
                  VALUES (?, ?, ?, '{}', '{}', ?, 'text/plain', '127.0.0.1', 4, ?)`,
            args: [id, 'POST', `/hook/${id}`, `req-${i}`, new Date(baseTime + i * 1000).toISOString()],
          });
        }
        await db.batch(statements);
      }

      // Verify count is 500
      const initialCount = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM requests WHERE endpoint_id = ?',
        args: [id],
      });
      expect(Number(initialCount.rows[0].count)).toBe(500);

      // Send 501st request through webhook endpoint
      const newRes = await app.inject({
        method: 'POST',
        url: `/hook/${id}`,
        payload: 'req-501-newest',
      });
      expect(newRes.statusCode).toBe(200);

      // Verify count is still capped at 500
      const afterCount = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM requests WHERE endpoint_id = ?',
        args: [id],
      });
      expect(Number(afterCount.rows[0].count)).toBe(500);

      // Verify oldest request (req-1) was purged and newest exists
      const oldestCheck = await db.execute({
        sql: 'SELECT body FROM requests WHERE endpoint_id = ? AND body = ?',
        args: [id, 'req-1'],
      });
      expect(oldestCheck.rows.length).toBe(0);

      const newestCheck = await db.execute({
        sql: 'SELECT body FROM requests WHERE endpoint_id = ? AND body = ?',
        args: [id, 'req-501-newest'],
      });
      expect(newestCheck.rows.length).toBe(1);
    });
  });
});
