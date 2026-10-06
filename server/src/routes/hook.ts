import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getClient } from '../db/client.js';

interface HookParams {
  id: string;
}

export function parseRequestBody(
  buffer: Buffer | string | undefined | null,
  contentType: string | undefined,
): { body: string | null; sizeBytes: number } {
  if (buffer === undefined || buffer === null) {
    return { body: null, sizeBytes: 0 };
  }

  const rawBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (rawBuffer.length === 0) {
    return { body: null, sizeBytes: 0 };
  }

  const sizeBytes = rawBuffer.length;
  const isBinaryType =
    contentType &&
    /^(image|audio|video|application\/octet-stream|application\/zip|application\/pdf|application\/gzip)/i.test(
      contentType,
    );

  if (isBinaryType) {
    return { body: rawBuffer.toString('base64'), sizeBytes };
  }

  try {
    return { body: rawBuffer.toString('utf-8'), sizeBytes };
  } catch {
    return { body: rawBuffer.toString('base64'), sizeBytes };
  }
}

export async function hookRoutes(app: FastifyInstance): Promise<void> {
  // Capture all media types as raw Buffer for webhook inspection with 1 MB limit
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: 1048576 }, (_req, payload, done) => {
    done(null, payload);
  });

  const handleHook = async (
    req: FastifyRequest<{ Params: HookParams }>,
    reply: FastifyReply,
  ) => {
    const endpointId = req.params.id;
    const db = getClient();

    // Check if endpoint exists and is not expired
    const endpointResult = await db.execute({
      sql: `SELECT id, response_status, response_body, response_content_type, response_delay_ms, expires_at
            FROM endpoints WHERE id = ?`,
      args: [endpointId],
    });

    if (endpointResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Endpoint not found' });
    }

    const endpoint = endpointResult.rows[0];
    const now = new Date();
    const expiresAt = new Date(endpoint.expires_at as string);

    if (now > expiresAt) {
      return reply.status(404).send({ error: 'Endpoint expired' });
    }

    const contentType = req.headers['content-type'];
    const { body, sizeBytes } = parseRequestBody(req.body as Buffer | undefined, contentType);
    const path = req.url.split('?')[0];
    const query = JSON.stringify(req.query ?? {});
    const headers = JSON.stringify(req.headers ?? {});
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      '';
    const receivedAt = now.toISOString();

    // Insert captured request into database
    await db.execute({
      sql: `INSERT INTO requests (
              endpoint_id, method, path, query, headers, body, content_type, ip, size_bytes, signature_valid, received_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      args: [
        endpointId,
        req.method.toUpperCase(),
        path,
        query,
        headers,
        body,
        contentType ?? null,
        ip,
        sizeBytes,
        receivedAt,
      ],
    });

    // Handle configured delay (max 10 seconds)
    const delayMs = Number(endpoint.response_delay_ms ?? 0);
    if (delayMs > 0) {
      const boundedDelay = Math.min(Math.max(delayMs, 0), 10000);
      await new Promise((resolve) => setTimeout(resolve, boundedDelay));
    }

    const status = Number(endpoint.response_status ?? 200);
    const respContentType = (endpoint.response_content_type as string) || 'application/json';
    const respBody = (endpoint.response_body as string) || '{"ok":true}';

    reply
      .status(status)
      .header('content-type', respContentType)
      .send(respBody);
  };

  // Support all HTTP methods
  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    url: '/hook/:id',
    handler: handleHook,
  });

  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    url: '/hook/:id/*',
    handler: handleHook,
  });
}
