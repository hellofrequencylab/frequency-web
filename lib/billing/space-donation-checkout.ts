// SPACE DONATION CHECKOUT (LIVE-235). A one-off gift to a Space's published fund
// (space_donation_asks), settled as a Stripe Connect DESTINATION CHARGE: the gross transfers to the
// space OWNER's connected account and the platform keeps an application fee equal to the space plan's
// take-rate at the classified order source, which is 0 on a gift from the space's own people
// (ADR-811 §A). ADR-1291 pins the funds flow: destination charges on Express accounts, platform as
// merchant of record. Server-only.
//
// 🔴 WHY THIS FILE EXISTS. Donations were the only one of the five money loops with NO checkout at
// all. The ask surface has shipped since 20260716000000, the owner editor works, the member Donate
// card renders quick-pick amounts, and underneath them sat a line admitting that pressing one did
// nothing. Production holds 0 rows in space_donation_asks, which is what an operator does with a
// configuration screen that cannot produce money.
//
// THE TEMPLATE IS lib/billing/space-membership-checkout.ts, deliberately: it is the loop that works.
// The differences are the two a gift actually has. (1) mode 'payment', not 'subscription', so the fee
// is an absolute `application_fee_amount` rather than a percent. (2) the donor may be SIGNED OUT: a
// gift does not require an account, so donor_profile_id is nullable and the source classification
// degrades to 'self' (the fail-safe direction, which never bills a network rate we cannot justify).
//
// GATED like every other channel: no-ops unless `stripe` is configured AND payoutsLive(), and the
// space owner must have a Connect account that is payout-ready. The one thing that is NOT a gate is
// the operator's plan: taking a donation is free on every tier, and what the paid tiers buy is a
// lower rate (ADR-914, "never gate the transaction").

import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe, appUrl } from './stripe'
import { getConnectStatus, payoutsLive } from './connect'
import { spaceTakeRateCents } from './fees'
import { asSpacePlan } from '@/lib/pricing/plans'
import { classifyOrderSource } from '@/lib/commerce/order-source'
import { effectiveOrderSource } from '@/lib/pricing/network-world'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordFinancialTransaction, ENTITY_ID } from '@/lib/finance/record'

/** Gift bounds. The floor keeps a gift above the card fee that would eat it; the ceiling is the same
 *  sanity bound the ask editor already clamps a suggested amount to. */
export const DONATION_MIN_CENTS = 100
export const DONATION_MAX_CENTS = 100_000_000

/** Member-facing copy for a gift that could not start. One string so every failure arm agrees. */
const DONATION_START_FAILED = 'Could not start your gift. Please try again.'

function db(): SupabaseClient {
  return createAdminClient()
}

/**
 * Is this Supabase error just "the table is not there yet"?
 *
 * 🔴 THE ONE ORDERING HAZARD IN THIS FILE. Migrations are applied to production by hand through the
 * SQL editor (house style), so there is a real window where this code is deployed and
 * `space_donations` is not. Every OTHER entry point in this module is guarded by
 * `metadata.kind === 'space_donation'`, which cannot be true before a donation checkout has run, so
 * they never reach the table in that window. The REFUND path is the exception: `charge.refunded`
 * carries no session metadata, so it runs for every full refund on the platform, and a thrown
 * "relation does not exist" would 500 the Stripe webhook into a redelivery loop that also re-fires
 * the ticket, commerce, tip and supporter refund handlers beside it.
 *
 * So a MISSING TABLE is a no-op (there can be no donation to refund) and every other error still
 * throws, which keeps the real guarantee: a refund the database refuses is never acked as done.
 * 42P01 is Postgres `undefined_table`; PGRST205 is PostgREST's schema-cache miss for the same thing.
 */
