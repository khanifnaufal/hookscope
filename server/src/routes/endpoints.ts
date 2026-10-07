import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { getClient } from '../db/client.js';
import { config } from '../config.js';
import { requireManageToken } from '../services/auth.js';
import { createLimiter } from '../services/rateLimit.js';

const updateEndpointSchema = z.object({
  response_status: z
    .number()
    .int()
    .min(100, 'Status code harus antara 100 dan 599')
    .max(599, 'Status code harus antara 100 dan 599')
    .optional(),
  response_body: z.string().max(102400, 'Ukuran response body maksimal 100 KB').optional(),
  response_content_type: z.string().min(1, 'Content-Type tidak boleh kosong').max(256).optional(),
  response_delay_ms: z
    .number()
    .int()
    .min(0, 'Delay minimal 0 ms')
    .max(10000, 'Delay maksimal 10000 ms (10 detik)')
    .optional(),
  hmac_secret: z
    .union([z.string(), z.null()])
    .transform((v) => (v === '' ? null : v))
    .optional(),
  hmac_algo: z
    .union([z.enum(['sha256', 'sha1']), z.null(), z.literal('')])
    .transform((v) => (v === '' ? null : v))
    .optional(),
  hmac_header: z
    .union([z.string().max(128), z.null()])
    .transform((v) => (v === '' ? null : v))
    .optional(),
});

export async function endpointsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/endpoints
   * Create a new endpoint with a random ID and manage token.
   */
  app.post('/api/endpoints', async (req, reply) => {
    // Rate limit: 10 endpoint creations per hour per IP
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';

    if (!createLimiter.isAllowed(clientIp)) {
      return reply
        .status(429)
        .header('Retry-After', '3600')
        .header('X-RateLimit-Limit', '10')
        .header('X-RateLimit-Remaining', '0')
        .send({
          error: 'Rate limit exceeded',
          message: 'Max 10 endpoint creations per hour per IP',
        });
    }

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

  /**
   * PATCH /api/endpoints/:id
   * Update endpoint custom response and HMAC settings. Requires Bearer token.
   * HMAC secret is masked on response.
   */
  app.patch<{ Params: { id: string } }>(
    '/api/endpoints/:id',
    { preHandler: requireManageToken },
    async (req, reply) => {
      const parseResult = updateEndpointSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Invalid input',
          details: parseResult.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        });
      }

      const data = parseResult.data;
      const db = getClient();

      const fields: string[] = [];
      const args: (string | number | null)[] = [];

      if (data.response_status !== undefined) {
        fields.push('response_status = ?');
        args.push(data.response_status);
      }
      if (data.response_body !== undefined) {
        fields.push('response_body = ?');
        args.push(data.response_body);
      }
      if (data.response_content_type !== undefined) {
        fields.push('response_content_type = ?');
        args.push(data.response_content_type);
      }
      if (data.response_delay_ms !== undefined) {
        fields.push('response_delay_ms = ?');
        args.push(data.response_delay_ms);
      }
      if (data.hmac_secret !== undefined) {
        fields.push('hmac_secret = ?');
        args.push(data.hmac_secret);
      }
      if (data.hmac_algo !== undefined) {
        fields.push('hmac_algo = ?');
        args.push(data.hmac_algo);
      }
      if (data.hmac_header !== undefined) {
        fields.push('hmac_header = ?');
        args.push(data.hmac_header);
      }

      if (fields.length > 0) {
        args.push(req.params.id);
        await db.execute({
          sql: `UPDATE endpoints SET ${fields.join(', ')} WHERE id = ?`,
          args,
        });
      }

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
      return reply.send({
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
      });
    },
  );

  /**
   * DELETE /api/endpoints/:id
   * Delete endpoint and all associated requests. Requires Bearer token.
   */
  app.delete<{ Params: { id: string } }>(
    '/api/endpoints/:id',
    { preHandler: requireManageToken },
    async (req, reply) => {
      const db = getClient();
      const endpointId = req.params.id;

      // Clean up requests first, then endpoint
      await db.execute({
        sql: 'DELETE FROM requests WHERE endpoint_id = ?',
        args: [endpointId],
      });

      await db.execute({
        sql: 'DELETE FROM endpoints WHERE id = ?',
        args: [endpointId],
      });

      return reply.send({ ok: true });
    },
  );
}
