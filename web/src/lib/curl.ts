/**
 * Helper to generate a reproducible cURL command from a captured RequestItem.
 */
import type { RequestItem } from './api';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/**
 * Escapes a string for use inside single quotes in bash / POSIX sh.
 */
function escapeBashArg(str: string): string {
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

/**
 * Parses query object or string safely.
 */
function parseQuery(query: unknown): Record<string, unknown> {
  if (!query) return {};
  if (typeof query === 'string') {
    try {
      return JSON.parse(query);
    } catch {
      return {};
    }
  }
  if (typeof query === 'object') {
    return query as Record<string, unknown>;
  }
  return {};
}

/**
 * Parses headers object or string safely.
 */
export function parseHeaders(headers: unknown): Record<string, string> {
  if (!headers) return {};
  let parsed = headers;
  if (typeof headers === 'string') {
    try {
      parsed = JSON.parse(headers);
    } catch {
      return {};
    }
  }
  if (typeof parsed !== 'object' || parsed === null) return {};

  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(parsed)) {
    if (val !== undefined && val !== null) {
      result[key] = String(val);
    }
  }
  return result;
}

/**
 * Generates a full cURL command string for a captured request.
 */
export function generateCurl(request: RequestItem, hookUrl?: string): string {
  const method = request.method.toUpperCase();

  // Construct target URL
  let targetUrl = request.path;
  try {
    const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const origin = hookUrl ? new URL(hookUrl).origin : fallbackOrigin;
    const urlObj = new URL(request.path, origin);

    const queryObj = parseQuery(request.query);
    for (const [k, v] of Object.entries(queryObj)) {
      if (v !== undefined && v !== null && v !== '') {
        urlObj.searchParams.set(k, String(v));
      }
    }
    targetUrl = urlObj.toString();
  } catch {
    targetUrl = request.path;
  }

  const lines: string[] = [`curl -X ${method} ${escapeBashArg(targetUrl)}`];

  // Add Headers (ignoring hop-by-hop headers)
  const headers = parseHeaders(request.headers);
  for (const [key, val] of Object.entries(headers)) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    lines.push(`  -H ${escapeBashArg(`${key}: ${val}`)}`);
  }

  // Add Body
  if (request.body && request.body.length > 0) {
    lines.push(`  --data ${escapeBashArg(request.body)}`);
  }

  return lines.join(' \\\n');
}
