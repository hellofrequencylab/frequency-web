// Server-side first-party tracking (ADR-070, ANALYTICS.md). `track()` is the only
// sanctioned way to record a product event into the engagement_events ledger — it
// validates against the taxonomy so coverage stays honest. Best-effort: analytics
// must never break a user action. It ALSO mirrors to GA4 server-side (Measurement
// Protocol, ADR-093) — the counterpart to the client's gtag mirror in trackClient —
// so events that never touch the browser (QR scans, referral attribution) still land.

// NOT `import 'server-only'` YET, and that is a finding rather than an omission.
//
// Adding it here is the right end state: this module reaches the database, and it was the
// payload at the end of the five-hop chain from <WebVitals /> in the root layout. That
// chain is broken now (sanitizeProps moved to ./sanitize).
//
// But turning the guard on fails the build, because it catches a SECOND, pre-existing
// leak on a completely different path:
//
//   lib/analytics/track.ts        [Client Component Browser]
//     <- lib/practices.ts
//     <- lib/journey-plans.ts
//     <- components/journey/v2/journey-settings.tsx   ('use client')
//
// journey-settings needs exactly one thing from journey-plans -- `normalizeJourneyMeeting`,
// a pure function -- and journey-plans imports `adoptPracticesForJourney` from practices,
// which imports track(). So the same shape as the analytics leak: a client component
// dragging a database module in for the sake of one pure helper.
//
// Fixing that means extracting the meeting-normalisation helpers out of journey-plans, and
// it deserves its own change with its own verification rather than being smuggled in here.
// The guard goes on in that change, where it can be proven rather than asserted.

import { recordEngagementEvent } from '@/lib/engagement/events'
// sanitizeProps lives in ./sanitize (dependency-free) rather than here, so client code
// can reach it without dragging THIS module's database imports into the browser bundle.
// Imported for local use and re-exported, because callers already import it from track.
import { sanitizeProps } from './sanitize'
export { sanitizeProps } from './sanitize'
import { isTrackedEvent } from './events'
import { gaServerEnabled, sendGa4Event } from './ga-server'
import { hasConsent } from '@/lib/consent/consent'

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
