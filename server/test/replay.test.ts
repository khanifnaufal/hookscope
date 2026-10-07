import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { migrate, closeClient } from '../src/db/client.js';
import { isBlockedIp, validateTargetUrl, SsrfError } from '../src/services/ssrf.js';
import { createLimiter, hookLimiter } from '../src/services/rateLimit.js';

process.env.DATABASE_URL = ':memory:';
process.env.NODE_ENV = 'test';

describe('SSRF Protection Service', () => {
  describe('isBlockedIp()', () => {
    it('blocks 127.0.0.0/8 loopback IPs', () => {
      expect(isBlockedIp('127.0.0.1')).toBe(true);
      expect(isBlockedIp('127.0.0.254')).toBe(true);
      expect(isBlockedIp('127.255.255.255')).toBe(true);
    });

    it('blocks 10.0.0.0/8 private IPs', () => {
      expect(isBlockedIp('10.0.0.1')).toBe(true);
      expect(isBlockedIp('10.255.255.255')).toBe(true);
    });

    it('blocks 172.16.0.0/12 private IPs', () => {
      expect(isBlockedIp('172.16.0.1')).toBe(true);
      expect(isBlockedIp('172.31.255.255')).toBe(true);
      expect(isBlockedIp('172.32.0.1')).toBe(false); // public
    });

    it('blocks 192.168.0.0/16 private IPs', () => {
      expect(isBlockedIp('192.168.0.1')).toBe(true);
      expect(isBlockedIp('192.168.1.100')).toBe(true);
    });

    it('blocks 169.254.0.0/16 link-local / AWS metadata IPs', () => {
      expect(isBlockedIp('169.254.169.254')).toBe(true);
      expect(isBlockedIp('169.254.1.1')).toBe(true);
    });

    it('blocks 0.0.0.0/8 unspecified addresses', () => {
      expect(isBlockedIp('0.0.0.0')).toBe(true);
    });

    it('blocks IPv6 loopback and link-local', () => {
      expect(isBlockedIp('::1')).toBe(true);
      expect(isBlockedIp('::')).toBe(true);
      expect(isBlockedIp('fe80::1')).toBe(true);
      expect(isBlockedIp('fc00::1')).toBe(true);
    });

    it('allows public IPv4 addresses', () => {
      expect(isBlockedIp('8.8.8.8')).toBe(false);
      expect(isBlockedIp('1.1.1.1')).toBe(false);
      expect(isBlockedIp('93.184.216.34')).toBe(false); // example.com
    });
  });

  describe('validateTargetUrl()', () => {
    it('rejects invalid schemes', async () => {
      await expect(validateTargetUrl('ftp://example.com/test')).rejects.toThrow(SsrfError);
      await expect(validateTargetUrl('file:///etc/passwd')).rejects.toThrow(SsrfError);
      await expect(validateTargetUrl('gopher://example.com')).rejects.toThrow(SsrfError);
    });

    it('rejects direct private IPs in URL', async () => {
      await expect(validateTargetUrl('http://127.0.0.1:8080/hook')).rejects.toThrow(SsrfError);
      await expect(validateTargetUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
        SsrfError,
      );
      await expect(validateTargetUrl('https://192.168.1.1/admin')).rejects.toThrow(SsrfError);
      await expect(validateTargetUrl('http://10.0.0.5/api')).rejects.toThrow(SsrfError);
      await expect(validateTargetUrl('http://[::1]:3000/')).rejects.toThrow(SsrfError);
    });

    it('rejects localhost hostname (resolves to 127.0.0.1 or ::1)', async () => {
      await expect(validateTargetUrl('http://localhost:3000/test')).rejects.toThrow(SsrfError);
    });

    it('accepts valid public HTTP/HTTPS URLs', async () => {
      const url = await validateTargetUrl('http://93.184.216.34/webhook');
      expect(url.hostname).toBe('93.184.216.34');
      expect(url.protocol).toBe('http:');

      const httpsUrl = await validateTargetUrl('https://1.1.1.1/api');
      expect(httpsUrl.hostname).toBe('1.1.1.1');
      expect(httpsUrl.protocol).toBe('https:');
    });
  });
});

describe('Replay API Route', () => {
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

  beforeEach(() => {
    createLimiter.clear();
    hookLimiter.clear();
  });

  it('requires Bearer token authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/endpoints/some-id/requests/1/replay',
      payload: { target_url: 'https://example.com' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for non-existent request', async () => {
    // 1. Create endpoint
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/endpoints',
    });
    const { id, manage_token } = JSON.parse(createRes.payload);

    // 2. Try to replay non-existent request ID
    const res = await app.inject({
      method: 'POST',
      url: `/api/endpoints/${id}/requests/999999/replay`,
      headers: { authorization: `Bearer ${manage_token}` },
      payload: { target_url: 'https://example.com/webhook' },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.payload).error).toBe('Request not found');
  });

  it('rejects replay with 422 if target URL is SSRF-blocked (e.g. 127.0.0.1)', async () => {
    // 1. Create endpoint
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/endpoints',
    });
    const { id, manage_token } = JSON.parse(createRes.payload);

    // 2. Capture a dummy request
    await app.inject({
      method: 'POST',
      url: `/hook/${id}`,
      payload: { event: 'test' },
    });

    // 3. Get request ID
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/endpoints/${id}/requests`,
      headers: { authorization: `Bearer ${manage_token}` },
    });
    const reqList = JSON.parse(listRes.payload);
    const requestId = reqList.items[0].id;

    // 4. Attempt replay to private IP
    const replayRes = await app.inject({
      method: 'POST',
      url: `/api/endpoints/${id}/requests/${requestId}/replay`,
      headers: { authorization: `Bearer ${manage_token}` },
      payload: { target_url: 'http://127.0.0.1:8080/evil' },
    });

    expect(replayRes.statusCode).toBe(422);
    const body = JSON.parse(replayRes.payload);
    expect(body.error).toBe('URL ditolak');
    expect(body.message).toContain('diblokir');
  });

  it('rejects replay if target URL is AWS metadata service', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/endpoints',
    });
    const { id, manage_token } = JSON.parse(createRes.payload);

    await app.inject({
      method: 'POST',
      url: `/hook/${id}`,
      payload: { hello: 'world' },
    });

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/endpoints/${id}/requests`,
      headers: { authorization: `Bearer ${manage_token}` },
    });
    const requestId = JSON.parse(listRes.payload).items[0].id;

    const replayRes = await app.inject({
      method: 'POST',
      url: `/api/endpoints/${id}/requests/${requestId}/replay`,
      headers: { authorization: `Bearer ${manage_token}` },
      payload: { target_url: 'http://169.254.169.254/latest/meta-data' },
    });

    expect(replayRes.statusCode).toBe(422);
  });
});
