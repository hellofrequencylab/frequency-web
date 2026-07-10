// THE Stripe webhook (consolidated — ADR-506). Verifies the signature with the Stripe SDK,
// claims the event id for idempotency, then routes EVERY Stripe event this platform cares
// about through one endpoint / one signing secret:
//  - account.updated (Connect) — mirror a connected host's capability flags onto the
//    owning profile as they progress through onboarding.
//  - checkout.session.completed — a single checkout can be a founders grant, a member
//    Crew/Supporter subscription, a Space plan/membership, a tip, a ticket, a PWYW
//    supporter contribution, or a store order. The member/founders/space branch runs
//    first; the payout-channel recorders run after (each no-ops on a session that isn't
//    its kind, so running all of them for every checkout is safe).
//  - customer.subscription.created / updated / deleted — reconcile the member's
//    membership_tier (Space subscriptions route to their own reconcilers first).
//  - invoice.paid — record membership dues on the Foundation ledger.
//  - charge.refunded — flip a refunded ticket / commerce order and free capacity.
// Unhandled events are acked 200 so Stripe stops retrying.
//
// Configure ONE endpoint in the Stripe dashboard pointing at this URL
// (https://frequencylocal.com/api/webhooks/stripe) and set STRIPE_WEBHOOK_SECRET to that
// endpoint's "whsec_…" signing secret. The route reads the RAW body (req.text()) because
// signature verification runs over the exact bytes Stripe signed.
//
// Pricing P2 (ADR-363): subscription/checkout events carrying metadata.kind = 'space_plan' /
// 'space_membership' route to the Space reconcilers (lib/billing/space-subscriptions.ts) FIRST;
// the member Crew/Supporter path only runs for non-Space subscriptions.

