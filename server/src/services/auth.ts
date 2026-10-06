import type { FastifyRequest, FastifyReply } from 'fastify';
import { getClient } from '../db/client.js';

/**
 * Verify that the request carries a valid Bearer token for the given endpoint.
 * Returns the manage_token row on success, throws 401 otherwise.
 */
export async function requireManageToken(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return reply.status(401).send({ error: 'Missing authorization token' });
  }

  const db = getClient();
  const result = await db.execute({
    sql: 'SELECT id FROM endpoints WHERE id = ? AND manage_token = ?',
    args: [req.params.id, token],
  });

  if (result.rows.length === 0) {
    return reply.status(401).send({ error: 'Invalid or missing token' });
  }
}
