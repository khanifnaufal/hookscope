import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { verifyWebhookSignature, timingSafeEqualString } from '../src/services/hmac.js';

describe('timingSafeEqualString', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeEqualString('abcdef123', 'abcdef123')).toBe(true);
  });

  it('returns false for different strings of same length', () => {
    expect(timingSafeEqualString('abcdef123', 'abcdef456')).toBe(false);
  });

  it('returns false for different strings of different lengths', () => {
    expect(timingSafeEqualString('short', 'much_longer_string')).toBe(false);
  });
});

describe('verifyWebhookSignature', () => {
  const secret = 'super-secret-key';
  const body = JSON.stringify({ event: 'ping', id: 42 });

  it('returns null if HMAC is not configured (missing secret or header)', () => {
    const res1 = verifyWebhookSignature(body, { 'x-signature': 'abc' }, {
      secret: null,
      algo: 'sha256',
      header: 'x-signature',
    });
    expect(res1).toBeNull();

    const res2 = verifyWebhookSignature(body, { 'x-signature': 'abc' }, {
      secret,
      algo: 'sha256',
      header: null,
    });
    expect(res2).toBeNull();
  });

  it('returns null if signature header is missing ("tidak ada signature", not invalid)', () => {
    const res = verifyWebhookSignature(body, {}, {
      secret,
      algo: 'sha256',
      header: 'X-Hub-Signature-256',
    });
    expect(res).toBeNull();
  });

  it('verifies sha256 with "sha256=" prefix correctly', () => {
    const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const res = verifyWebhookSignature(
      body,
      { 'x-hub-signature-256': `sha256=${hash}` },
      {
        secret,
        algo: 'sha256',
        header: 'X-Hub-Signature-256',
      },
    );
    expect(res).toBe(1);
  });

  it('verifies sha256 raw hex case-insensitively', () => {
    const hash = crypto.createHmac('sha256', secret).update(body).digest('hex').toUpperCase();
    const res = verifyWebhookSignature(
      body,
      { 'x-signature': hash },
      {
        secret,
        algo: 'sha256',
        header: 'X-Signature',
      },
    );
    expect(res).toBe(1);
  });

  it('verifies sha1 correctly', () => {
    const hash = crypto.createHmac('sha1', secret).update(body).digest('hex');
    const res = verifyWebhookSignature(
      body,
      { 'x-hub-signature': `sha1=${hash}` },
      {
        secret,
        algo: 'sha1',
        header: 'X-Hub-Signature',
      },
    );
    expect(res).toBe(1);
  });

  it('verifies base64 signature correctly', () => {
    const hash = crypto.createHmac('sha256', secret).update(body).digest('base64');
    const res = verifyWebhookSignature(
      body,
      { 'x-signature': hash },
      {
        secret,
        algo: 'sha256',
        header: 'X-Signature',
      },
    );
    expect(res).toBe(1);
  });

  it('returns 0 for incorrect signature (invalid signature)', () => {
    const res = verifyWebhookSignature(
      body,
      { 'x-hub-signature-256': 'sha256=invalidhashvalue1234567890' },
      {
        secret,
        algo: 'sha256',
        header: 'X-Hub-Signature-256',
      },
    );
    expect(res).toBe(0);
  });
});
