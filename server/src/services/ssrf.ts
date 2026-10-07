/**
 * ssrf.ts
 *
 * SSRF (Server-Side Request Forgery) protection for the replay feature.
 *
 * Validates a target URL before the server makes an outbound HTTP request:
 *  1. Only http:// and https:// schemes are allowed.
 *  2. The hostname is resolved via DNS and every resulting IP is checked against
 *     private/loopback/link-local ranges. Any match → rejected.
 *  3. Redirects to private IPs are caught by re-validating each `location` hop
 *     before following it (done at the fetch call-site with redirect: 'manual').
 *
 * Blocked ranges (IPv4 and IPv6):
 *  - Loopback    : 127.0.0.0/8  ::1
 *  - Private     : 10.0.0.0/8  172.16.0.0/12  192.168.0.0/16
 *  - Link-local  : 169.254.0.0/16  fe80::/10
 *  - Unspecified : 0.0.0.0/8
 *
 * DECISION-005: We perform DNS resolution server-side using Node's dns.promises.
 * This is not 100% race-condition-proof (TOCTOU) in theory, but is considered
 * acceptable for a single-process developer-tool context. For a hardened
 * production environment, use a dedicated egress proxy with egress filtering.
 */

import dns from 'node:dns/promises';
import net from 'node:net';

export class SsrfError extends Error {
  constructor(
    message: string,
    public readonly status: number = 422,
  ) {
    super(message);
    this.name = 'SsrfError';
  }
}

/**
 * Parse an IPv4 address string into a 32-bit unsigned integer.
 */
function ipv4ToInt(ip: string): number {
  return ip
    .split('.')
    .reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

/**
 * Returns true if an IPv4 address falls in a private/loopback/link-local range.
 */
function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);

  // 0.0.0.0/8  — unspecified / "this" network
  if ((n & 0xff000000) >>> 0 === 0x00000000) return true;
  // 127.0.0.0/8  — loopback
  if ((n & 0xff000000) >>> 0 === 0x7f000000) return true;
  // 10.0.0.0/8  — RFC 1918
  if ((n & 0xff000000) >>> 0 === 0x0a000000) return true;
  // 172.16.0.0/12  — RFC 1918
  if ((n & 0xfff00000) >>> 0 === 0xac100000) return true;
  // 192.168.0.0/16  — RFC 1918
  if ((n & 0xffff0000) >>> 0 === 0xc0a80000) return true;
  // 169.254.0.0/16  — link-local / AWS IMDS
  if ((n & 0xffff0000) >>> 0 === 0xa9fe0000) return true;

  return false;
}

/**
 * Returns true if an IPv6 address is loopback or link-local.
 * Uses Node's normalised form from dns.resolve6().
 */
function isPrivateIPv6(ip: string): boolean {
  const normalised = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalised === '::1') return true;
  if (normalised === '::') return true;
  // fe80::/10  — link-local
  if (/^fe[89ab]/i.test(normalised)) return true;
  // fc00::/7  — unique local (ULA, analogous to private IPv4)
  if (/^f[cd]/i.test(normalised)) return true;
  return false;
}

/**
 * Returns true if an IP address (v4 or v6) should be blocked for SSRF reasons.
 */
export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return false; // unknown format — do not block (will fail at fetch anyway)
}

/**
 * Validate a target URL for safety before making an outbound HTTP request.
 *
 * Throws `SsrfError` if:
 *  - The URL is not valid
 *  - The scheme is not http or https
 *  - The hostname resolves to any blocked IP
 *
 * Returns the validated URL object on success.
 */
export async function validateTargetUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError('URL tidak valid');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfError('Hanya protokol http dan https yang diizinkan');
  }

  const hostname = url.hostname;

  // If the hostname is already an IP, validate it directly (no DNS needed)
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new SsrfError(
        `Target URL mengarah ke alamat IP yang diblokir: ${hostname}`,
      );
    }
    return url;
  }

  // Resolve DNS and check every returned address
  const addresses: string[] = [];
  try {
    const v4 = await dns.resolve4(hostname).catch(() => [] as string[]);
    const v6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    addresses.push(...v4, ...v6);
  } catch {
    throw new SsrfError(`Tidak dapat me-resolve hostname: ${hostname}`);
  }

  if (addresses.length === 0) {
    throw new SsrfError(`Hostname tidak dapat di-resolve: ${hostname}`);
  }

  for (const ip of addresses) {
    if (isBlockedIp(ip)) {
      throw new SsrfError(
        `Target URL mengarah ke alamat IP yang diblokir (${ip}). Hanya URL publik yang diizinkan.`,
      );
    }
  }

  return url;
}
