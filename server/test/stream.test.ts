import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { buildApp } from '../src/app.js';
import { migrate, closeClient } from '../src/db/client.js';
import { sseService } from '../src/services/sse.js';

process.env.DATABASE_URL = ':memory:';
process.env.NODE_ENV = 'test';

let app: ReturnType<typeof buildApp>;
let serverPort: number;
let serverBaseUrl: string;

beforeAll(async () => {
  await migrate();
  app = buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address() as { port: number };
  serverPort = address.port;
  serverBaseUrl = `http://127.0.0.1:${serverPort}`;
});

afterAll(async () => {
  sseService.clearAllClients();
  await app.close();
  closeClient();
});

describe('SSE Stream API (Fase 4)', () => {
  let endpointId: string;
  let manageToken: string;

  beforeAll(async () => {
    // Create an endpoint
    const createRes = await fetch(`${serverBaseUrl}/api/endpoints`, {
      method: 'POST',
    });
    const data = (await createRes.json()) as { id: string; manage_token: string };
    endpointId = data.id;
    manageToken = data.manage_token;
  });

  describe('Authentication and Headers', () => {
    it('returns 401 without token', async () => {
      const res = await fetch(`${serverBaseUrl}/api/endpoints/${endpointId}/stream`);
      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const res = await fetch(`${serverBaseUrl}/api/endpoints/${endpointId}/stream`, {
        headers: { authorization: 'Bearer invalid-token' },
      });
      expect(res.status).toBe(401);
    });

    it('connects successfully via Authorization header and sets correct SSE headers', async () => {
      const controller = new AbortController();
      const res = await fetch(`${serverBaseUrl}/api/endpoints/${endpointId}/stream`, {
        headers: { authorization: `Bearer ${manageToken}` },
        signal: controller.signal,
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      expect(res.headers.get('x-accel-buffering')).toBe('no');
      expect(res.headers.get('cache-control')).toContain('no-cache');

      controller.abort();
    });

    it('connects successfully via ?token= query parameter', async () => {
      const controller = new AbortController();
      const res = await fetch(`${serverBaseUrl}/api/endpoints/${endpointId}/stream?token=${manageToken}`, {
        signal: controller.signal,
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      controller.abort();
    });
  });

  describe('Live Request Streaming', () => {
    it('pushes incoming webhook request in real-time to active subscriber', async () => {
      const receivedChunks: string[] = [];

      // Open SSE connection using node http client to easily read chunks
      const req = http.request(`${serverBaseUrl}/api/endpoints/${endpointId}/stream?token=${manageToken}`, {
        headers: { Accept: 'text/event-stream' },
      });

      const chunkPromise = new Promise<string>((resolve) => {
        req.on('response', (res) => {
          res.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            receivedChunks.push(text);
            if (text.includes('event: request')) {
              resolve(text);
            }
          });
        });
      });

      req.end();

      // Wait a moment for connection to register in SSE service
      await new Promise((r) => setTimeout(r, 80));
      expect(sseService.getSubscriberCount(endpointId)).toBeGreaterThanOrEqual(1);

      // Send a webhook to /hook/:id
      const payload = JSON.stringify({ live: true, test_id: 'stream-check' });
      await fetch(`${serverBaseUrl}/hook/${endpointId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      });

      // Await live event
      const requestEvent = await chunkPromise;
      expect(requestEvent).toContain('event: request');
      expect(requestEvent).toContain('stream-check');

      // Clean up connection
      req.destroy();
    });
  });

  describe('Heartbeat', () => {
    it('sends : ping comment', async () => {
      const receivedPings: string[] = [];

      const req = http.request(`${serverBaseUrl}/api/endpoints/${endpointId}/stream?token=${manageToken}`);

      const pingPromise = new Promise<string>((resolve) => {
        req.on('response', (res) => {
          res.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            if (text.includes(': ping')) {
              receivedPings.push(text);
              resolve(text);
            }
          });
        });
      });

      req.end();

      // Wait for registration
      await new Promise((r) => setTimeout(r, 80));

      // Trigger heartbeat
      sseService.sendHeartbeatNow(endpointId);

      const pingResult = await pingPromise;
      expect(pingResult).toContain(': ping');

      req.destroy();
    });
  });

  describe('Last-Event-ID Replay', () => {
    it('replays missed requests when connecting with Last-Event-ID', async () => {
      // Send 2 requests to generate events with sequential IDs
      const res1 = await fetch(`${serverBaseUrl}/hook/${endpointId}`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'first-msg',
      });
      expect(res1.status).toBe(200);

      // Get latest request ID from list API
      const listRes = await fetch(`${serverBaseUrl}/api/endpoints/${endpointId}/requests?limit=1`, {
        headers: { authorization: `Bearer ${manageToken}` },
      });
      const listData = (await listRes.json()) as { items: Array<{ id: number }> };
      const lastKnownId = listData.items[0].id;

      // Send 2 newer requests after lastKnownId
      await fetch(`${serverBaseUrl}/hook/${endpointId}`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'replayed-msg-1',
      });

      await fetch(`${serverBaseUrl}/hook/${endpointId}`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'replayed-msg-2',
      });

      // Reconnect with Last-Event-ID header
      const receivedData: string[] = [];
      const req = http.request(`${serverBaseUrl}/api/endpoints/${endpointId}/stream?token=${manageToken}`, {
        headers: {
          'Last-Event-ID': String(lastKnownId),
        },
      });

      const replayPromise = new Promise<void>((resolve) => {
        req.on('response', (res) => {
          res.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            receivedData.push(text);
            const joined = receivedData.join('');
            if (joined.includes('replayed-msg-1') && joined.includes('replayed-msg-2')) {
              resolve();
            }
          });
        });
      });

      req.end();

      await replayPromise;
      const allText = receivedData.join('');
      expect(allText).toContain('replayed-msg-1');
      expect(allText).toContain('replayed-msg-2');

      req.destroy();
    });
  });
});
