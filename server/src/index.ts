import 'dotenv/config';
import { buildApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/client.js';
import { startCleanupJob } from './services/cleanup.js';

// Run DB migration before starting the server
await migrate();

const app = buildApp();

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`🔭 Hookscope server running at ${config.publicBaseUrl}`);

  // Start the TTL cleanup job (runs every 10 minutes, deletes expired endpoints)
  startCleanupJob({
    info: (msg: string) => app.log.info(msg),
  });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