function isMissingTable(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

export interface DonationCheckoutResult {
  url?: string
  error?: string
}

/** PURE: clamp + validate a donor's chosen amount. Returns the charge in cents, or the member-facing
 *  refusal. Exported so the button, the action and this module all enforce the same floor. */
export function resolveDonationCents(raw: unknown): { cents: number } | { error: string } {
  const cents = Math.round(Number(raw))
  if (!Number.isFinite(cents) || cents <= 0) return { error: 'Enter an amount.' }
  if (cents < DONATION_MIN_CENTS) return { error: `Minimum gift is $${DONATION_MIN_CENTS / 100}.` }
  if (cents > DONATION_MAX_CENTS) return { error: 'That amount is too large.' }
  return { cents }
}

interface SpaceRow {
  id: string
  slug: string | null
  owner_profile_id: string | null
  plan: string | null
  network_connected: boolean | null
  name: string | null
  brand_name: string | null
}

/**
 * Create a one-off Checkout for a gift to a Space's fund. Returns the hosted URL, or a member-facing
 * error when the gift cannot start.
 *
 * authz-delegated: giving needs no permission (anyone may give to a public fund), so the only
 * authority questions are "does this Space have an ACTIVE ask" and "can its owner receive money".
 * The donor id is resolved by the caller from the session and never posted by the client.
 */
export async function createSpaceDonationCheckout(opts: {
  spaceId: string
  amountCents: number
  donorProfileId: string | null
  message?: string | null
}): Promise<DonationCheckoutResult> {
  if (!stripe) return { error: 'Giving is not turned on yet.' }
  if (!(await payoutsLive())) return { error: 'Giving is not turned on yet.' }

  const amountCheck = resolveDonationCents(opts.amountCents)
  if ('error' in amountCheck) return { error: amountCheck.error }
  const amount = amountCheck.cents

  try {
    const { data: spaceData } = await db()
      .from('spaces')
      .select('id, slug, owner_profile_id, plan, network_connected, name, brand_name')
      .eq('id', opts.spaceId)
      .maybeSingle()
    const space = (spaceData ?? null) as SpaceRow | null
    if (!space?.id || !space.owner_profile_id) return { error: 'This fund is not available.' }

    // The owner must be able to receive money. This is the ONE remaining prerequisite on every money
    // path, and LIVE-233 puts the shared Connect prompt in front of it on the operator's side, so an
    // operator reaching this refusal has already been offered the fix where they set the fund up.
    const ownerStatus = await getConnectStatus(space.owner_profile_id)
    if (!ownerStatus.accountId || !ownerStatus.ready) {
      return { error: 'This space cannot take gifts yet. Follow it to hear when giving opens.' }
    }

    // The ACTIVE ask is what the donor is giving to. A hidden or absent ask means the fund is closed.
    const { data: askData } = await db()
      .from('space_donation_asks')
      .select('id, fund_label, is_active')
      .eq('space_id', space.id)
      .maybeSingle()
    const ask = (askData ?? null) as { id?: string; fund_label?: string | null; is_active?: boolean | null } | null
    if (!ask?.id || ask.is_active === false) return { error: 'This fund is not open right now.' }

    // Differential take-rate (ADR-811 §A): a gift from the space's own people is 0% (the hard
    // promise); one the collective sourced pays the plan's network rate. A SIGNED-OUT donor cannot be
    // related to anyone, so classification degrades to 'self' and the fee is 0, which is the
    // fail-safe direction (never bill a network rate we cannot justify).
    const { source } = opts.donorProfileId
      ? await classifyOrderSource({
          buyerProfileId: opts.donorProfileId,
          sellerProfileId: space.owner_profile_id,
          sellerSpaceId: space.id,
        })
      : { source: 'self' as const }
    // A standalone (disconnected) Space has left the graph, so it can have no network-sourced revenue
    // (ADR-811 §3) and the source collapses to self regardless of any referral signal.
    const effective = effectiveOrderSource(source, space.network_connected)
    const fee = await spaceTakeRateCents(amount, asSpacePlan(space.plan), effective)

    const fundLabel = (ask.fund_label ?? '').trim() || 'the fund'
    const spaceName = (space.brand_name ?? space.name ?? 'this space').trim()
    const message = opts.message?.trim().slice(0, 280) || null
    const backHref = `${appUrl()}/spaces/${space.slug ?? space.id}`
    const metadata: Record<string, string> = {
      kind: 'space_donation',
      space_id: space.id,
      ask_id: ask.id,
      ...(opts.donorProfileId ? { donor_profile_id: opts.donorProfileId } : {}),
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: {
              name: `${fundLabel} (${spaceName})`,
              ...(message ? { description: message } : {}),
            },
          },
        },
      ],
      // Connect destination charge: the fee stays with the platform, the rest transfers to the owner.
      payment_intent_data: {
        application_fee_amount: fee,
        transfer_data: { destination: ownerStatus.accountId },
        metadata,
      },
      ...(opts.donorProfileId ? { client_reference_id: opts.donorProfileId } : {}),
      metadata,
      success_url: `${backHref}?donation=thanks&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: backHref,
    })

    // The PENDING row is what recordSpaceDonationFromSession flips to succeeded. Written BEFORE the
    // URL is handed back and CHECKED, for the reason lib/billing/tips.ts learned the hard way: a
    // silently failed insert leaves a payable session with nothing behind it, so the donor pays and
    // the webhook finds no row to advance. On a failed insert the session is expired so it cannot be
    // paid into a void, and the error is surfaced instead of the URL.
    const { error: pendingErr } = await db()
      .from('space_donations')
      .insert({
        space_id: space.id,
        ask_id: ask.id,
        donor_profile_id: opts.donorProfileId,
        amount_cents: amount,
        platform_fee_cents: fee,
        currency: 'usd',
        source: effective,
        message,
        status: 'pending',
        stripe_checkout_session_id: session.id,
      })
    if (pendingErr) {
      console.error('[space-donation] pending insert failed', pendingErr.message)
      try {
        await stripe.checkout.sessions.expire(session.id)
      } catch {
        // Best-effort: an un-expired session simply lapses on its own. We refuse the URL either way.
      }
      return { error: DONATION_START_FAILED }
    }

    if (!session.url) return { error: DONATION_START_FAILED }
    return { url: session.url }
  } catch (err) {
    console.error('[space-donation] checkout failed', err instanceof Error ? err.message : String(err))
    return { error: DONATION_START_FAILED }
  }
}

/**
 * Flip the donation behind a completed Checkout session to `succeeded` and append its ledger row.
 * Idempotent: the update is keyed on the session id AND `status = 'pending'`, and `.select()` returns
 * only the rows actually flipped, so a redelivered webhook advances nothing and books nothing twice.
 * No-ops on a session that is not a donation or is not paid, so it is safe to run for every checkout.
 */
export async function recordSpaceDonationFromSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.metadata?.kind !== 'space_donation') return
  if (session.payment_status !== 'paid') return
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null

  const { data: updated, error } = await db()
    .from('space_donations')
    .update({
      status: 'succeeded',
      succeeded_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'pending')
    .select('id, platform_fee_cents, donor_profile_id, currency')
  // The status flip is NOT best-effort: a settled payment the DB refuses to record would otherwise be
  // acked 200 and lost. Throwing releases the webhook's claim and returns non-2xx, so Stripe
  // redelivers into a working write. The LEDGER append below stays best-effort, as it is everywhere.
  if (error && !isMissingTable(error)) {
    throw new Error(`[space-donation] settle failed (session=${session.id}): ${error.message}`)
  }

  const rows = (updated ?? []) as {
    id: string
    platform_fee_cents: number | null
    donor_profile_id: string | null
    currency: string | null
  }[]
  for (const row of rows) {
    await recordFinancialTransaction({
      entityId: ENTITY_ID.labs,
      revenueType: 'commerce',
      amountCents: row.platform_fee_cents ?? 0,
      profileId: row.donor_profile_id,
      currency: row.currency ?? 'usd',
      stripePaymentIntentId: paymentIntentId,
      sourceTable: 'space_donations',
      sourceId: row.id,
      idempotencyKey: `space-donation:${row.id}`,
    }).catch(() => {})
  }
}

/** Webhook-independent reconcile on the success redirect: retrieve the session and settle it. Returns
 *  the gross (cents) when it was a paid donation, else null. Mirrors recordTipFromSessionId. */
export async function recordSpaceDonationFromSessionId(sessionId: string): Promise<number | null> {
  if (!stripe) return null
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    return null
  }
  if (session.metadata?.kind !== 'space_donation' || session.payment_status !== 'paid') return null
  await recordSpaceDonationFromSession(session)
  return session.amount_total ?? null
}

/** Release a donation whose Checkout expired or whose delayed payment failed, so a `pending` row does
 *  not sit in the fund view forever. Idempotent (pending -> abandoned only). No-ops for a non-donation. */
export async function abandonSpaceDonationFromSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.metadata?.kind !== 'space_donation') return
  await db()
    .from('space_donations')
    .update({ status: 'abandoned', updated_at: new Date().toISOString() })
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'pending')
}

/**
 * Flip a `succeeded` donation to `refunded` and reverse its ledger entry (idempotent; keyed on the
 * PaymentIntent, succeeded -> refunded only). Mirrors recordTipRefund: a negative 'refund' row on the
 * same entity for exactly the fee the succeed path booked, so the ledger stays an honest net.
 *
 * Like the settle, the status flip throws rather than swallowing: a refund the DB refuses to record
 * would be acked 200 and lost.
 */
export async function recordSpaceDonationRefund(paymentIntentId: string | null): Promise<void> {
  if (!paymentIntentId) return
  const { data: updated, error } = await db()
    .from('space_donations')
    .update({ status: 'refunded', refunded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', paymentIntentId)
    .eq('status', 'succeeded')
    .select('id, platform_fee_cents, donor_profile_id, currency')
  if (error) {
    if (isMissingTable(error)) return
    throw new Error(`[space-donation] refund flip failed (pi=${paymentIntentId}): ${error.message}`)
  }

  const rows = (updated ?? []) as {
    id: string
    platform_fee_cents: number | null
    donor_profile_id: string | null
    currency: string | null
  }[]
  for (const row of rows) {
    await recordFinancialTransaction({
      entityId: ENTITY_ID.labs,
      revenueType: 'refund',
      amountCents: -(row.platform_fee_cents ?? 0),
      profileId: row.donor_profile_id,
      currency: row.currency ?? 'usd',
      stripePaymentIntentId: paymentIntentId,
      sourceTable: 'space_donations',
      sourceId: row.id,
      idempotencyKey: `space-donation-refund:${row.id}`,
    }).catch(() => {})
  }
}

/** The `charge.refunded` shape, matching recordTipRefundFromCharge: only a FULL refund flips the row
 *  (a partial refund leaves the gift recorded and the ledger honest), and the PaymentIntent is what
 *  resolves it back to a donation. No-ops for a charge that is not ours. */
export async function recordSpaceDonationRefundFromCharge(charge: Stripe.Charge): Promise<void> {
  if ((charge.amount_refunded ?? 0) < (charge.amount ?? 0)) return
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null
  await recordSpaceDonationRefund(paymentIntentId)
}

/**
 * Can this Space actually take a gift right now? The member Donate card asks before it renders a
 * button, so a donor is never handed a control that resolves to a refusal. Same three conditions the
 * checkout enforces (a configured Stripe, the platform payouts switch, an owner who can receive
 * money), read here so the surface and the action agree.
 *
 * FAIL-SAFE to false: an unreadable space renders the honest "giving is not open" copy rather than a
 * button that cannot work. Never calls Stripe.
 */
export async function spaceCanTakeDonations(spaceId: string): Promise<boolean> {
  if (!stripe || !spaceId) return false
  if (!(await payoutsLive())) return false
  try {
    const { data } = await db()
      .from('spaces')
      .select('owner_profile_id')
      .eq('id', spaceId)
      .maybeSingle()
    const ownerId = (data as { owner_profile_id?: string | null } | null)?.owner_profile_id ?? null
    if (!ownerId) return false
    const status = await getConnectStatus(ownerId)
    return !!status.accountId && status.ready
  } catch {
    return false
  }
}
