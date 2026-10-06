import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { endpointsRoutes } from './routes/endpoints.js';
import { hookRoutes } from './routes/hook.js';
import { requestsRoutes } from './routes/requests.js';

export function buildApp() {
  const isDev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

  const app = Fastify({
    bodyLimit: 1048576, // 1 MB limit
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
      // Only load pino-pretty in dev mode — not available in test/vitest environment
      transport: isDev ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
    },
  });

  // Handle 413 Payload Too Large explicitly
  app.setErrorHandler((error, _request, reply) => {
    if (error.statusCode === 413 || error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.status(413).send({ error: 'Payload Too Large', message: 'Body exceeds 1 MB limit' });
    }
    return reply.send(error);
  });

  // Register plugins
  app.register(sensible);

  // Scoped API routes with CORS protection
  app.register(async (apiApp) => {
    await apiApp.register(cors, {
      origin: process.env.NODE_ENV === 'production' ? false : true,
    });
    await apiApp.register(endpointsRoutes);
    await apiApp.register(requestsRoutes);
  });

  // Webhook capture routes (public, raw HTTP methods including OPTIONS)
  app.register(hookRoutes);

  // Health check
  app.get('/health', async (_req, _reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
}
