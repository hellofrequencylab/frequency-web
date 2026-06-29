'use server'

// Read-only DRY RUN for the WhatsApp chat importer. Parses an exported chat and runs
// the AI classifier to STAGE events + housing for an operator to review. It writes
// NOTHING — no event, no listing, no storage object. The writer (create draft / list
// housing) is a separate, deliberate step that lands after the operator trusts the
// preview. Gated to community hosts / staff, mirroring /admin/events.

import { requireAdmin } from '@/lib/admin/guard'
import { parseWhatsAppExport, classifiableMessages } from '@/lib/whatsapp/parse-export'
import { classifyAndExtract } from '@/lib/whatsapp/extract'
import { gatherImageNames } from '@/lib/whatsapp/associate'
import type { ImportCategory, ImportPreview } from '@/lib/whatsapp/types'

// ~4MB of text — years of a big group's chat fits comfortably under this. The text is
// only read, classified, and discarded; nothing is persisted.
const MAX_INPUT_CHARS = 4_000_000

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
