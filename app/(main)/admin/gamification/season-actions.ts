'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { isJanitor } from '@/lib/core/roles'
import { endSeasonNow } from '@/lib/seasons'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// End the current season now. Destructive + global (mints trophies, converts
// zaps to gems, resets ranks/streaks/challenges, opens the next season), so
// janitor-only. Gated on the web_role staff axis (ADR-208) — the canonical
// platform-owner check used across /admin — not the deprecated community_role ladder.
export async function endSeasonAction(): Promise<ActionResult> {
  const me = await getCallerProfile()
  if (!me) return fail('Not signed in')
  if (!isJanitor(me.webRole)) return fail('Janitor only')

  await endSeasonNow()
  revalidatePath('/admin/gamification')
  return ok()
}
