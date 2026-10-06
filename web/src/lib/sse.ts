/**
 * SSE client for Hookscope live request stream.
 * Manages EventSource lifecycle and reconnection via Last-Event-ID.
 */
import type { RequestItem } from './api';

const BASE = import.meta.env.VITE_API_BASE ?? '';

export type SSEStatus = 'connecting' | 'live' | 'disconnected';

export interface SSEClient {
  close: () => void;
}

export function connectSSE(
  endpointId: string,
  token: string,
  onRequest: (req: RequestItem) => void,
  onStatus: (status: SSEStatus) => void,
  lastEventId?: string,
): SSEClient {
  let es: EventSource | null = null;
  let closed = false;

  function connect(lei?: string) {
    if (closed) return;
    onStatus('connecting');

    const params = new URLSearchParams({ token });
    if (lei) params.set('last_event_id', lei);

    es = new EventSource(`${BASE}/api/endpoints/${endpointId}/stream?${params}`);

    es.addEventListener('open', () => {
      if (!closed) onStatus('live');
    });

    es.addEventListener('request', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as RequestItem;
        onRequest(data);
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener('error', () => {
      es?.close();
      if (!closed) {
        onStatus('disconnected');
        // Reconnect after 3 seconds
        setTimeout(() => connect(lastEventId), 3000);
      }
    });
  }

  connect(lastEventId);

  return {
    close() {
      closed = true;
      es?.close();
    },
  };
}
