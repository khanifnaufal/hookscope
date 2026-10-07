import crypto from 'node:crypto';

export type HmacAlgo = 'sha256' | 'sha1';

export interface HmacConfig {
  secret: string | null;
  algo: string | null;
  header: string | null;
}

/**
 * Constant-time string comparison using crypto.timingSafeEqual.
 * Mitigates timing attacks by avoiding early exit on length or content mismatch.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');

  if (bufA.length !== bufB.length) {
    // Perform dummy timingSafeEqual to maintain constant-ish execution time
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies an incoming webhook request signature against the endpoint HMAC configuration.
 *
 * Return values:
 * - null: HMAC is not configured on the endpoint, OR the configured signature header
 *         was not provided in the request ("tidak ada signature")
 * - 1: Signature is valid (matches expected HMAC)
 * - 0: Signature is invalid (header was provided but did not match)
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string | null | undefined,
  headers: Record<string, string | string[] | undefined>,
  config: HmacConfig,
): 1 | 0 | null {
  // If HMAC secret or header is not configured, signature verification is not enabled
  if (!config.secret || !config.header) {
    return null;
  }

  // Find configured header in request headers (case-insensitive)
  const targetHeaderLower = config.header.toLowerCase().trim();
  let headerValue: string | undefined;

  for (const [key, val] of Object.entries(headers)) {
    if (key.toLowerCase().trim() === targetHeaderLower) {
      if (Array.isArray(val)) {
        headerValue = val[0];
      } else if (typeof val === 'string') {
        headerValue = val;
      }
      break;
    }
  }

  // If signature header is not present or empty string:
  // "header signature tidak ada menghasilkan status 'tidak ada signature' (bukan invalid)"
  if (!headerValue || headerValue.trim().length === 0) {
    return null;
  }

  const algo: HmacAlgo =
    config.algo?.toLowerCase() === 'sha1' ? 'sha1' : 'sha256';

  // Prepare body buffer for hashing
  let bodyBuffer: Buffer;
  if (Buffer.isBuffer(rawBody)) {
    bodyBuffer = rawBody;
  } else if (typeof rawBody === 'string') {
    bodyBuffer = Buffer.from(rawBody, 'utf-8');
  } else {
    bodyBuffer = Buffer.alloc(0);
  }

  // Compute expected HMAC digest in hex and base64
  const expectedHex = crypto
    .createHmac(algo, config.secret)
    .update(bodyBuffer)
    .digest('hex');

  const expectedBase64 = crypto
    .createHmac(algo, config.secret)
    .update(bodyBuffer)
    .digest('base64');

  let received = headerValue.trim();

  // Strip algorithm prefix if present (e.g. "sha256=", "sha1=", "sha256:", "sha1:")
  const prefixEqual = `${algo}=`;
  const prefixColon = `${algo}:`;
  if (received.toLowerCase().startsWith(prefixEqual)) {
    received = received.slice(prefixEqual.length).trim();
  } else if (received.toLowerCase().startsWith(prefixColon)) {
    received = received.slice(prefixColon.length).trim();
  }

  // Compare with expected hex (case-insensitive for hex characters)
  if (timingSafeEqualString(received.toLowerCase(), expectedHex.toLowerCase())) {
    return 1;
  }

  // Compare with expected base64
  if (timingSafeEqualString(received, expectedBase64)) {
    return 1;
  }

  return 0;
}
