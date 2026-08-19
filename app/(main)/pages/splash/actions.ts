'use server'

import { revalidatePath } from 'next/cache'
import { getJanitor } from '@/lib/page-editor/guard'
import { getCallerProfile } from '@/lib/auth'
import { VERA, type VeraCopy } from '@/lib/onboarding/funnel-script'
import { DEFAULT_FUNNEL } from '@/lib/funnels/definitions'
import { saveFunnelOverride, deleteFunnelVersion } from '@/lib/funnels/overrides'
import { resolveDefaultFunnel } from '@/lib/funnels/resolve'

// Server actions for the default Funnel's live-preview editor (/pages/splash).
// Janitor-gated like the rest of the pages surface. Saving writes the `beta-default`
// row in sequence_overrides; the live /join flow resolves it on the next
// request (lib/funnels/resolve.ts). Reset deletes the row, falling back to the coded
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

function revalidate() {
  revalidatePath('/join')
  revalidatePath('/pages/splash')
  revalidatePath('/pages')
}

/** Save the edited copy as the `beta-default` override. Publishes immediately. */
export async function saveDefaultFunnelCopy(payload: { vera: VeraCopy }): Promise<{ ok: boolean }> {
  if (!(await getJanitor())) return { ok: false }
  const me = await getCallerProfile()
  await saveFunnelOverride(
    DEFAULT_FUNNEL,
    {
      audience: 'Every new member (default)',
      vera: cleanVera(payload?.vera),
    },
    me?.id ?? null,
  )
  revalidate()
  return { ok: true }
}

/** Clear the override: the flow returns to the coded VERA script. Returns the
 *  freshly-resolved copy so the editor can repaint without a reload. */
export async function resetDefaultFunnelCopy(): Promise<{ ok: true; vera: VeraCopy } | { ok: false }> {
  if (!(await getJanitor())) return { ok: false }
  await deleteFunnelVersion(DEFAULT_FUNNEL)
  revalidate()
  const seq = await resolveDefaultFunnel()
  return { ok: true, vera: seq.vera }
}
