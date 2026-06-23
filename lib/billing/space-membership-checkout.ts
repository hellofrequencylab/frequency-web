// SPACE MEMBERSHIP CHECKOUT (Pricing P2, ADR-363). A subscription Checkout for a MEMBER joining a
// PAID space membership tier (space_membership_tiers). Money moves as a Stripe Connect destination
// charge: the platform keeps an application fee = the take-rate SET BY THE SPACE'S PLAN (8/5/3% per
// pricing_settings), the rest transfers to the SPACE OWNER's connected account. The webhook upserts
// space_memberships.stripe_subscription_id + payment_status once active.
//
// GATED: returns null (a no-op) unless billingLive() — so v1 display-only "join" behavior is unchanged
// and no Stripe session is created while billing is OFF (the P1 invariant holds). The space owner must
// also have a Connect account that is payout-ready (mirrors tips/tickets). Server-only.

import { stripe, appUrl } from './stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { billingLive } from '@/lib/pricing/settings'
import { asSpacePlan } from '@/lib/pricing/plans'
import { getConnectStatus } from './connect'
import { spaceTakeRateCents } from './fees'

export interface SpaceMembershipCheckoutResult {
  url?: string
  /** Why no URL (when checkout didn't start). 'billing_off' | 'not_payable' | 'no_owner_payouts' |
   *  'tier_not_found' | 'free_tier' | 'error'. */
  reason?: 'billing_off' | 'not_payable' | 'no_owner_payouts' | 'tier_not_found' | 'free_tier' | 'error'
}

/** Create a subscription Checkout for a member joining a paid space tier. Connect destination charge:
 *  the application fee is the SPACE plan's take-rate; the rest transfers to the space owner. Returns a
 *  URL, or a reason when it no-ops. GATED on billingLive().
 *
 *  authz-delegated: the caller-trusted join action authorizes the member; this binds the charge to the
 *  resolved tier + the space OWNER's Connect account and stamps space_id/tier_id/member_id in metadata
 *  so the webhook reconciles to the right membership row. */
export async function createSpaceMembershipCheckout(
  spaceId: string,
  tierId: string,
  memberId: string,
): Promise<SpaceMembershipCheckoutResult> {
  if (!stripe) return { reason: 'billing_off' }
  if (!(await billingLive())) return { reason: 'billing_off' }

  try {
    const db = createAdminClient()

    // Resolve the space (its plan drives the take-rate) and its owner (the payout recipient).
    const { data: space } = (await db
      .from('spaces')
      .select('id, owner_profile_id, plan, slug')
      .eq('id', spaceId)
      .maybeSingle()) as {
      data: { id?: string; owner_profile_id?: string | null; plan?: string | null; slug?: string | null } | null
    }
    if (!space?.id || !space.owner_profile_id) return { reason: 'tier_not_found' }

    // The owner must be able to receive money (Connect ready), like tips/tickets.
    const ownerStatus = await getConnectStatus(space.owner_profile_id)
    if (!ownerStatus.accountId || !ownerStatus.ready) return { reason: 'no_owner_payouts' }

    // Resolve the tier the member is joining (its price drives the charge).
    const { data: tier } = (await db
      .from('space_membership_tiers')
      .select('id, name, price_cents, interval, is_active')
      .eq('id', tierId)
      .eq('space_id', spaceId)
      .maybeSingle()) as {
      data: { id?: string; name?: string | null; price_cents?: number | null; interval?: string | null; is_active?: boolean | null } | null
    }
    if (!tier?.id || tier.is_active === false) return { reason: 'tier_not_found' }

    const amount = Math.round(tier.price_cents ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) return { reason: 'free_tier' } // a $0 tier takes no charge (v1 join path)

    // The application fee is the SPACE plan's take-rate (8/5/3%), read fail-safe from pricing_settings.
    const fee = await spaceTakeRateCents(amount, asSpacePlan(space.plan))
    const interval: 'month' | 'year' = tier.interval === 'year' ? 'year' : 'month'

    const metadata = { kind: 'space_membership', space_id: spaceId, tier_id: tierId, member_id: memberId }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            recurring: { interval },
            product_data: { name: `${tier.name ?? 'Membership'} (Space membership)` },
          },
        },
      ],
      // Connect destination charge on the subscription: fee stays with the platform, the rest
      // transfers to the space owner's connected account on every invoice.
      subscription_data: {
        application_fee_percent: amount > 0 ? round2((fee / amount) * 100) : 0,
        transfer_data: { destination: ownerStatus.accountId },
        metadata,
      },
      client_reference_id: memberId,
      metadata,
      success_url: `${appUrl()}/spaces/${space.slug ?? spaceId}?membership=joined&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/spaces/${space.slug ?? spaceId}`,
    })
    if (!session.url) return { reason: 'error' }
    return { url: session.url }
  } catch {
    return { reason: 'error' }
  }
}

/** Round to 2 dp (Stripe's application_fee_percent precision). Pure. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
