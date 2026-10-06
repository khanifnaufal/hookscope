import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getClient } from '../db/client.js';
import { requireManageToken } from '../services/auth.js';

interface RequestParams {
  id: string;
  rid?: string;
}

interface ListRequestsQuery {
  limit?: string;
  offset?: string;
  method?: string;
  search?: string;
}

function safeJsonParse(val: unknown, fallback: Record<string, unknown> = {}): unknown {
  if (typeof val !== 'string') return val ?? fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function formatRequestRow(row: Record<string, unknown>) {
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
    signature_valid: row.signature_valid === null || row.signature_valid === undefined ? null : Boolean(row.signature_valid),
    received_at: row.received_at,
  };
}

export async function requestsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/endpoints/:id/requests
   * List requests for an endpoint with pagination, method filtering, and search.
   * Requires Bearer token.
   */
  app.get<{ Params: RequestParams; Querystring: ListRequestsQuery }>(
    '/api/endpoints/:id/requests',
    { preHandler: requireManageToken },
    async (req: FastifyRequest<{ Params: RequestParams; Querystring: ListRequestsQuery }>, reply: FastifyReply) => {
      const endpointId = req.params.id;
      const db = getClient();

      const rawLimit = parseInt(req.query.limit ?? '50', 10);
      const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 50 : Math.min(rawLimit, 100);

      const rawOffset = parseInt(req.query.offset ?? '0', 10);
      const offset = Number.isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;

      const method = req.query.method?.trim().toUpperCase();
      const search = req.query.search?.trim();

      const whereClauses: string[] = ['endpoint_id = ?'];
      const queryArgs: (string | number)[] = [endpointId];

      if (method) {
        whereClauses.push('method = ?');
        queryArgs.push(method);
      }

      if (search) {
        whereClauses.push('(body LIKE ? OR path LIKE ? OR query LIKE ?)');
        const searchPattern = `%${search}%`;
        queryArgs.push(searchPattern, searchPattern, searchPattern);
      }

      const whereSql = whereClauses.join(' AND ');

      // Total count
      const countResult = await db.execute({
        sql: `SELECT COUNT(*) as total FROM requests WHERE ${whereSql}`,
        args: queryArgs,
      });
      const total = Number(countResult.rows[0]?.total ?? 0);

      // Paginated items
      const itemsResult = await db.execute({
        sql: `SELECT id, endpoint_id, method, path, query, headers, body, content_type, ip, size_bytes, signature_valid, received_at
              FROM requests
              WHERE ${whereSql}
              ORDER BY received_at DESC, id DESC
              LIMIT ? OFFSET ?`,
        args: [...queryArgs, limit, offset],
      });

      const items = itemsResult.rows.map((row) => formatRequestRow(row as Record<string, unknown>));

      return reply.send({
        items,
        total,
        limit,
        offset,
      });
    },
  );

  /**
   * GET /api/endpoints/:id/requests/:rid
   * Retrieve a single captured request by ID.
   * Requires Bearer token.
   */
  app.get<{ Params: RequestParams }>(
    '/api/endpoints/:id/requests/:rid',
    { preHandler: requireManageToken },
    async (req: FastifyRequest<{ Params: RequestParams }>, reply: FastifyReply) => {
      const endpointId = req.params.id;
      const requestId = parseInt(req.params.rid ?? '', 10);

      if (Number.isNaN(requestId)) {
        return reply.status(404).send({ error: 'Request not found' });
      }

      const db = getClient();
      const result = await db.execute({
        sql: `SELECT id, endpoint_id, method, path, query, headers, body, content_type, ip, size_bytes, signature_valid, received_at
              FROM requests
              WHERE endpoint_id = ? AND id = ?`,
        args: [endpointId, requestId],
      });

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Request not found' });
      }

      return reply.send(formatRequestRow(result.rows[0] as Record<string, unknown>));
    },
  );
}
