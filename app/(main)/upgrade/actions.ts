'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createMembershipCheckout } from '@/lib/billing/checkout'
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

  // Beta toggle: free ↔ crew (the paid membership). 'supporter' is reserved for billing.
  const current = (profile.membership_tier ?? 'free') as string
  const next = current === 'free' ? 'crew' : 'free'

  const { error } = await admin
    .from('profiles')
    .update({ membership_tier: next })
    .eq('id', profile.id)

  if (error) return fail(error.message)

  revalidatePath('/', 'layout')
  return ok({ tier: next })
}

// Real membership purchase — a Stripe Checkout session for a paid tier (P2.2/P2.4).
// Crew is the standard membership; Supporter is the pay-more tier (P2.4). Returns the
// hosted-checkout URL; the webhook (and the success-redirect fallback) flip
// membership_tier on completion. Only reachable when billing is configured.
export async function startMembershipCheckout(
  tier: 'crew' | 'supporter' = 'crew',
): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Not signed in')

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return fail('Profile not found')

  const url = await createMembershipCheckout({ profileId: profile.id, email: user.email, tier })
  if (!url) return fail('Billing isn’t available right now.')
  return ok({ url })
}

// PWYW SUPPORTER BADGE (Pricing ladder Phase C, ADR-463). Supporter is retired as a tier and becomes an
// opt-in pay-what-you-want badge on Crew (profiles.is_supporter). This writes the badge flag only: the
// actual contribution charge is dormant until billing goes live (the PWYW contribution flow + ledger
// were deferred). A member can turn the badge on or off freely. Writes the caller's OWN profile only
// (re-resolved from the session), never another member's.
export async function toggleSupporterBadge(on: boolean): Promise<ActionResult<{ isSupporter: boolean }>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('Not signed in')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return fail('Profile not found')

  const { error } = await admin.from('profiles').update({ is_supporter: on }).eq('id', profile.id)
  if (error) return fail(error.message)

  revalidatePath('/upgrade')
  return ok({ isSupporter: on })
}
