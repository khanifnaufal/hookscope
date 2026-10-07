import type { FastifyRequest, FastifyReply } from 'fastify';
import { getClient } from '../db/client.js';

/**
 * Verify that the request carries a valid Bearer token for the given endpoint.
 * Returns the manage_token row on success, throws 401 otherwise.
 */
export async function requireManageToken(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const params = req.params as { id?: string } | undefined;
  const endpointId = params?.id;
  const authHeader = req.headers.authorization ?? '';
  const query = req.query as { token?: string } | undefined;
  const queryToken = query?.token;
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (queryToken && queryToken.trim().length > 0 ? queryToken.trim() : null);

  if (!token) {
    return reply.status(401).send({ error: 'Missing authorization token' });
  }

  if (!endpointId) {
    return reply.status(401).send({ error: 'Missing endpoint ID' });
  }

  const db = getClient();
  const result = await db.execute({
    sql: 'SELECT id FROM endpoints WHERE id = ? AND manage_token = ?',
    args: [endpointId, token],
  });

  if (result.rows.length === 0) {
    return reply.status(401).send({ error: 'Invalid or missing token' });
  }
}
