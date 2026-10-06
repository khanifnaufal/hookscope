import type { ServerResponse } from 'node:http';
import { getClient } from '../db/client.js';

interface SseClient {
  id: string;
  response: ServerResponse;
  heartbeatTimer: NodeJS.Timeout;
}

function safeJsonParse(val: unknown, fallback: Record<string, unknown> = {}): unknown {
  if (typeof val !== 'string') return val ?? fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function formatRequestData(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    endpoint_id: row.endpoint_id,
    method: row.method,
    path: row.path,
    query: safeJsonParse(row.query),
    headers: safeJsonParse(row.headers),
    body: row.body ?? null,
    content_type: row.content_type ?? null,
    ip: row.ip ?? null,
    size_bytes: Number(row.size_bytes ?? 0),
    signature_valid:
      row.signature_valid === null || row.signature_valid === undefined
        ? null
        : Boolean(row.signature_valid),
    received_at: row.received_at,
  };
}

class SseService {
  // Map of endpointId -> Set of active SseClients
  private clients = new Map<string, Set<SseClient>>();

  /**
   * Format and send an SSE message to a specific HTTP response stream.
   */
  public sendEvent(
    res: ServerResponse,
    event: string,
    data: unknown,
    id?: string | number,
  ): void {
    if (res.writableEnded || res.destroyed) return;

    let payload = '';
    if (id !== undefined && id !== null) {
      payload += `id: ${id}\n`;
    }
    payload += `event: ${event}\n`;
    payload += `data: ${JSON.stringify(data)}\n\n`;

    res.write(payload);
  }

  /**
   * Send SSE comment ping to keep connection alive.
   */
  public sendHeartbeat(res: ServerResponse): void {
    if (res.writableEnded || res.destroyed) return;
    res.write(': ping\n\n');
  }

  /**
   * Register a new subscriber to an endpoint's SSE stream.
   * Handles missed events via Last-Event-ID and sets up 15s heartbeat.
   */
  public async addClient(
    endpointId: string,
    res: ServerResponse,
    lastEventId?: string | null,
  ): Promise<void> {
    // Set required headers for SSE and disable proxy buffering
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    // Send initial connection event
    this.sendEvent(res, 'connected', { endpoint_id: endpointId });

    // Handle replay for reconnection with Last-Event-ID
    if (lastEventId) {
      const parsedId = parseInt(lastEventId, 10);
      if (!Number.isNaN(parsedId)) {
        await this.replayMissedRequests(endpointId, parsedId, res);
      }
    }

    // Setup 15s heartbeat timer
    const heartbeatTimer = setInterval(() => {
      this.sendHeartbeat(res);
    }, 15000);

    const client: SseClient = {
      id: Math.random().toString(36).substring(2),
      response: res,
      heartbeatTimer,
    };

    if (!this.clients.has(endpointId)) {
      this.clients.set(endpointId, new Set());
    }
    this.clients.get(endpointId)!.add(client);

    // Clean up on disconnect
    res.on('close', () => {
      clearInterval(heartbeatTimer);
      const endpointClients = this.clients.get(endpointId);
      if (endpointClients) {
        endpointClients.delete(client);
        if (endpointClients.size === 0) {
          this.clients.delete(endpointId);
        }
      }
    });
  }

  /**
   * Replay requests that arrived after lastEventId.
   */
  private async replayMissedRequests(
    endpointId: string,
    sinceId: number,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const db = getClient();
      const result = await db.execute({
        sql: `SELECT id, endpoint_id, method, path, query, headers, body, content_type, ip, size_bytes, signature_valid, received_at
              FROM requests
              WHERE endpoint_id = ? AND id > ?
              ORDER BY id ASC`,
        args: [endpointId, sinceId],
      });

      for (const row of result.rows) {
        const formatted = formatRequestData(row as Record<string, unknown>);
        this.sendEvent(res, 'request', formatted, formatted.id);
      }
    } catch {
      // Ignore replay errors if DB is busy or query fails
    }
  }

  /**
   * Broadcast a newly captured request to all active subscribers of the endpoint.
   */
  public broadcast(endpointId: string, requestData: Record<string, unknown>): void {
    const endpointClients = this.clients.get(endpointId);
    if (!endpointClients || endpointClients.size === 0) return;

    const formatted = formatRequestData(requestData);

    for (const client of endpointClients) {
      this.sendEvent(client.response, 'request', formatted, formatted.id);
    }
  }

  /**
   * Get active subscriber count for an endpoint (useful for tests/metrics).
   */
  public getSubscriberCount(endpointId: string): number {
    return this.clients.get(endpointId)?.size ?? 0;
  }
}

export const sseService = new SseService();
