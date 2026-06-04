// Server-side first-party tracking (ADR-070, ANALYTICS.md). `track()` is the only
// sanctioned way to record a product event into the engagement_events ledger — it
// validates against the taxonomy so coverage stays honest. Best-effort: analytics
// must never break a user action. It ALSO mirrors to GA4 server-side (Measurement
// Protocol, ADR-093) — the counterpart to the client's gtag mirror in trackClient —
// so events that never touch the browser (QR scans, referral attribution) still land.

import { recordEngagementEvent } from '@/lib/engagement/events'
import { isTrackedEvent } from './events'
import { gaServerEnabled, sendGa4Event } from './ga-server'
import { hasConsent } from '@/lib/consent/consent'

/** Keep only primitive prop values, cap count + string length, so the ledger never
 *  stores nested junk or unbounded payloads. Exported for the /api/track endpoint. */
export function sanitizeProps(input: unknown, maxKeys = 20, maxLen = 500): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  if (!input || typeof input !== 'object') return out
  let n = 0
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (n >= maxKeys) break
    if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v
      n++
    } else if (typeof v === 'string') {
      out[k] = v.slice(0, maxLen)
      n++
    }
  }
  return out
}

/** Record a product event into engagement_events. Unknown events are dropped (not an
 *  error). Each call is a distinct ledger row (analytics events aren't deduped). */
export async function track(
  event: string,
  props: Record<string, unknown> = {},
  actorProfileId: string | null = null,
): Promise<void> {
  if (!isTrackedEvent(event)) return
  const clean = sanitizeProps(props)
  await recordEngagementEvent({
    idempotencyKey: `track:${event}:${actorProfileId ?? 'anon'}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    source: 'web',
    eventType: event,
    actorProfileId,
    context: clean,
  }).catch(() => {})
  // Mirror to GA4 server-side (parity with the client gtag mirror). Fire-and-forget,
  // and gated on the actor's analytics consent (ADR-069): a member who opted out of
  // analytics doesn't have their account-tied usage sent to Google. Anonymous events
  // carry no account, so they pass through.
  void mirrorToGa(event, clean, actorProfileId)
}

async function mirrorToGa(
  event: string,
  props: Record<string, string | number | boolean>,
  actorProfileId: string | null,
): Promise<void> {
  if (!gaServerEnabled()) return
  if (actorProfileId && !(await hasConsent(actorProfileId, 'analytics'))) return
  await sendGa4Event(event, props, actorProfileId)
}
