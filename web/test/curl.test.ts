import { describe, it, expect } from 'vitest';
import { generateCurl, parseHeaders } from '../src/lib/curl';
import type { RequestItem } from '../src/lib/api';

describe('cURL Generator', () => {
  const baseRequest: RequestItem = {
    id: 1,
    endpoint_id: 'ep_test123',
    method: 'POST',
    path: '/hook/ep_test123',
    query: {},
    headers: {
      'content-type': 'application/json',
      'user-agent': 'GitHub-Hookshot/1.0',
      'host': 'localhost:3000',
    },
    body: '{"event":"push","ref":"refs/heads/main"}',
    content_type: 'application/json',
    ip: '127.0.0.1',
    size_bytes: 40,
    signature_valid: null,
    received_at: '2026-10-06T12:00:00Z',
  };

  it('generates curl for POST with JSON body and excludes hop-by-hop headers', () => {
    const curl = generateCurl(baseRequest, 'http://localhost:3000/hook/ep_test123');
    expect(curl).toContain("curl -X POST 'http://localhost:3000/hook/ep_test123'");
    expect(curl).toContain("-H 'content-type: application/json'");
    expect(curl).toContain("-H 'user-agent: GitHub-Hookshot/1.0'");
    expect(curl).not.toContain("-H 'host:");
    expect(curl).toContain("--data '{\"event\":\"push\",\"ref\":\"refs/heads/main\"}'");
  });

  it('generates curl for GET with query parameters and no body', () => {
    const getRequest: RequestItem = {
      ...baseRequest,
      method: 'GET',
      query: { token: 'secret123', limit: 10 },
      headers: { accept: '*/*' },
      body: null,
    };
    const curl = generateCurl(getRequest, 'http://localhost:3000/hook/ep_test123');
    expect(curl).toContain("curl -X GET 'http://localhost:3000/hook/ep_test123?token=secret123&limit=10'");
    expect(curl).toContain("-H 'accept: */*'");
    expect(curl).not.toContain('--data');
  });

  it('safely escapes single quotes in body', () => {
    const reqWithQuotes: RequestItem = {
      ...baseRequest,
      body: "Hello 'world' with quotes",
    };
    const curl = generateCurl(reqWithQuotes, 'http://localhost:3000/hook/ep_test123');
    expect(curl).toContain("--data 'Hello '\\''world'\\'' with quotes'");
  });

  it('parses headers whether stored as object or json string', () => {
    const parsedFromObj = parseHeaders({ 'x-test': '123' });
    expect(parsedFromObj).toEqual({ 'x-test': '123' });

    const parsedFromStr = parseHeaders('{"x-foo":"bar"}');
    expect(parsedFromStr).toEqual({ 'x-foo': 'bar' });

    const parsedFromNull = parseHeaders(null);
    expect(parsedFromNull).toEqual({});
  });
});
