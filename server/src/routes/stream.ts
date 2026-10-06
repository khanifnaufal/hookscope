import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireManageToken } from '../services/auth.js';
import { sseService } from '../services/sse.js';

interface StreamParams {
  id: string;
}

interface StreamQuery {
  token?: string;
  last_event_id?: string;
}

export async function streamRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/endpoints/:id/stream
   * Stream live incoming webhook requests via Server-Sent Events (SSE).
   * Supports authentication via Bearer header or ?token= query param.
   * Supports reconnection via Last-Event-ID header or ?last_event_id= query param.
   */
  app.get<{ Params: StreamParams; Querystring: StreamQuery }>(
    '/api/endpoints/:id/stream',
    { preHandler: requireManageToken },
    async (
      req: FastifyRequest<{ Params: StreamParams; Querystring: StreamQuery }>,
      reply: FastifyReply,
    ) => {
      const endpointId = req.params.id;
      const lastEventId =
        (req.headers['last-event-id'] as string) ||
        req.query.last_event_id ||
        null;

      // Hijack the response to prevent Fastify from ending the stream
      reply.hijack();
      await sseService.addClient(endpointId, reply.raw, lastEventId);
    },
  );
}
