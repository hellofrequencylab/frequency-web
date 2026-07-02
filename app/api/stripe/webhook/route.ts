import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe, STRIPE_WEBHOOK_SECRET, tierForPrice } from '@/lib/billing/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { routeSpaceSubscription, subscriptionKind } from '@/lib/billing/space-subscriptions'
import { grantFounderFromSession } from '@/lib/billing/founders'

// Stripe membership webhook (P2.2). Verifies the signature, then reconciles the
// member's entitlement: a completed checkout / active subscription sets membership_tier
// (crew/supporter); cancellation sets it back to free. Identity rides on
// metadata.profile_id (set at checkout). Dormant until billing is configured.
//
// Pricing P2 (ADR-363): subscription events carrying metadata.kind = 'space_plan' /
// 'space_membership' route to the Space reconcilers (lib/billing/space-subscriptions.ts) FIRST;
// the member Crew/Supporter path below is untouched and only runs for non-Space subscriptions.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'billing not configured' }, { status: 503 })
  }
  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'missing signature' }, { status: 400 })

  const body = await req.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Idempotency (P8): claim the event id before handling. A unique-violation means this
  // event was already processed (a Stripe retry or in-tolerance replay) — ack without
  // re-running. Any other claim error is transient → fall through and process anyway
  // (re-processing is safe; the handlers set the tier to a fixed value).
  const claim = await (admin)
    .from('stripe_webhook_events')
    .insert({ event_id: event.id, type: event.type })
  if (claim.error?.code === '23505') {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // membership_tier is the SOLE paid source of truth (ADR-207/225). A paid transition
  // writes ONLY the tier — it never touches community_role. The old "auto-set
  // community_role='crew' on pay" rule (ADR-208 era) is retired: ADR-207 retired the
  // crew role VALUE and moved every row to 'member', so re-writing it here would
  // re-introduce a dead enum value and re-conflate the role with the tier. Crew the
  // PAID membership and Crew the (retired) community role are fully decoupled.
  const setTier = async (
    profileId: string,
    tier: string,
    customerId?: string | null,
    paymentStatus?: 'active' | 'past_due' | 'canceled',
  ) => {
    // Supporter was retired as a TIER (ADR-458 / 20260915000100): membership_tier
    // collapses to ('free','crew') and Supporter becomes the is_supporter PWYW badge
    // on top of Crew. Map here so a legacy/PWYW 'supporter' event writes the allowed
    // tier + sets the badge (access-preserving), instead of violating the
    // membership_tier CHECK and failing.
    const isSupporter = tier === 'supporter'
    const patch: {
      membership_tier: string
      is_supporter?: boolean
      stripe_customer_id?: string
      membership_payment_status?: string
    } = {
      membership_tier: isSupporter ? 'crew' : tier,
    }
    if (isSupporter) patch.is_supporter = true
    if (customerId) patch.stripe_customer_id = customerId
    // Dunning state (ADR-370, migration 20260727000000): the gated member webhook is the ONLY
    // writer of membership_payment_status; lib/pricing/dunning.ts reads it (fail-safe to 'active'
    // when NULL). Write it alongside the tier so a past-due member gets the recovery banner
    // without being downgraded.
    if (paymentStatus) patch.membership_payment_status = paymentStatus
    const { error } = await admin.from('profiles').update(patch).eq('id', profileId)
    // A failed entitlement write must NOT ack 200: supabase-js returns { error } rather
    // than throwing, so an unchecked failure here would leave a paying member on 'free'
    // with the event claimed as processed (Stripe never redelivers) — unrecoverable.
    // Throw so the outer catch releases the claim and returns 500 for Stripe to retry.
    if (error) throw new Error(`setTier(${profileId}) failed: ${error.message}`)
  }

  // Wrap the handler switch: a transient handler failure must NOT leave the claim row
  // behind. If it did, the next Stripe retry would short-circuit on the duplicate check
  // above and the event would never actually process. On failure we RELEASE the claim and
  // return a non-2xx so Stripe redelivers; our writes set fixed values, so re-processing is
  // safe. Mirrors the sibling app/api/webhooks/stripe/route.ts (503 + idempotent handlers).
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session
        // Founders Round (ONE-TIME, mode:'payment'): grant the founding membership
        // (is_founding_member + tier + locked price). Idempotent and shared with the
        // success-page confirm action; routed by metadata.kind === 'founders' and exits
        // before the subscription-tier path (a founders purchase is not a membership tier).
        if (s.metadata?.kind === 'founders') {
          await grantFounderFromSession(s)
          break
        }
        // Pricing P2: a Space plan/membership checkout completes — the subscription.created/updated
        // event does the entitlement write (it carries the full subscription status), so skip the
        // member tier path here for those kinds. The member Crew/Supporter checkout has no `kind`.
        if (subscriptionKind(s.metadata)) break
        const profileId = s.metadata?.profile_id ?? s.client_reference_id ?? null
        const tier = s.metadata?.tier === 'supporter' ? 'supporter' : 'crew'
        const customerId = typeof s.customer === 'string' ? s.customer : s.customer?.id
        // A completed checkout is a successful payment → the membership is active.
        if (profileId) await setTier(profileId, tier, customerId, 'active')
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        // Pricing P2 (ADR-363): route Space subscriptions to their reconcilers first; if it was a
        // Space sub, the member tier path is skipped.
        if (await routeSpaceSubscription(sub)) break
        const profileId = sub.metadata?.profile_id
        if (profileId) {
          // Resolve the paid tier from the VALIDATED subscription metadata first — it is stamped
          // at checkout (createMembershipCheckout), so it tracks the synced catalog price the
          // member actually bought — then fall back to the env price-id map (pre-P2 compat).
          // Guard the items index (an event could arrive with an empty items list).
          const metaTier = sub.metadata?.tier
          const paidTier =
            metaTier === 'crew' || metaTier === 'supporter'
              ? metaTier
              : tierForPrice(sub.items?.data?.[0]?.price?.id)
          const status = sub.status
          if (status === 'active' || status === 'trialing') {
            await setTier(profileId, paidTier, null, 'active')
          } else if (status === 'past_due') {
            // Dunning grace (ADR-370): a failed renewal must NOT instantly downgrade a paying
            // member. Keep the paid tier and mark past_due so the recovery banner shows while
            // Stripe retries; only a terminal state below reverts the tier.
            await setTier(profileId, paidTier, null, 'past_due')
          } else if (status === 'unpaid' || status === 'canceled' || status === 'incomplete_expired') {
            // Terminal: Stripe gave up (unpaid) or the subscription ended → revert to free + canceled.
            await setTier(profileId, 'free', null, 'canceled')
          }
          // incomplete / paused: no confirmed entitlement change — leave the current state as-is.
        }
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        // Pricing P2: a deleted Space subscription reverts the plan to free / cancels the membership.
        if (await routeSpaceSubscription(sub)) break
        const profileId = sub.metadata?.profile_id
        if (profileId) await setTier(profileId, 'free', null, 'canceled')
        break
      }
    }
  } catch (err) {
    // Release the claim so the Stripe retry re-processes (instead of short-circuiting as a
    // duplicate), then signal failure so Stripe redelivers. The DELETE is bounded to this
    // event id; if the claim was never written (a transient claim error fell through above)
    // the delete is simply a no-op.
    console.error(`[stripe-webhook] handler failed (type=${event.type}, id=${event.id}):`, err)
    await admin.from('stripe_webhook_events').delete().eq('event_id', event.id)
    return NextResponse.json({ received: false, error: 'processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
