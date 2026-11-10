/**
 * Worker-side helpers for the Hunt outbox (FH-009). The database owns the queue (supabase/migrations/
 * 20270346036000_hunt_outbox.sql: leases, fencing tokens, receipts, dead letters); this file holds the
 * two things the worker computes outside it.
 */

/** Seconds to wait before attempt number `attempts + 1`: 5s doubling, capped at an hour. Mirrors hunt_outbox_backoff(). */
export function backoffSeconds(attempts: number): number {
  return Math.min(3600, 5 * 2 ** Math.max(attempts - 1, 0))
}

/**
 * The key a provider call carries as its idempotency key, and the second unique key on the receipt.
 * It names the effect, not the delivery: the same effect reached through a retry, a replay or a second
 * event id has the same key, so the provider and the receipt both collapse it to one.
 */
export function semanticKey(parts: { consumer: string; huntId: string; subject: string; effect: string; scope?: string }): string {
  const clean = (v: string) => v.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 60)
  return [parts.consumer, parts.huntId, parts.subject, parts.effect, parts.scope ?? 'once'].map(clean).join(':')
}
