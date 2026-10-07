/**
 * cleanup.ts
 *
 * Periodic TTL cleanup job.
 * Deletes endpoints that have passed their `expires_at` timestamp,
 * and their associated requests (via ON DELETE CASCADE).
 *
 * Runs every 10 minutes by default.
 */
import { getClient } from '../db/client.js';

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

let _timer: ReturnType<typeof setInterval> | null = null;

/**
 * Delete all expired endpoints (and cascade-delete their requests).
 * Returns the number of endpoints deleted.
 */
export async function runCleanup(): Promise<number> {
  const db = getClient();
  const now = new Date().toISOString();

  const result = await db.execute({
    sql: `DELETE FROM endpoints WHERE expires_at < ?`,
    args: [now],
  });

  return Number(result.rowsAffected ?? 0);
}

/**
 * Start the periodic cleanup job.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startCleanupJob(logger?: { info: (msg: string) => void }): void {
  if (_timer !== null) return;

  _timer = setInterval(async () => {
    try {
      const deleted = await runCleanup();
      if (deleted > 0) {
        logger?.info(`[cleanup] Deleted ${deleted} expired endpoint(s)`);
      }
    } catch (err) {
      logger?.info(`[cleanup] Error during cleanup: ${String(err)}`);
    }
  }, CLEANUP_INTERVAL_MS);

  // Prevent the timer from keeping the process alive on its own
  _timer.unref?.();
}

/**
 * Stop the cleanup job (useful in tests).
 */
export function stopCleanupJob(): void {
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
  }
}
