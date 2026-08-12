'use server'

// The WhatsApp chat importer's two actions, in the order an operator uses them.
//
//   previewImport      — the DRY RUN, and still the default. Parses an exported chat and runs
//                        the AI classifier to show what it found. It writes NOTHING: no event,
//                        no listing, no storage object.
//   stageEventsForReview — the EXPLICIT operator step (ADR-989). Stages the events the dry run
//                        found on the `event_intake` table so they can be reviewed in the Event
//                        Seeder. Still nothing public: an intake row is a service-role-only
//                        staging record, and the event itself is only written later, by the
//                        Seeder's own apply, as an unlisted draft.
//
// Gated to community hosts / staff, mirroring /admin/events; staging asks for the operator
// rung (community:write) because it persists third-party content lifted from a private group.

import { requireAdmin } from '@/lib/admin/guard'
import { parseWhatsAppExport, classifiableMessages } from '@/lib/whatsapp/parse-export'
import { classifyAndExtract } from '@/lib/whatsapp/extract'
import { gatherImageNames } from '@/lib/whatsapp/associate'
import { stageChatEvent } from '@/lib/events/seed/from-chat'
import type { ClassifiedItem, ImportCategory, ImportPreview } from '@/lib/whatsapp/types'

// ~4MB of text — years of a big group's chat fits comfortably under this. The text is
// only read, classified, and discarded; nothing is persisted.
const MAX_INPUT_CHARS = 4_000_000

// How many events ONE stage run may write. A big export can classify hundreds; a review board
// nobody can finish is worse than a second run, and this also caps the write burst.
const MAX_STAGED_PER_RUN = 50

export async function previewImport(rawText: string): Promise<ImportPreview> {
  const { profileId } = await requireAdmin('host', { staff: 'community' })

  const text = typeof rawText === 'string' ? rawText.slice(0, MAX_INPUT_CHARS) : ''
  const parse = parseWhatsAppExport(text)
  const messages = classifiableMessages(parse)

  const { items, aiSkipped, truncated } = await classifyAndExtract(messages, { profileId })

  // Tie each item to the photos posted with it (filenames live in the chat text, so
  // this works server-side; the client matches the names to the selected image files).
  for (const it of items) {
    if (it.category !== 'other') it.imageNames = gatherImageNames(parse.messages, it)
  }

  const counts: Record<ImportCategory, number> = { event: 0, housing: 0, roommate: 0, other: 0 }
  for (const it of items) counts[it.category] += 1

  return { parse, items, aiSkipped, truncated, counts }
}

// ── Stage the found events for review (the writer, ADR-989) ────────────────────────

export type StageEventsResult =
  | { ok: true; staged: number; skipped: number }
  | { ok: false; error: string }

/**
 * Stage the events the dry run found onto `event_intake`, so an operator can review them in
 * the Event Seeder (/admin/event-seeder) and decide, one by one, which become real events.
 *
 * The dry run stays the default: this only runs when the operator asks for it, and it is
 * still not a publish. It writes to the service-role-only staging table and nowhere else.
 *
 * TRUST: `items` round-tripped through the browser, so nothing in it is trusted. Each
 * extraction is re-coerced (eventSeedDraftFromExtraction), and the ledger SNIPPET is not
 * taken from the client at all: the chat text is re-parsed here (a deterministic parse, no
 * AI, no cost) and the message each item cites is read out of that. So a staged draft's
 * receipt is the real message, whatever the client sent.
 *
 * Fail-safe: a row that cannot be staged is counted as skipped rather than failing the batch.
 */
export async function stageEventsForReview(
  rawText: string,
  items: ClassifiedItem[],
): Promise<StageEventsResult> {
  const { profileId } = await requireAdmin('admin', { staff: 'community', staffLevel: 'write' })
  if (!profileId) return { ok: false, error: 'No operator profile.' }

  const events = (Array.isArray(items) ? items : []).filter((it) => it?.category === 'event' && it.event)
  if (events.length === 0) return { ok: false, error: 'No events in this read to stage.' }

  // Re-parse the export to recover each item's ORIGINAL message text (deterministic, no AI).
  const text = typeof rawText === 'string' ? rawText.slice(0, MAX_INPUT_CHARS) : ''
  const byRef = new Map<number, string>()
  for (const m of parseWhatsAppExport(text).messages) byRef.set(m.ref, m.text)

  let staged = 0
  let skipped = 0
  for (const item of events.slice(0, MAX_STAGED_PER_RUN)) {
    const refs = (Array.isArray(item.refs) ? item.refs : []).filter((n): n is number => typeof n === 'number')
    const snippet = refs.map((r) => byRef.get(r) ?? '').filter(Boolean).join('\n\n')
    const id = await stageChatEvent({
      operatorId: profileId,
      extraction: item.event,
      refs,
      snippet,
      imageNames: (Array.isArray(item.imageNames) ? item.imageNames : []).filter((n) => typeof n === 'string'),
      note: typeof item.note === 'string' ? item.note : '',
      confidence: item.confidence === 'low' ? 'low' : 'high',
    })
    if (id) staged += 1
    else skipped += 1
  }
  skipped += Math.max(0, events.length - MAX_STAGED_PER_RUN)

  if (staged === 0) return { ok: false, error: 'None of these could be staged. They may be missing a title.' }
  return { ok: true, staged, skipped }
}
