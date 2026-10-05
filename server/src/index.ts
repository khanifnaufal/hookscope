import { buildApp } from './app.js';
import { config } from './config.js';

const app = buildApp();

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`🔭 Hookscope server running at ${config.publicBaseUrl}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