import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe, STRIPE_WEBHOOK_SECRET, tierForPrice } from '@/lib/billing/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { routeSpaceSubscription, subscriptionKind } from '@/lib/billing/space-subscriptions'
import { grantFounderFromSession } from '@/lib/billing/founders'
import { persistAccount } from '@/lib/billing/connect'
import { recordTipFromSession } from '@/lib/billing/tips'
import { recordTicketFromSession, recordTicketRefundFromCharge } from '@/lib/billing/tickets'
import { recordMembershipDuesFromInvoice } from '@/lib/billing/checkout'
import { recordSupporterContributionFromSession } from '@/lib/billing/supporter'
import {
  recordCommerceOrderFromSession,
  recordCommerceRefundFromCharge,
  abandonCommerceOrderFromSession,
} from '@/lib/commerce/checkout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // Billing not configured (no key, or webhook secret missing): 503 so Stripe retries
  // once it's wired, rather than a silent success that drops the event.
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
  // (re-processing is safe; every handler below is idempotent).
  const claim = await admin
    .from('stripe_webhook_events')
    .insert({ event_id: event.id, type: event.type })
  if (claim.error?.code === '23505') {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // membership_tier is the SOLE paid source of truth (ADR-207/225). A paid transition
  // writes ONLY the tier — it never touches community_role. apply_membership_event_atomic
  // (migration 20261003000000) IGNORES an event OLDER than the last one applied to this
  // profile, so out-of-order Stripe delivery can't re-grant a canceled tier. It is not yet
  // in the generated Database types, so it is called through a localized method cast (repo
  // convention for not-yet-typed RPCs — see lib/gems.ts award_gems_atomic; ADR-246).
  const applyMembershipEvent = admin.rpc as unknown as (
    name: 'apply_membership_event_atomic',
    args: {
      _profile: string
      _event_at: string
      _tier: string
      _payment_status: string | null
      _is_supporter: boolean | null
      _customer_id: string | null
    },
  ) => Promise<{ data: { applied?: boolean; reason?: string } | null; error: { message: string } | null }>

  // Supporter was retired as a TIER (ADR-458) and maps to crew + the is_supporter PWYW badge.
  // A failed write must NOT ack 200 (a paying member would be stranded on the wrong tier with
  // the event claimed as processed), so throw and let the outer catch release the claim + 500.
  const setTier = async (
    profileId: string,
    tier: string,
    customerId: string | null | undefined,
    paymentStatus: 'active' | 'past_due' | 'canceled',
    eventAt: number,
  ) => {
    const isSupporter = tier === 'supporter'
    const { error } = await applyMembershipEvent('apply_membership_event_atomic', {
      _profile: profileId,
      _event_at: new Date(eventAt * 1000).toISOString(),
      _tier: isSupporter ? 'crew' : tier,
      _payment_status: paymentStatus,
      _is_supporter: isSupporter ? true : null,
      _customer_id: customerId ?? null,
    })
    // A stale event returns { applied:false } WITHOUT an error (correct state preserved) and
    // is acked normally; only a real DB error throws.
    if (error) throw new Error(`setTier(${profileId}) failed: ${error.message}`)
  }

  // A transient handler failure must NOT leave the claim row behind (the next Stripe retry
  // would short-circuit on the duplicate check and the event would never process). On failure
  // we RELEASE the claim and return a non-2xx so Stripe redelivers; every write is idempotent.
  try {
    switch (event.type) {
      case 'account.updated':
        await persistAccount(event.data.object as Stripe.Account)
        break

      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session
        // Member / founders / Space membership entitlement (formerly /api/stripe/webhook).
        if (s.metadata?.kind === 'founders') {
          // Founders Round (ONE-TIME, mode:'payment'): grant the founding membership.
          // Idempotent and shared with the success-page confirm action.
          await grantFounderFromSession(s)
        } else if (!subscriptionKind(s.metadata)) {
          // A Space plan/membership checkout's entitlement write is done by the
          // subscription.created/updated event, so skip the member tier path for those kinds.
          const profileId = s.metadata?.profile_id ?? s.client_reference_id ?? null
          const tier = s.metadata?.tier === 'supporter' ? 'supporter' : 'crew'
          const customerId = typeof s.customer === 'string' ? s.customer : s.customer?.id
          // A completed checkout is a successful payment → the membership is active.
          if (profileId) await setTier(profileId, tier, customerId, 'active', event.created)
        }
        // Payout-channel recorders (formerly /api/webhooks/stripe). Each no-ops on a
        // session that isn't its kind, so they are safe to run for every checkout.
        await recordTipFromSession(s)
        await recordTicketFromSession(s)
        await recordSupporterContributionFromSession(s)
        await recordCommerceOrderFromSession(s)
        break
      }

      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        // A service booking HOLDs its slot (a 'pending' booking) before payment; an abandoned/failed
        // checkout must release it or the slot is blocked forever (Phase 4, ADR-596). No-ops for a
        // non-commerce session.
        const s = event.data.object as Stripe.Checkout.Session
        await abandonCommerceOrderFromSession(s)
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        // Pricing P2 (ADR-363): route Space subscriptions to their reconcilers first; if it
        // was a Space sub, the member tier path is skipped.
        if (await routeSpaceSubscription(sub)) break
        const profileId = sub.metadata?.profile_id
        if (profileId) {
          // Resolve the paid tier from the VALIDATED subscription metadata first (stamped at
          // checkout, so it tracks the synced catalog price), then fall back to the env
          // price-id map (pre-P2 compat). Guard the items index (an event could arrive empty).
          const metaTier = sub.metadata?.tier
          const paidTier =
            metaTier === 'crew' || metaTier === 'supporter'
              ? metaTier
              : tierForPrice(sub.items?.data?.[0]?.price?.id)
          const status = sub.status
          if (status === 'active' || status === 'trialing') {
            await setTier(profileId, paidTier, null, 'active', event.created)
          } else if (status === 'past_due') {
            // Dunning grace (ADR-370): a failed renewal must NOT instantly downgrade a paying
            // member. Keep the paid tier and mark past_due so the recovery banner shows while
            // Stripe retries; only a terminal state below reverts the tier.
            await setTier(profileId, paidTier, null, 'past_due', event.created)
          } else if (status === 'unpaid' || status === 'canceled' || status === 'incomplete_expired') {
            // Terminal: Stripe gave up (unpaid) or the subscription ended → revert to free.
            await setTier(profileId, 'free', null, 'canceled', event.created)
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
        if (profileId) await setTier(profileId, 'free', null, 'canceled', event.created)
        break
      }

      case 'invoice.paid': {
        // A membership subscription invoice was paid (first payment or a renewal).
        // Record it as Foundation dues on the partitioned ledger (idempotent per invoice).
        await recordMembershipDuesFromInvoice(event.data.object as Stripe.Invoice)
        break
      }

      case 'charge.refunded': {
        // A ticket / commerce charge was refunded (host action). Flip the record to
        // `refunded` and free the tier's capacity; no-ops if it isn't ours or was already
        // recorded (idempotent).
        await recordTicketRefundFromCharge(event.data.object as Stripe.Charge)
        await recordCommerceRefundFromCharge(event.data.object as Stripe.Charge)
        break
      }

      default:
        // Other events are added in later phases. Acknowledge unknown events with 200 so
        // Stripe stops retrying.
        break
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
