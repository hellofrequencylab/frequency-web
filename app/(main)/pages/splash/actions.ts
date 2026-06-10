'use server'

import { revalidatePath } from 'next/cache'
import { getJanitor } from '@/lib/page-editor/guard'
import { getCallerProfile } from '@/lib/auth'
import { VERA, BETA_OATHS, type VeraCopy } from '@/lib/onboarding/beta-script'
import { DEFAULT_SEQUENCE, type BetaSequence } from '@/lib/onboarding/beta-sequences'
import { saveSequenceOverride, deleteSequenceVersion } from '@/lib/onboarding/sequence-overrides'
import { resolveDefaultSequence } from '@/lib/onboarding/resolve-sequence'

// Server actions for the default beta flow's live-preview editor (/pages/splash).
// Janitor-gated like the rest of the pages surface. Saving writes the `beta-default`
// row in sequence_overrides; the live /onboarding/beta flow resolves it on the next
// request (resolve-sequence.ts). Reset deletes the row, falling back to the coded
// VERA script.

const MAX_LINE = 300
const MAX_BODY = 1000

/** Whitelist the client payload against the coded VERA shape: only known beats and
 *  fields are kept, every value is a trimmed, capped string, and a blanked field
 *  falls back to the coded copy (an empty heading would break the flow). */
function cleanVera(input: unknown): VeraCopy {
  const src = (input ?? {}) as Record<string, Record<string, unknown> | undefined>
  return Object.fromEntries(
    (Object.keys(VERA) as (keyof typeof VERA)[]).map((beat) => [
      beat,
      Object.fromEntries(
        Object.keys(VERA[beat]).map((field) => {
          const fallback = (VERA[beat] as Record<string, string>)[field]
          const v = src[beat]?.[field]
          const max = field === 'body' ? MAX_BODY : MAX_LINE
          return [field, typeof v === 'string' ? v.trim().slice(0, max) || fallback : fallback]
        }),
      ),
    ]),
  ) as VeraCopy
}

/** The three oath checkboxes: ids come from code; only the labels are editable. */
function cleanOaths(input: unknown): BetaSequence['oaths'] {
  const arr = Array.isArray(input) ? (input as { label?: unknown }[]) : []
  return BETA_OATHS.map((o, i) => {
    const v = arr[i]?.label
    return { id: o.id, label: typeof v === 'string' ? v.trim().slice(0, 120) || o.label : o.label }
  })
}

function revalidate() {
  revalidatePath('/onboarding/beta')
  revalidatePath('/pages/splash')
  revalidatePath('/pages')
}

/** Save the edited copy as the `beta-default` override. Publishes immediately. */
export async function saveDefaultBetaCopy(payload: {
  vera: VeraCopy
  oaths: BetaSequence['oaths']
}): Promise<{ ok: boolean }> {
  if (!(await getJanitor())) return { ok: false }
  const me = await getCallerProfile()
  await saveSequenceOverride(
    DEFAULT_SEQUENCE,
    {
      audience: 'Every new member (default)',
      vera: cleanVera(payload?.vera),
      oaths: cleanOaths(payload?.oaths),
    },
    me?.id ?? null,
  )
  revalidate()
  return { ok: true }
}

/** Clear the override: the flow returns to the coded VERA script. Returns the
 *  freshly-resolved copy so the editor can repaint without a reload. */
export async function resetDefaultBetaCopy(): Promise<
  { ok: true; vera: VeraCopy; oaths: BetaSequence['oaths'] } | { ok: false }
> {
  if (!(await getJanitor())) return { ok: false }
  await deleteSequenceVersion(DEFAULT_SEQUENCE)
  revalidate()
  const seq = await resolveDefaultSequence()
  return { ok: true, vera: seq.vera, oaths: seq.oaths }
}
