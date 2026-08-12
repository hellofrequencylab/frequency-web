// ─────────────────────────────────────────────────────────────────────────────
// THE EVENT SEEDER — staging a SCANNED FLYER (ADR-989 completed by ADR-997).
//
// The sibling of ./from-chat.ts, for the other door. The flyer scan has always read a
// photographed poster into a rich `ExtractedEvent` and written ONE draft, for the member who
// took the photo. An operator walking a town with fifty posters wants the other shape: read
// them all, review them in one place, seed the ones worth seeding. This is the writer for
// that, and like its sibling it writes to ONE place only, the `event_intake` staging table.
// Nothing reaches the events table from here; the apply (./apply.ts) is a later, deliberate
// operator step that still lands an UNLISTED draft.
//
// TRUST. The extraction handed in here is the SERVER's own read: the calling action runs the
// vision pass and stages the result in the same request, so the draft never round-trips
// through a browser to get here. It is still re-coerced (`eventSeedDraftFromExtraction`),
// because a stager that trusts its caller is one refactor away from being wrong.
//
// THE POSTER IMAGE. It travels on the intake INPUTS, not in the draft (the draft is the
// manifest's vocabulary and outlives whichever door it came through). It is the same object
// the scan already keeps when it builds a draft directly, in the same private bucket, handed
// to the same writer at apply. So this adds no second image path, and ADR-987 is untouched.
//
// SERVER-ONLY. authz-delegated: the calling action gates the operator; the write is a fresh
// row bound to that operator's id.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import type { ExtractedEvent } from '@/lib/events/types'
import { eventSeedDraftFromExtraction, seedEventLedger } from './draft'
import type { EventHarvestedSource, EventIntakeInputs } from './intake'
import { createEventIntake } from './store'

export interface ScanEventStageInput {
  operatorId: string
  /** The vision read, straight from the scan in this same request. Re-coerced regardless. */
  extraction: ExtractedEvent
  /** The kept poster object in the private bucket, already ownership-checked by the action. */
  posterPath: string | null
}

/**
 * Stage ONE scanned flyer for review. Returns the new intake id, or null when the read was
 * too thin to be worth an operator's time (no title at all) or the write failed.
 *
 * THE RECEIPT IS THE PHOTO. A chat event cites the message it was read from; a flyer has no
 * text to quote, so the ledger entries carry no snippet and the review board shows the poster
 * itself instead. Inventing a snippet out of the read would be citing the answer as its own
 * source, which is the exact dishonesty the ledger exists to prevent.
 *
 * CONFIDENCE IS THE MODEL'S OWN. A poster the model called legible seeds at 'high', an
 * illegible one at 'low', so a bad photo opens the board already saying it is a bad photo.
 *
 * Every staged event is a DEMO (`consent.isDemo`): the apply materializes it as an unlisted
 * event draft that an operator consciously publishes.
 */
export async function stageScannedEvent(input: ScanEventStageInput): Promise<string | null> {
  const draft = eventSeedDraftFromExtraction(input.extraction)
  if (!draft.title.trim()) return null

  const quality = input.extraction.quality
  const note = (quality?.note ?? '').trim()

  const inputs: EventIntakeInputs = {
    source: 'scan',
    consent: { isDemo: true },
    sourceLabel: 'Flyer scan',
    confidence: quality?.legible === false ? 'low' : 'high',
    ...(note ? { note: note.slice(0, 400) } : {}),
    ...(input.posterPath ? { posterPath: input.posterPath } : {}),
  }

  const rawSources: EventHarvestedSource[] = input.posterPath
    ? [
        {
          id: `poster-${input.posterPath.split('/').pop() ?? 'shot'}`,
          kind: 'poster',
          capturedAt: new Date().toISOString(),
          label: 'Flyer scan',
          meta: {
            posterPath: input.posterPath,
            legible: quality?.legible ?? true,
            glare: quality?.glare ?? false,
            skew: quality?.skew ?? false,
          },
        },
      ]
    : []

  return createEventIntake({
    createdBy: input.operatorId,
    inputs,
    draft,
    ledger: seedEventLedger(draft, { confidence: inputs.confidence }),
    rawSources,
    // The vision pass already ran, so there is nothing to research: it lands ready for review.
    status: 'review',
  })
}
