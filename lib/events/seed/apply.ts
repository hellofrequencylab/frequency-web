// ─────────────────────────────────────────────────────────────────────────────
// THE EVENT SEEDER — APPLY: a reviewed draft becomes a real event (ADR-989).
//
// SERVER-ONLY. There is NO second event writer here, and that is the whole design of this
// file: it validates the reviewed draft, hands it to `createEventDraft` (lib/events/
// event-drafts.ts, the writer the poster scan has always used), and records the outcome on
// the intake. Every rule that writer already enforces (region scope, slug minting, owner
// scoping) therefore holds for a seeded event too.
//
// WHY THAT WRITER RATHER THAN `createEvent`. `createEvent` publishes immediately. A seeded
// event must land as an UNLISTED DEMO that an operator consciously flips live, which is
// exactly what `createEventDraft` produces: an `events` row at status='draft' with host_id
// NULL and posted_by_profile_id = the operator. A draft is in no catalog, no feed, and no
// search; it is visible only in the operator's own drafts. The operator publishes it from
// /events/drafts/<id> through the existing publish path, which mints the one-time claim
// token so the real organizer can take the event over. Demo posture and the claim handshake
// both come free from the writer that already existed.
//
// authz-delegated: the caller (app/(main)/admin/event-seeder/actions.ts) gates the operator;
// every write here binds to the intake id or to the event id this apply just created.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { createEventDraft } from '@/lib/events/event-drafts'
import { coerceEventDetails, coerceDomain, coerceIsoDate } from '@/lib/events/normalize'
import type { EventSeedDraft } from './intake'
import { getEventIntake, markEventIntakeApplied, setEventIntakeStatus } from './store'

export type ApplyEventIntakeResult =
  | { ok: true; eventId: string; alreadyApplied: boolean }
  | { ok: false; error: string }

/** What the writer cannot do without. Kept here (not in the writer) because the answer is a
 *  REVIEW message an operator can act on, not a silent null. Mirrors the publish gate's own
 *  reasoning: publishable means listable, so a seeded event needs a title and a real date. */
function validate(draft: EventSeedDraft): string | null {
  const title = (draft.title ?? '').trim()
  if (!title) return 'Give the event a title before you seed it.'
  const startsAt = coerceIsoDate(draft.startsAt ?? '')
  if (!startsAt) {
    return 'Set a start date and time before you seed it. Without one the event can never be published.'
  }
  return null
}

/**
 * Materialize one reviewed intake as an event DRAFT (an unlisted demo), then stamp the intake.
 *
 * IDEMPOTENT: an intake that already carries a target event returns it rather than writing a
 * second one, so a double-approve (or a retry) is safe. Only a row in 'review' may apply;
 * anything else returns a plain reason. Fail-safe: never throws to the caller.
 */
export async function applyEventIntake(
  intakeId: string,
  opts: { operatorProfileId: string },
): Promise<ApplyEventIntakeResult> {
  const row = await getEventIntake(intakeId)
  if (!row) return { ok: false, error: 'Staged event not found.' }
  if (row.targetEventId) return { ok: true, eventId: row.targetEventId, alreadyApplied: true }
  if (row.status !== 'review') {
    return { ok: false, error: `This one is '${row.status}', not ready to seed (expected 'review').` }
  }

  const draft = row.draft as unknown as EventSeedDraft
  const problem = validate(draft)
  if (problem) return { ok: false, error: problem }

  // Free wins over a stray price: the manifest's own reader renders a free event as "Free",
  // and the writer reads 0 cents the same way the scan flow's cleanPrice does.
  const priceCents = draft.isFree ? 0 : typeof draft.priceCents === 'number' ? draft.priceCents : null

  // THE POSTER TRAVELS, THE CHAT PHOTOS DO NOT (ADR-997). A scanned flyer's photo is already
  // stored, by the scan itself, in the private bucket, and this is the same writer that keeps
  // it when the scan builds a draft directly, so it is handed straight over. It is read back
  // off the service-role-only intake, where it was written server-side after an ownership
  // check; it never round-trips through a client. A chat photo has no stored object at all,
  // only the filename the export printed, so there is nothing here to hand over and the board
  // says as much rather than pretending otherwise.
  const posterPath = row.inputs?.posterPath ?? null

  const created = await createEventDraft(opts.operatorProfileId, {
    title: (draft.title ?? '').trim(),
    description: (draft.description ?? '').trim(),
    startsAt: coerceIsoDate(draft.startsAt ?? '') || null,
    endsAt: coerceIsoDate(draft.endsAt ?? '') || null,
    location: (draft.location ?? '').trim(),
    priceCents,
    organizerName: (draft.organizerName ?? '').trim(),
    organizerContact: (draft.organizerContact ?? '').trim(),
    domain: coerceDomain(draft.domain),
    posterPath,
    // Re-coerce on the way out: the draft has been hand-edited on the review board, so the
    // rows are re-validated against the persisted shape rather than trusted.
    details: coerceEventDetails(draft.details),
  })
  if (!created) {
    await setEventIntakeStatus(intakeId, 'failed', { error: 'The event could not be written.' })
    return { ok: false, error: 'The event could not be created. Try again.' }
  }

  await markEventIntakeApplied(intakeId, created.id)
  await setEventIntakeStatus(intakeId, 'applied', { error: null })
  return { ok: true, eventId: created.id, alreadyApplied: false }
}
