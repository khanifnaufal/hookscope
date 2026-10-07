import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { nanoid } from 'nanoid';
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

describe('Webhook capture (ALL /hook/:id)', () => {
  let endpointId: string;

  beforeAll(async () => {
    const res = await app.inject({ method: 'POST', url: '/api/endpoints' });
    const body = res.json<{ id: string }>();
    endpointId = body.id;
  });

  it('captures POST request with JSON body and saves to DB', async () => {
    const payload = JSON.stringify({ event: 'payment.success', amount: 50000 });
    const res = await app.inject({
      method: 'POST',
      url: `/hook/${endpointId}`,
      headers: {
        'content-type': 'application/json',
        'x-custom-header': 'test-val',
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toBe('{"ok":true}');

    // Verify stored in DB
    const db = getClient();
    const result = await db.execute({
      sql: 'SELECT * FROM requests WHERE endpoint_id = ? ORDER BY id DESC LIMIT 1',
      args: [endpointId],
    });

    expect(result.rows.length).toBe(1);
    const row = result.rows[0];
    expect(row.method).toBe('POST');
    expect(row.path).toBe(`/hook/${endpointId}`);
    expect(row.content_type).toBe('application/json');
    expect(row.body).toBe(payload);
    expect(row.size_bytes).toBe(Buffer.byteLength(payload));
    expect(typeof row.headers).toBe('string');
    expect(JSON.parse(row.headers as string)['x-custom-header']).toBe('test-val');
  });

  it('captures GET request with query params', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/hook/${endpointId}?source=slack&channel=general`,
    });

    expect(res.statusCode).toBe(200);

    const db = getClient();
    const result = await db.execute({
      sql: "SELECT * FROM requests WHERE endpoint_id = ? AND method = 'GET' ORDER BY id DESC LIMIT 1",
      args: [endpointId],
    });

    expect(result.rows.length).toBe(1);
    const row = result.rows[0];
    expect(row.method).toBe('GET');
    expect(row.body).toBeNull();
    expect(row.size_bytes).toBe(0);
    const query = JSON.parse(row.query as string);
    expect(query.source).toBe('slack');
    expect(query.channel).toBe('general');
  });

  it('captures PUT, PATCH, DELETE, HEAD, and OPTIONS methods', async () => {
    const methods = ['PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;

    for (const method of methods) {
      const res = await app.inject({
        method,
        url: `/hook/${endpointId}`,
        headers: { 'content-type': 'text/plain' },
        payload: `${method} payload data`,
      });
      expect(res.statusCode).toBe(200);
    }

    // Test HEAD
    const headRes = await app.inject({
      method: 'HEAD',
      url: `/hook/${endpointId}`,
    });
    expect(headRes.statusCode).toBe(200);

    // Verify all 5 were recorded in DB
    const db = getClient();
    const resCount = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM requests WHERE endpoint_id = ?',
      args: [endpointId],
    });
    // 1 (POST) + 1 (GET) + 4 (PUT, PATCH, DELETE, OPTIONS) + 1 (HEAD) = 7
    expect(Number(resCount.rows[0].count)).toBe(7);
  });

  it('captures subpath requests like /hook/:id/callback', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/hook/${endpointId}/webhook/github`,
      payload: 'github ping',
    });
    expect(res.statusCode).toBe(200);

    const db = getClient();
    const result = await db.execute({
      sql: "SELECT * FROM requests WHERE endpoint_id = ? AND path LIKE '%/github' LIMIT 1",
      args: [endpointId],
    });
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].path).toBe(`/hook/${endpointId}/webhook/github`);
  });

  it('stores binary payload as base64', async () => {
    const binaryBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header bytes
    const res = await app.inject({
      method: 'POST',
      url: `/hook/${endpointId}`,
      headers: { 'content-type': 'image/png' },
      payload: binaryBuffer,
    });

    expect(res.statusCode).toBe(200);

    const db = getClient();
    const result = await db.execute({
      sql: "SELECT body, content_type, size_bytes FROM requests WHERE endpoint_id = ? AND content_type = 'image/png' LIMIT 1",
      args: [endpointId],
    });

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].body).toBe(binaryBuffer.toString('base64'));
    expect(result.rows[0].size_bytes).toBe(binaryBuffer.length);
  });

  it('returns 404 for non-existent endpoint', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/hook/nonexistent123',
      payload: 'test',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toBe('Endpoint not found');
  });

  it('returns 404 for expired endpoint', async () => {
    const db = getClient();
    const expiredId = nanoid(12);
    const past = new Date(Date.now() - 1000 * 60).toISOString();

    await db.execute({
      sql: `INSERT INTO endpoints (id, manage_token, created_at, expires_at)
            VALUES (?, ?, ?, ?)`,
      args: [expiredId, 'token123', past, past],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/hook/${expiredId}`,
      payload: 'test',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toBe('Endpoint expired');
  });

  it('rejects payload > 1 MB with 413 and does not save to DB', async () => {
    const db = getClient();
    const countBefore = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM requests WHERE endpoint_id = ?',
      args: [endpointId],
    });

    // 1 MB + 1 byte = 1048577 bytes
    const largePayload = Buffer.alloc(1024 * 1024 + 1, 'x');

    const res = await app.inject({
      method: 'POST',
      url: `/hook/${endpointId}`,
      headers: { 'content-type': 'text/plain' },
      payload: largePayload,
    });

    expect(res.statusCode).toBe(413);

    // Verify nothing added to DB
    const countAfter = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM requests WHERE endpoint_id = ?',
      args: [endpointId],
    });

    expect(Number(countAfter.rows[0].count)).toBe(Number(countBefore.rows[0].count));
  });

  it('returns custom response status, body, content-type and delay if configured', async () => {
    const db = getClient();
    const customId = nanoid(12);
    const future = new Date(Date.now() + 1000 * 60 * 60).toISOString();

    await db.execute({
      sql: `INSERT INTO endpoints (
              id, manage_token, response_status, response_body, response_content_type, response_delay_ms, created_at, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        customId,
        'token_custom',
        202,
        '<response>accepted</response>',
        'application/xml',
        50,
        future,
        future,
      ],
    });

    const startTime = Date.now();
    const res = await app.inject({
      method: 'POST',
      url: `/hook/${customId}`,
      payload: 'ping',
    });
    const elapsed = Date.now() - startTime;

    expect(res.statusCode).toBe(202);
    expect(res.headers['content-type']).toContain('application/xml');
    expect(res.body).toBe('<response>accepted</response>');
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  describe('HMAC verification during hook capture', () => {
    const hmacId = nanoid(12);
    const secret = 'whsec_test_secret_123';
    const future = new Date(Date.now() + 1000 * 60 * 60).toISOString();

    beforeAll(async () => {
      const db = getClient();
      await db.execute({
        sql: `INSERT INTO endpoints (
                id, manage_token, hmac_secret, hmac_algo, hmac_header, created_at, expires_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          hmacId,
          'token_hmac',
          secret,
          'sha256',
          'X-Signature-256',
          future,
          future,
        ],
      });
    });

    it('sets signature_valid to null when signature header is missing ("tidak ada signature")', async () => {
      const payload = JSON.stringify({ message: 'no signature sent' });
      await app.inject({
        method: 'POST',
        url: `/hook/${hmacId}`,
        headers: { 'content-type': 'application/json' },
        payload,
      });

      const db = getClient();
      const res = await db.execute({
        sql: 'SELECT signature_valid FROM requests WHERE endpoint_id = ? ORDER BY id DESC LIMIT 1',
        args: [hmacId],
      });

      expect(res.rows[0].signature_valid).toBeNull();
    });

    it('sets signature_valid to 1 when valid HMAC signature is sent', async () => {
      const crypto = await import('node:crypto');
      const payload = JSON.stringify({ message: 'valid signature' });
      const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      await app.inject({
        method: 'POST',
        url: `/hook/${hmacId}`,
        headers: {
          'content-type': 'application/json',
          'x-signature-256': `sha256=${hash}`,
        },
        payload,
      });

      const db = getClient();
      const res = await db.execute({
        sql: 'SELECT signature_valid FROM requests WHERE endpoint_id = ? ORDER BY id DESC LIMIT 1',
        args: [hmacId],
      });

      expect(res.rows[0].signature_valid).toBe(1);
    });

    it('sets signature_valid to 0 when invalid HMAC signature is sent', async () => {
      const payload = JSON.stringify({ message: 'tampered signature' });

      await app.inject({
        method: 'POST',
        url: `/hook/${hmacId}`,
        headers: {
          'content-type': 'application/json',
          'x-signature-256': 'sha256=wrongsignaturevalue000000000',
        },
        payload,
      });

      const db = getClient();
      const res = await db.execute({
        sql: 'SELECT signature_valid FROM requests WHERE endpoint_id = ? ORDER BY id DESC LIMIT 1',
        args: [hmacId],
      });

      expect(res.rows[0].signature_valid).toBe(0);
    });
  });
});
