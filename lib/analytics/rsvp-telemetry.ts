import 'server-only'
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
