import { describe, it, expect } from 'vitest';
import type { RequestItem } from '../src/lib/api';

describe('Safe text escaping and body parsing logic', () => {
  function formatBody(body: string | null) {
    if (!body) {
      return { isJson: false, text: null, isEmpty: true };
    }
    try {
      const parsed = JSON.parse(body);
      return {
        isJson: true,
        text: JSON.stringify(parsed, null, 2),
        isEmpty: false,
      };
    } catch {
      return {
        isJson: false,
        text: body,
        isEmpty: false,
      };
    }
  }

  it('formats JSON body with 2 spaces pretty-print', () => {
    const raw = '{"hello":"world","count":42}';
    const res = formatBody(raw);
    expect(res.isJson).toBe(true);
    expect(res.isEmpty).toBe(false);
    expect(res.text).toBe('{\n  "hello": "world",\n  "count": 42\n}');
  });

  it('preserves malicious script tags as raw text without execution or html tags', () => {
    const scriptPayload = '<script>alert("XSS")</script>';
    const res = formatBody(scriptPayload);
    expect(res.isJson).toBe(false);
    expect(res.isEmpty).toBe(false);
    expect(res.text).toBe('<script>alert("XSS")</script>');
  });

  it('handles null and empty body safely', () => {
    expect(formatBody(null).isEmpty).toBe(true);
    expect(formatBody('').isEmpty).toBe(true);
  });

  it('handles deeply nested JSON with special characters and quotes', () => {
    const nested = JSON.stringify({
      html: '<b>bold</b>',
      quotes: 'it\'s "fine"',
      arr: [1, 2, '<img src=x onerror=alert(1)>'],
    });
    const res = formatBody(nested);
    expect(res.isJson).toBe(true);
    expect(res.text).toContain('<b>bold</b>');
    expect(res.text).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('Filter and search matching logic', () => {
  const sampleRequests: RequestItem[] = [
    {
      id: 1,
      endpoint_id: 'ep1',
      method: 'POST',
      path: '/hook/ep1/webhook/github',
      query: {},
      headers: {},
      body: '{"action":"opened","issue":{"number":101}}',
      content_type: 'application/json',
      ip: '192.168.1.1',
      size_bytes: 42,
      signature_valid: null,
      received_at: '2026-10-06T12:00:00Z',
    },
    {
      id: 2,
      endpoint_id: 'ep1',
      method: 'GET',
      path: '/hook/ep1/health',
      query: { check: 'db' },
      headers: {},
      body: null,
      content_type: null,
      ip: '10.0.0.1',
      size_bytes: 0,
      signature_valid: null,
      received_at: '2026-10-06T12:05:00Z',
    },
    {
      id: 3,
      endpoint_id: 'ep1',
      method: 'DELETE',
      path: '/hook/ep1/items/42',
      query: {},
      headers: {},
      body: 'item deleted',
      content_type: 'text/plain',
      ip: '172.16.0.5',
      size_bytes: 12,
      signature_valid: null,
      received_at: '2026-10-06T12:10:00Z',
    },
  ];

  function filterItems(items: RequestItem[], method: string, search: string) {
    return items.filter((req) => {
      if (method && req.method.toUpperCase() !== method.toUpperCase()) {
        return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const matchesPath = req.path.toLowerCase().includes(q);
        const matchesIp = (req.ip ?? '').toLowerCase().includes(q);
        const matchesBody = (req.body ?? '').toLowerCase().includes(q);
        if (!matchesPath && !matchesIp && !matchesBody) {
          return false;
        }
      }
      return true;
    });
  }

  it('filters by HTTP method', () => {
    const postOnly = filterItems(sampleRequests, 'POST', '');
    expect(postOnly.length).toBe(1);
    expect(postOnly[0].id).toBe(1);

    const getOnly = filterItems(sampleRequests, 'GET', '');
    expect(getOnly.length).toBe(1);
    expect(getOnly[0].id).toBe(2);

    const patchOnly = filterItems(sampleRequests, 'PATCH', '');
    expect(patchOnly.length).toBe(0);
  });

  it('filters by search keyword matching path', () => {
    const res = filterItems(sampleRequests, '', 'github');
    expect(res.length).toBe(1);
    expect(res[0].id).toBe(1);
  });

  it('filters by search keyword matching body text', () => {
    const res = filterItems(sampleRequests, '', '101');
    expect(res.length).toBe(1);
    expect(res[0].id).toBe(1);
  });

  it('filters by search keyword matching IP address', () => {
    const res = filterItems(sampleRequests, '', '172.16');
    expect(res.length).toBe(1);
    expect(res[0].id).toBe(3);
  });

  it('combines method and search filters', () => {
    const resMatch = filterItems(sampleRequests, 'POST', 'github');
    expect(resMatch.length).toBe(1);

    const resNoMatch = filterItems(sampleRequests, 'GET', 'github');
    expect(resNoMatch.length).toBe(0);
  });
});

describe('ARIA Tab Keyboard Navigation helper logic', () => {
  const tabs = ['body', 'headers', 'query'] as const;

  function getNextTab(currentKey: typeof tabs[number], key: string): typeof tabs[number] {
    const currentIndex = tabs.indexOf(currentKey);
    if (key === 'ArrowRight' || key === 'ArrowDown') {
      return tabs[(currentIndex + 1) % tabs.length];
    }
    if (key === 'ArrowLeft' || key === 'ArrowUp') {
      return tabs[(currentIndex - 1 + tabs.length) % tabs.length];
    }
    if (key === 'Home') {
      return tabs[0];
    }
    if (key === 'End') {
      return tabs[tabs.length - 1];
    }
    return currentKey;
  }

  it('cycles forward on ArrowRight and wraps around', () => {
    expect(getNextTab('body', 'ArrowRight')).toBe('headers');
    expect(getNextTab('headers', 'ArrowRight')).toBe('query');
    expect(getNextTab('query', 'ArrowRight')).toBe('body');
  });

  it('cycles backward on ArrowLeft and wraps around', () => {
    expect(getNextTab('body', 'ArrowLeft')).toBe('query');
    expect(getNextTab('query', 'ArrowLeft')).toBe('headers');
    expect(getNextTab('headers', 'ArrowLeft')).toBe('body');
  });

  it('jumps to first tab on Home and last tab on End', () => {
    expect(getNextTab('headers', 'Home')).toBe('body');
    expect(getNextTab('headers', 'End')).toBe('query');
  });
});
