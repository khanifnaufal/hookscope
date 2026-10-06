import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { endpointsRoutes } from './routes/endpoints.js';
import { hookRoutes } from './routes/hook.js';

export function buildApp() {
  const isDev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
      // Only load pino-pretty in dev mode — not available in test/vitest environment
      transport: isDev ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
    },
  });

  // Register plugins
  app.register(cors, {
    origin: process.env.NODE_ENV === 'production' ? false : true,
  });

  app.register(sensible);

  // Routes
  app.register(endpointsRoutes);
  app.register(hookRoutes);

  // Health check
  app.get('/health', async (_req, _reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
}
