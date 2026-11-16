import 'server-only'
import { after } from 'next/server'
import { track } from './track'
import { readGaIdentity } from './ga-client-id'
import { recordExperimentOutcomes } from './experiment-runtime'

/** Call only after a confirmed member seat has persisted. Analytics cannot fail the RSVP. */
export async function recordConfirmedRsvp(eventId: string, profileId: string): Promise<void> {
  try {
    const gaIdentity = await readGaIdentity().catch(() => null)
    const recorded = await track('event.rsvp', { eventId }, profileId, {
      idempotencyKey: `event.rsvp:${eventId}:${profileId}`,
      gaIdentity,
    })
    if (recorded) await recordExperimentOutcomes('event.rsvp', profileId)
  } catch {
    // The seat is already saved; telemetry is best effort.
  }
}

/**
 * Register the confirmed-RSVP telemetry with the platform so it finishes inside the request
 * (LIVE-2307, point 5). It used to be a bare floating promise from the RSVP action. A serverless
 * instance can freeze the moment the action returns, and the experiment outcome reads `cookies()`
 * for consent, which is only readable while the request scope is alive. `after()` keeps both: the
 * invocation stays up past the response, and in a Server Function or Route Handler the callback
 * may still read request cookies. The RSVP itself is never delayed.
 *
 * FAIL-SAFE: outside a request scope `after()` throws. The seat is already saved, so that must not
 * surface; the write falls back to the old best-effort shape and says so in the log, which is the
 * signal that a caller reached this path without a request.
 */
export function scheduleConfirmedRsvp(eventId: string, profileId: string): void {
  try {
    after(() => recordConfirmedRsvp(eventId, profileId))
  } catch {
    console.warn('[events rsvp conversion] no request scope; telemetry is not held open')
    void recordConfirmedRsvp(eventId, profileId)
  }
}
