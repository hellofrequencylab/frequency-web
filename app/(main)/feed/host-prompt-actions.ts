'use server'

// Dismiss action for the Lone-Wolf -> Local-Host host prompts. Records the member's
// explicit "not now" so that (member, kind) prompt goes quiet for good — the calm
// half of the seen-state contract (lib/growth/host-prompts.ts).
//
// SELF-AUTHORIZED: the actor is always the session member (getCallerProfile), so a
// caller can only ever dismiss their OWN prompt. Writes through the service-role admin
// client because the seen-state table is service-role only (RLS enabled, no policies).

import type { SupabaseClient } from '@supabase/supabase-js'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import type { HostPromptKind } from '@/lib/growth/host-prompts'

const KINDS: readonly HostPromptKind[] = ['rank', 'near_you']

// beta_host_prompts isn't in the generated types yet (the migration ships unapplied),
// so reach it through an untyped service-role handle (the keystone/store.ts idiom for
// not-yet-typed tables, ADR-246).
function db(): SupabaseClient {
  return createAdminClient()
}

export async function dismissHostPrompt(kind: HostPromptKind): Promise<ActionResult> {
  if (!KINDS.includes(kind)) return fail('Unknown prompt.')

  const profile = await getCallerProfile()
  if (!profile) return fail('Sign in to do that.')

  try {
    await db()
      .from('beta_host_prompts')
      .upsert(
        { profile_id: profile.id, kind, dismissed_at: new Date().toISOString() },
        { onConflict: 'profile_id,kind' },
      )
    return ok()
  } catch {
    return fail('Could not dismiss that right now.')
  }
}
