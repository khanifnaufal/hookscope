import { createClient, type Client } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { config } from '../config.js';

let _client: Client | null = null;

export function getClient(): Client {
  if (!_client) {
    _client = createClient({
      url: config.databaseUrl,
      authToken: config.tursoAuthToken,
    });
  }
  return _client;
}

/**
 * Run schema.sql migration on startup.
 * Uses IF NOT EXISTS so it is safe to call on every boot.
 */
export async function migrate(): Promise<void> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const schemaPath = join(__dirname, 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf-8');

  const db = getClient();

  // Split by statement and execute sequentially (libsql does not support multi-statement)
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await db.execute(statement);
  }
}
