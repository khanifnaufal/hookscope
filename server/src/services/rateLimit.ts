/**
 * rateLimit.ts
 *
 * Lightweight in-memory sliding-window rate limiter.
 *
 * Two limiters:
 *  - hookLimiter:     60 requests/minute per endpoint ID (for /hook/:id)
 *  - createLimiter:   10 endpoint creations/hour per client IP (for POST /api/endpoints)
 *
 * Uses a Map of { key -> timestamps[] } and prunes old timestamps on each check.
 * For a single-process server this is sufficient. If horizontal scaling is ever
 * needed, replace with a Redis-based counter (recorded in DECISIONS.md).
 */

interface WindowEntry {
  timestamps: number[];
}

class SlidingWindowRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly store = new Map<string, WindowEntry>();

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Returns true if the request is allowed, false if rate-limited.
   * Mutates the store to record this attempt.
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }

    // Prune timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= this.maxRequests) {
      return false;
    }

    entry.timestamps.push(now);
    return true;
  }

  /**
   * Remaining requests allowed in the current window for a key.
   */
  remaining(key: string): number {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const entry = this.store.get(key);
    if (!entry) return this.maxRequests;
    const active = entry.timestamps.filter((t) => t > cutoff);
    return Math.max(0, this.maxRequests - active.length);
  }

  /**
   * Clear all state (useful in tests).
   */
  clear(): void {
    this.store.clear();
  }
}

/** 60 hook requests per minute, keyed by endpoint ID */
export const hookLimiter = new SlidingWindowRateLimiter(60_000, 60);

/** 10 endpoint creations per hour, keyed by client IP */
export const createLimiter = new SlidingWindowRateLimiter(60 * 60_000, 10);
