// ─────────────────────────────────────────────────────────────────────────────
// THE EVENT SEEDER — staging a CLASSIFIED CHAT MESSAGE (ADR-989).
//
// The WhatsApp importer (app/(main)/admin/import) has always been a DRY RUN with no writer
// wired: it parsed a group export, classified the messages, showed the operator what it
// found, and wrote nothing at all. This is the writer, and it deliberately writes to ONE
// place only: the `event_intake` staging table. Nothing reaches the events table from here.
// The apply (./apply.ts) is a separate, later, deliberate operator step.
//
// SERVER-ONLY. authz-delegated: the calling action gates the operator; the write is a fresh
// row bound to that operator's id.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import type { FieldConfidence } from '@/lib/events/types'
import { eventSeedDraftFromExtraction, seedEventLedger } from './draft'
import type { EventHarvestedSource, EventIntakeInputs } from './intake'
import { createEventIntake } from './store'

/** One classified chat item, as the staging action hands it over. `extraction` is untrusted
 *  (it round-tripped through the operator's browser), so it is re-coerced on the way in. */
export interface ChatEventStageInput {
  operatorId: string
  extraction: unknown
  /** The `ref` line numbers of the messages this event was read from. */
  refs: number[]
  /** The exact message text those refs point at: the snippet every ledger entry cites. */
  snippet: string
  /** Filenames of the photos posted alongside it in the chat. */
  imageNames: string[]
  /** The classifier's one-line reason, in plain voice. */
  note: string
  confidence: FieldConfidence
}

/**
 * Stage ONE classified chat event for review. Returns the new intake id, or null when the
 * read was too thin to be worth an operator's time (no title at all) or the write failed.
 *
 * Every staged event is a DEMO (`consent.isDemo`): the apply materializes it as an unlisted
 * event draft that an operator consciously publishes.
 */
export async function stageChatEvent(input: ChatEventStageInput): Promise<string | null> {
  const draft = eventSeedDraftFromExtraction(input.extraction)
  if (!draft.title.trim()) return null

  const snippet = input.snippet.trim()
  const refs = input.refs.filter((n) => Number.isFinite(n)).map((n) => Math.floor(n))
  const label = refs.length
    ? `WhatsApp export, message${refs.length === 1 ? '' : 's'} ${refs.join(', ')}`
    : 'WhatsApp export'

  const inputs: EventIntakeInputs = {
    source: 'whatsapp',
    consent: { isDemo: true },
    sourceLabel: label,
    confidence: input.confidence,
    ...(snippet ? { sourceText: snippet.slice(0, 4000) } : {}),
    ...(refs.length ? { chatRefs: refs } : {}),
    ...(input.imageNames.length ? { imageNames: input.imageNames.slice(0, 12) } : {}),
    ...(input.note.trim() ? { note: input.note.trim().slice(0, 400) } : {}),
  }

  const rawSources: EventHarvestedSource[] = snippet
    ? [
        {
          id: `chat-${refs[0] ?? 0}`,
          kind: 'chat',
          capturedAt: new Date().toISOString(),
          label,
          text: snippet.slice(0, 4000),
        },
      ]
    : []

  return createEventIntake({
    createdBy: input.operatorId,
    inputs,
    draft,
    ledger: seedEventLedger(draft, { snippet, confidence: input.confidence }),
    rawSources,
    // The classifier already ran, so there is nothing to research: it lands ready for review.
    status: 'review',
  })
}
