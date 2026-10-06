import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { getClient } from '../db/client.js';
import { config } from '../config.js';
import { requireManageToken } from '../services/auth.js';

export async function endpointsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/endpoints
   * Create a new endpoint with a random ID and manage token.
   */
  app.post('/api/endpoints', async (_req, reply) => {
    const db = getClient();
    const id = nanoid(12);
    const manageToken = nanoid(32);
    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + config.endpointTtlDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    await db.execute({
      sql: `INSERT INTO endpoints (id, manage_token, created_at, expires_at)
            VALUES (?, ?, ?, ?)`,
      args: [id, manageToken, now, expiresAt],
    });

    return reply.status(201).send({
      id,
      manage_token: manageToken,
      hook_url: `${config.publicBaseUrl}/hook/${id}`,
      expires_at: expiresAt,
    });
  });

  /**
   * GET /api/endpoints/:id
   * Return endpoint detail and config. Requires Bearer token.
   * HMAC secret is masked if set.
   */
  app.get<{ Params: { id: string } }>(
    '/api/endpoints/:id',
    { preHandler: requireManageToken },
    async (req, reply) => {
      const db = getClient();
      const result = await db.execute({
        sql: `SELECT id, response_status, response_body, response_content_type,
                     response_delay_ms, hmac_algo, hmac_header,
                     CASE WHEN hmac_secret IS NOT NULL THEN '***' ELSE NULL END as hmac_secret,
                     created_at, expires_at
              FROM endpoints WHERE id = ?`,
        args: [req.params.id],
      });

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Endpoint not found' });
      }

      const row = result.rows[0];
      return {
        id: row.id,
        hook_url: `${config.publicBaseUrl}/hook/${row.id}`,
        response_status: row.response_status,
        response_body: row.response_body,
        response_content_type: row.response_content_type,
        response_delay_ms: row.response_delay_ms,
        hmac_secret: row.hmac_secret,
        hmac_algo: row.hmac_algo,
        hmac_header: row.hmac_header,
        created_at: row.created_at,
        expires_at: row.expires_at,
      };
    },
  );
}
