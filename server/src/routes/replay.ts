/**
 * replay.ts
 *
 * POST /api/endpoints/:id/requests/:rid/replay
 *
 * Replays a previously captured webhook request to a user-supplied target URL.
 *
 * Security:
 *  - Target URL is validated with SSRF protection (validateTargetUrl).
 *  - Redirects are followed manually; each Location header is re-validated
 *    before following to prevent redirect-based SSRF.
 *  - Response body is capped at 1 MB to prevent memory exhaustion.
 *  - Timeout: 5 seconds (AbortController).
 *  - Hop-by-hop headers are stripped before forwarding.
 *
 * Requires Bearer manage_token.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getClient } from '../db/client.js';
import { requireManageToken } from '../services/auth.js';
import { validateTargetUrl, SsrfError } from '../services/ssrf.js';

// Headers that must not be forwarded (hop-by-hop)
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host', // will be set by fetch to the target host
]);

const MAX_RESPONSE_BYTES = 1_048_576; // 1 MB
const TIMEOUT_MS = 5_000; // 5 seconds
const MAX_REDIRECTS = 5;

const replayBodySchema = z.object({
  target_url: z.string().min(1, 'target_url wajib diisi').max(2048),
});

interface ReplayParams {
  id: string;
  rid: string;
}

export async function replayRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/endpoints/:id/requests/:rid/replay
   * Replay a captured request to a target URL.
   */
  app.post<{ Params: ReplayParams }>(
    '/api/endpoints/:id/requests/:rid/replay',
    { preHandler: requireManageToken },
    async (req: FastifyRequest<{ Params: ReplayParams }>, reply: FastifyReply) => {
      const endpointId = req.params.id;
      const requestId = parseInt(req.params.rid, 10);

      if (Number.isNaN(requestId)) {
        return reply.status(404).send({ error: 'Request not found' });
      }

      // Parse and validate body
      const parseResult = replayBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Invalid input',
          details: parseResult.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        });
      }

      const { target_url: rawTargetUrl } = parseResult.data;

      // Fetch the original captured request from DB first
      const db = getClient();
      const result = await db.execute({
        sql: `SELECT method, path, headers, body, content_type
              FROM requests
              WHERE endpoint_id = ? AND id = ?`,
        args: [endpointId, requestId],
      });

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Request not found' });
      }

      // Validate target URL against SSRF blocklist
      let targetUrl: URL;
      try {
        targetUrl = await validateTargetUrl(rawTargetUrl);
      } catch (err) {
        if (err instanceof SsrfError) {
          return reply.status(err.status).send({
            error: 'URL ditolak',
            message: err.message,
          });
        }
        throw err;
      }

      const captured = result.rows[0];
      const method = (captured.method as string) || 'GET';
      const capturedHeaders: Record<string, string> =
        typeof captured.headers === 'string'
          ? (JSON.parse(captured.headers) as Record<string, string>)
          : {};

      // Build safe forward headers (strip hop-by-hop, add x-replayed-by)
      const forwardHeaders: Record<string, string> = {
        'x-replayed-by': 'hookscope',
      };
      for (const [k, v] of Object.entries(capturedHeaders)) {
        if (!HOP_BY_HOP.has(k.toLowerCase())) {
          forwardHeaders[k] = v;
        }
      }
      if (captured.content_type) {
        forwardHeaders['content-type'] = captured.content_type as string;
      }

      // Replay with redirect safety (manual redirect + re-validate each hop)
      let currentUrl = targetUrl;
      let redirectsLeft = MAX_REDIRECTS;
      let fetchResponse: Response | null = null;
      let followRedirect = true;

      while (followRedirect) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
          fetchResponse = await fetch(currentUrl.toString(), {
            method,
            headers: forwardHeaders,
            body: ['GET', 'HEAD', 'DELETE', 'OPTIONS'].includes(method.toUpperCase())
              ? undefined
              : (captured.body as string | null) ?? undefined,
            redirect: 'manual', // handle redirects ourselves for SSRF safety
            signal: controller.signal,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const isTimeout =
            err instanceof Error && (err.name === 'AbortError' || errMsg.includes('abort'));
          return reply.status(502).send({
            error: isTimeout ? 'Timeout' : 'Replay gagal',
            message: isTimeout
              ? `Request ke target melebihi batas waktu ${TIMEOUT_MS / 1000} detik`
              : `Gagal terhubung ke target: ${errMsg}`,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        // Follow redirect with SSRF check on each hop
        if (
          fetchResponse.status >= 300 &&
          fetchResponse.status < 400 &&
          fetchResponse.headers.has('location')
        ) {
          if (redirectsLeft <= 0) {
            return reply.status(502).send({
              error: 'Too many redirects',
              message: `Melebihi batas ${MAX_REDIRECTS} redirect`,
            });
          }

          const locationRaw = fetchResponse.headers.get('location')!;
          let locationUrl: URL;
          try {
            locationUrl = new URL(locationRaw, currentUrl.toString());
          } catch {
            return reply.status(502).send({
              error: 'Redirect tidak valid',
              message: `Header Location berisi URL tidak valid: ${locationRaw}`,
            });
          }

          try {
            await validateTargetUrl(locationUrl.toString());
          } catch (err) {
            if (err instanceof SsrfError) {
              return reply.status(err.status).send({
                error: 'Redirect ditolak (SSRF)',
                message: err.message,
              });
            }
            throw err;
          }

          currentUrl = locationUrl;
          redirectsLeft--;
          continue; // follow the safe redirect
        }

        followRedirect = false; // not a redirect — done
      }

      if (!fetchResponse) {
        return reply.status(502).send({ error: 'Replay gagal' });
      }

      // Read response body (capped at MAX_RESPONSE_BYTES)
      let responseBody = '';
      try {
        const reader = fetchResponse.body?.getReader();
        if (reader) {
          let totalBytes = 0;
          const chunks: Uint8Array[] = [];
          let isReading = true;
          while (isReading) {
            const { done, value } = await reader.read();
            if (done) {
              isReading = false;
              break;
            }
            totalBytes += value.length;
            if (totalBytes > MAX_RESPONSE_BYTES) {
              responseBody = '[response truncated: exceeded 1 MB]';
              isReading = false;
              break;
            }
            chunks.push(value);
          }
          if (responseBody === '') {
            responseBody = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');
          }
        }
      } catch {
        responseBody = '[unable to read response body]';
      }

      // Collect safe response headers
      const responseHeaders: Record<string, string> = {};
      fetchResponse.headers.forEach((value, key) => {
        if (!HOP_BY_HOP.has(key.toLowerCase())) {
          responseHeaders[key] = value;
        }
      });

      return reply.send({
        ok: true,
        status: fetchResponse.status,
        status_text: fetchResponse.statusText,
        headers: responseHeaders,
        body: responseBody,
        target_url: currentUrl.toString(),
      });
    },
  );
}
