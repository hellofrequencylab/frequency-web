'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBillingPortal } from '@/lib/billing/checkout'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Open the Stripe billing portal so a member can update or cancel their subscription.
export async function openBillingPortal(): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Not signed in')

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return fail('Profile not found')

  const url = await createBillingPortal(profile.id)
  if (!url) return fail('No subscription to manage yet.')
  return ok({ url })
}
