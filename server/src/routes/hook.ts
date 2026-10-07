import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getClient } from '../db/client.js';
import { sseService } from '../services/sse.js';
import { verifyWebhookSignature } from '../services/hmac.js';

interface HookParams {
  id: string;
}

export function parseRequestBody(
  body: unknown,
  contentType: string | undefined,
): { body: string | null; sizeBytes: number } {
  if (body === undefined || body === null) {
    return { body: null, sizeBytes: 0 };
  }

  if (Buffer.isBuffer(body)) {
    if (body.length === 0) {
      return { body: null, sizeBytes: 0 };
    }
    const sizeBytes = body.length;
    const isBinaryType =
      contentType &&
      /^(image|audio|video|application\/octet-stream|application\/zip|application\/pdf|application\/gzip)/i.test(
        contentType,
      );

    if (isBinaryType) {
      return { body: body.toString('base64'), sizeBytes };
    }

    try {
      return { body: body.toString('utf-8'), sizeBytes };
    } catch {
      return { body: body.toString('base64'), sizeBytes };
    }
  }

  if (typeof body === 'string') {
    if (body.length === 0) {
      return { body: null, sizeBytes: 0 };
    }
    return { body, sizeBytes: Buffer.byteLength(body, 'utf-8') };
  }

  // If parsed as JSON object or other Javascript value
  const serialized = JSON.stringify(body);
  return { body: serialized, sizeBytes: Buffer.byteLength(serialized, 'utf-8') };
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
      sql: `SELECT id, response_status, response_body, response_content_type, response_delay_ms,
                   hmac_secret, hmac_algo, hmac_header, expires_at
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

    // Verify HMAC signature if configured
    const hmacConfig = {
      secret: (endpoint.hmac_secret as string | null) ?? null,
      algo: (endpoint.hmac_algo as string | null) ?? null,
      header: (endpoint.hmac_header as string | null) ?? null,
    };
    const rawBuffer = Buffer.isBuffer(req.body) ? (req.body as Buffer) : null;
    const signatureValid = verifyWebhookSignature(rawBuffer ?? body, req.headers, hmacConfig);

    // Insert captured request into database
    const insertResult = await db.execute({
      sql: `INSERT INTO requests (
              endpoint_id, method, path, query, headers, body, content_type, ip, size_bytes, signature_valid, received_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        signatureValid,
        receivedAt,
      ],
    });

    const requestId = Number(insertResult.lastInsertRowid);
    const signatureBool =
      signatureValid === 1 ? true : signatureValid === 0 ? false : null;

    // Broadcast new request to all active SSE subscribers
    sseService.broadcast(endpointId, {
      id: requestId,
      endpoint_id: endpointId,
      method: req.method.toUpperCase(),
      path,
      query,
      headers,
      body,
      content_type: contentType ?? null,
      ip,
      size_bytes: sizeBytes,
      signature_valid: signatureBool,
      received_at: receivedAt,
    });

    // Enforce 500 requests cap per endpoint (FIFO: prune oldest)
    await db.execute({
      sql: `DELETE FROM requests
            WHERE endpoint_id = ?
              AND id NOT IN (
                SELECT id FROM requests
                WHERE endpoint_id = ?
                ORDER BY received_at DESC, id DESC
                LIMIT 500
              )`,
      args: [endpointId, endpointId],
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
