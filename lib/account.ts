// Self-serve account deletion (ADR-036, App Store requirement). Hard-deletes the
// member: removing the auth user cascades to the profile row (auth_user_id FK)
// and its content (own content CASCADE; authored-by SET NULL per migration
// 20240212). Server-only; the caller must confirm intent. Uses the service-role
// admin client (required for auth.admin.deleteUser).
//
// The copies the cascade cannot reach (stored files, the Stripe customer) are
// erased FIRST by eraseExternalCopies (LIVE-549, ADR-1581), so a failure between
// the two still leaves a profile id to retry by. Its failures are reported and do
// not block the auth delete.
//
// The delete dialog reads paidSpacesEndedByDelete first (LIVE-628, ADR-1601): the Spaces whose paid
// plan is billed to this member's Stripe customer, which the customer delete cancels, so the member
// is told before they confirm.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { stripe } from '@/lib/billing/stripe'
import { eraseExternalCopies, type ErasureAdmin } from '@/lib/account-erasure'
import { isPaidSpacePlan } from '@/lib/pricing/space-limits'
import { asSpacePlan, SPACE_PLAN_LABEL } from '@/lib/pricing/plans'

/** A Space whose paid plan ends when this account is deleted: its display name and plan label. */
export type SpacePlanEndedByDelete = { name: string; plan: string }

/**
 * The Spaces whose paid plan deleting this account would end (LIVE-628, ADR-1601). A Space checkout
 * reuses its owner's Stripe customer (lib/billing/space-plan-checkout.ts), and eraseExternalCopies
 * deletes that customer, which cancels every subscription on it; the customer.subscription.deleted
 * webhook then puts the Space back on Free. So the set is exactly: a paid plan, a live subscription,
 * and billed to THIS member's customer. Keyed to the session's own profile, read server-side.
 * Returns [] when nothing is billed to the member, and null when it could not be read (the dialog
 * then says it in general terms rather than claiming there is nothing).
 */
export async function paidSpacesEndedByDelete(): Promise<SpacePlanEndedByDelete[] | null> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return []
  try {
    const admin = createAdminClient()
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', myProfileId)
      .maybeSingle()
    if (profileErr) return null
    const customerId = profile?.stripe_customer_id
    if (!customerId) return []
    const { data: spaces, error } = await admin
      .from('spaces')
      .select('name, brand_name, plan, stripe_subscription_id')
      .eq('stripe_customer_id', customerId)
    if (error) return null
    return (spaces ?? [])
      .filter((s) => isPaidSpacePlan(s.plan) && !!s.stripe_subscription_id)
      .map((s) => ({ name: s.brand_name?.trim() || s.name, plan: SPACE_PLAN_LABEL[asSpacePlan(s.plan)] }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return null
  }
}

export async function deleteMyAccount(): Promise<{ ok: boolean }> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return { ok: false }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('auth_user_id, stripe_customer_id')
    .eq('id', myProfileId)
    .maybeSingle()

  const authUserId = profile?.auth_user_id
  if (!authUserId) {
    // No auth link (should not happen for a signed-in member): soft-deactivate
    // as a safe fallback so the record stops appearing in the product.
    await admin.from('profiles').update({ is_active: false }).eq('id', myProfileId)
    return { ok: true }
  }

  await eraseExternalCopies(
    { profileId: myProfileId, authUserId, stripeCustomerId: profile?.stripe_customer_id },
    { admin: admin as unknown as ErasureAdmin, stripe },
  )

  const { error } = await admin.auth.admin.deleteUser(authUserId)
  if (error) {
    console.error('[deleteMyAccount]', error.message)
    return { ok: false }
  }
  return { ok: true }
}
