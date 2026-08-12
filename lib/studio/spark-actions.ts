'use server'

// ─────────────────────────────────────────────────────────────────────────────
// THE SPARK'S SHARED SERVER ACTIONS (docs/STUDIO.md, ADR-597).
//
// The one place a Spark reads an uploaded source document. This replaces the two near-identical
// copies that grew independently (`extractOverviewAction` in app/(main)/journeys/create-actions.ts
// and `extractOutlineAction` in app/(main)/circles/builder-actions.ts) with a single action every
// entity's drop zone calls, so the accepted formats, the size cap, and the failure copy can never
// drift between wizards again.
//
// The two originals stay in place for now (their callers move onto the kit entity by entity); this
// is the one new wizards use, and the one they converge on.
//
// AUTHZ: signed-in only. Reading a file the caller just picked from their own machine grants no
// access to anything in the system: nothing is persisted, nothing is looked up, and the text is
// returned only to the caller who uploaded it. The gate is here so an unauthenticated request
// cannot burn parsing CPU, not because the payload is privileged.
// ─────────────────────────────────────────────────────────────────────────────

import { getCallerProfile } from '@/lib/auth'
import { extractOverviewText } from '@/lib/journeys/extract-text'
import { fail, ok, type ActionResult } from '@/lib/action-result'

/** Uploads over this are refused with a plain "paste it instead" nudge rather than parsed. */
const MAX_BYTES = 5 * 1024 * 1024

/** Extracted text is capped before it reaches an AI brief, so one huge file cannot blow a budget. */
const MAX_CHARS = 20_000

/**
 * Pull plain text out of an uploaded source document (PDF, Word, or plain text / markdown) so a
 * Spark can hand it to Vera. Returns the trimmed text, or a plain reason the caller can show.
 *
 * FAIL-SAFE: every failure path returns a recoverable message pointing at the paste box, because
 * a Spark must never dead-end on a file it could not read. The author can always type it instead.
 */
export async function extractSourceTextAction(formData: FormData): Promise<ActionResult<{ text: string }>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in first.')

  const file = formData.get('file')
  if (!(file instanceof File)) return fail('No file to read.')
  if (file.size > MAX_BYTES) return fail('That file is over 5 MB. Trim it, or paste the text instead.')

  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const text = await extractOverviewText(buf, file.type, file.name)
    if (!text) return fail("We could not read any text from that file. Try plain text, or paste it instead.")
    return ok({ text: text.slice(0, MAX_CHARS) })
  } catch {
    return fail('We could not read that file. Try plain text, or paste it instead.')
  }
}
