'use server'

// Feed people-suggestion actions (Resonance Feed Phase 3, ADR-417). The "X" on a
// suggested person writes the Phase 0 suggestion_hidden list so we never suggest them
// again. Self-authorized: only ever writes the CALLER's own row (profile_id = caller),
// so the admin-client write is scoped to the caller and cannot touch anyone else's list.

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ActionResult, ok, fail } from '@/lib/action-result'

export async function hideSuggestionAction(hiddenProfileId: string): Promise<ActionResult> {
  const me = await getMyProfileId()
  if (!me) return fail('Sign in first.')
  if (!hiddenProfileId || hiddenProfileId === me) return fail('Invalid suggestion.')

  // suggestion_hidden is reached untyped until the generated types regenerate (ADR-246).
  // Self-scoped: profile_id is ALWAYS the caller, so this never writes another member's list.
  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      upsert: (rows: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<{ error: unknown }>
    }
  }
  const { error } = await admin
    .from('suggestion_hidden')
    .upsert({ profile_id: me, hidden_profile_id: hiddenProfileId }, { onConflict: 'profile_id,hidden_profile_id' })
  if (error) return fail('Could not hide that suggestion.')

  revalidatePath('/feed')
  return ok()
}
