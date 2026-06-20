/**
 * Fixed-window rate limiter, IN-MEMORY and PER-INSTANCE.
 *
 * IMPORTANT: this is best-effort only. The counter lives in the process memory
 * of a single server instance, so it does NOT hold across a restart, a deploy,
 * or multiple instances behind a load balancer. Treat it as a cheap guardrail
 * against accidental floods, NOT a hard limit. Production needs a shared store
 * (Upstash/Redis) before this can be relied on for abuse prevention.
 */

type Window = { count: number; windowStart: number };

const windows = new Map<string, Window>();

/**
 * Returns true if the call is allowed under the limit for this key, false if it
 * has exceeded `limit` within the current `windowMs` window. Each distinct key
 * (e.g. `reports:<userId>`) gets its own window.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    windows.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  existing.count += 1;
  return true;
}
