'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Membership is the ENTITLEMENT axis (profiles.membership_tier), orthogonal to the
// community role (ADR-163 §11.2). Upgrading no longer touches community_role — Crew is
// a pure stewardship role now. During beta this is a free self-serve toggle; real
// upgrades (free → member → supporter) route through billing (P2.2).
export async function toggleMembership(): Promise<ActionResult<{ tier: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Not signed in')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, membership_tier')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) return fail('Profile not found')

  // Beta toggle: free ↔ member. 'supporter' is reserved for the billing flow.
  const current = (profile.membership_tier ?? 'free') as string
  const next = current === 'free' ? 'member' : 'free'

  const { error } = await admin
    .from('profiles')
    .update({ membership_tier: next })
    .eq('id', profile.id)

  if (error) return fail(error.message)

  revalidatePath('/', 'layout')
  return ok({ tier: next })
}
