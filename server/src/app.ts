import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { endpointsRoutes } from './routes/endpoints.js';
import { hookRoutes } from './routes/hook.js';
import { requestsRoutes } from './routes/requests.js';
import { streamRoutes } from './routes/stream.js';
import { replayRoutes } from './routes/replay.js';

export function buildApp() {
  const isTest = process.env.NODE_ENV === 'test';
  const isDev = !isTest && process.env.NODE_ENV !== 'production';

  const app = Fastify({
    bodyLimit: 1048576, // 1 MB limit
    logger: isTest
      ? false
      : {
          level: isDev ? 'debug' : 'info',
          // Structured JSON logging in production; pretty in dev
          transport: isDev
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
          // Production: emit JSON with standard fields
          serializers: isDev
            ? undefined
            : {
                req(req) {
                  return {
                    method: req.method,
                    url: req.url,
                    remoteAddress: req.socket?.remoteAddress,
                  };
                },
                res(res) {
                  return { statusCode: res.statusCode };
                },
              },
        },
  });

  // ── Error handler ──────────────────────────────────────────────────────────
  app.setErrorHandler((error, _request, reply) => {
    if (error.statusCode === 413 || error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply
        .status(413)
        .send({ error: 'Payload Too Large', message: 'Body exceeds 1 MB limit' });
    }
    return reply.send(error);
  });

  // ── Global plugins ─────────────────────────────────────────────────────────
  app.register(sensible);

  // ── Scoped API routes — CORS restricted to known origins ──────────────────
  app.register(async (apiApp) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : true; // allow all in dev / when not set

    await apiApp.register(cors, {
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    });

    await apiApp.register(endpointsRoutes);
    await apiApp.register(requestsRoutes);
    await apiApp.register(streamRoutes);
    await apiApp.register(replayRoutes);
  });

  // ── Webhook capture — no CORS (public, all origins by design) ─────────────
  app.register(hookRoutes);

  // ── Health check ───────────────────────────────────────────────────────────
  app.get('/health', async (_req, _reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // ── Serve frontend static build if web/dist exists ─────────────────────────
  const possibleDistPaths = [
    path.resolve(process.cwd(), 'web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist'),
  ];
  const webDistPath = possibleDistPaths.find((p) => fs.existsSync(p));

  if (webDistPath) {
    app.register(fastifyStatic, {
      root: webDistPath,
      wildcard: false,
    });

    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/hook')) {
        return reply.status(404).send({ error: 'Not Found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
