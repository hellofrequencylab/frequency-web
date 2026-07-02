// Tips — the first payout channel (Phase 2, ADR-176). A signed-in member tips a
// host/partner; the money moves as a Stripe DESTINATION CHARGE: the platform
// creates a one-off Checkout payment, keeps an application fee (lib/billing/fees),
// and transfers the rest to the recipient's connected account (ADR-175). Server-only.
//
// Flow: createTipCheckout validates + records a `pending` tip row + returns the
// hosted Checkout URL. On success Stripe fires checkout.session.completed →
// recordTipFromSession flips the row to `succeeded` (idempotent); the success
// redirect also reconciles via recordTipFromSessionId, so a tip is never lost if
// the webhook isn't wired yet (mirrors the membership checkout pattern).

import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe, appUrl } from './stripe'
import { getConnectStatus, payoutsLive } from './connect'
import { platformFeeCents } from './fees'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordFinancialTransaction, ENTITY_ID } from '@/lib/finance/record'

/** Suggested tip amounts (cents) shown as quick-pick chips. */
export const TIP_PRESETS_CENTS = [300, 500, 1000] as const
export const TIP_MIN_CENTS = 100 // $1
export const TIP_MAX_CENTS = 50000 // $500 — a sane ceiling for a single tip

function db(): SupabaseClient {
  return createAdminClient()
}

export interface TipResult {
  url?: string
  error?: string
}

/** Validate, record a pending tip, and return the hosted Checkout URL. */
export async function createTipCheckout(opts: {
  fromProfileId: string
  toProfileId: string
  amountCents: number
  message?: string | null
}): Promise<TipResult> {
  if (!(await payoutsLive())) return { error: 'Tipping isn’t turned on yet.' }
  if (!stripe) return { error: 'Tipping isn’t turned on yet.' }

  const amount = Math.round(opts.amountCents)
  if (!Number.isFinite(amount) || amount < TIP_MIN_CENTS) return { error: `Minimum tip is $${TIP_MIN_CENTS / 100}.` }
  if (amount > TIP_MAX_CENTS) return { error: `Maximum tip is $${TIP_MAX_CENTS / 100}.` }
  if (opts.fromProfileId === opts.toProfileId) return { error: 'You can’t tip yourself.' }

  // The recipient must be able to actually receive money.
  const status = await getConnectStatus(opts.toProfileId)
  if (!status.accountId || !status.ready) return { error: 'This person isn’t set up to receive tips yet.' }

  const { data: recipient } = await db()
    .from('profiles')
    .select('display_name, handle')
    .eq('id', opts.toProfileId)
    .maybeSingle()
  const recipientRow = recipient as { display_name: string | null; handle: string | null } | null
  const name = recipientRow?.display_name ?? 'a host'
  const handle = recipientRow?.handle

  const fee = platformFeeCents(amount)
  const message = opts.message?.trim().slice(0, 280) || null

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data: { name: `Tip for ${name}`, ...(message ? { description: message } : {}) },
        },
      },
    ],
    // Destination charge: fee stays with the platform, the rest transfers out.
    payment_intent_data: {
      application_fee_amount: fee,
      transfer_data: { destination: status.accountId },
      metadata: { kind: 'tip', from_profile_id: opts.fromProfileId, to_profile_id: opts.toProfileId },
    },
    metadata: { kind: 'tip', from_profile_id: opts.fromProfileId, to_profile_id: opts.toProfileId },
    success_url: `${appUrl()}/people/${handle ?? ''}?tip=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/people/${handle ?? ''}`,
  })

  // The pending row is what recordTipFromSession flips to `succeeded` on payment. If this insert
  // silently fails (supabase-js returns { error }), the webhook would find no row to advance and the
  // tipper would pay for a tip we never recorded. So check it, expire the just-created Stripe session
  // so it can't be paid into a void, and surface an error instead of the checkout URL.
  const { error: pendingErr } = await db().from('tips').insert({
    from_profile_id: opts.fromProfileId,
    to_profile_id: opts.toProfileId,
    amount_cents: amount,
    platform_fee_cents: fee,
    currency: 'usd',
    message,
    status: 'pending',
    stripe_checkout_session_id: session.id,
  })
  if (pendingErr) {
    console.error('[tips] pending tip insert failed', pendingErr.message)
    try {
      await stripe.checkout.sessions.expire(session.id)
    } catch {
      // best-effort — if expiry fails the session simply lapses on its own; we still refuse the URL
    }
    return { error: 'Could not start checkout. Please try again.' }
  }

  if (!session.url) return { error: 'Could not start checkout.' }
  return { url: session.url }
}

/** Mark the tip behind a completed Checkout session as succeeded (idempotent). */
export async function recordTipFromSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.metadata?.kind !== 'tip') return
  if (session.payment_status !== 'paid') return
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
  // Only advance pending → succeeded (idempotent; a redelivered event is a no-op).
  // `.select()` returns the rows we actually flipped, so the ledger append below runs
  // exactly once per tip.
  const { data: updated } = await db()
    .from('tips')
    .update({ status: 'succeeded', succeeded_at: new Date().toISOString(), stripe_payment_intent_id: paymentIntentId })
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'pending')
    .select('id, platform_fee_cents, from_profile_id, currency')
  const rows = (updated ?? []) as {
    id: string
    platform_fee_cents: number
    from_profile_id: string | null
    currency: string
  }[]
  for (const row of rows) {
    // A tip is a Connect destination charge — the gross transfers to the recipient; the
    // entity's (Labs, for-profit) revenue is the platform application fee. Idempotent per
    // tip; best-effort so a ledger hiccup never fails the webhook.
    await recordFinancialTransaction({
      entityId: ENTITY_ID.labs,
      revenueType: 'commerce',
      amountCents: row.platform_fee_cents ?? 0,
      profileId: row.from_profile_id,
      currency: row.currency,
      stripePaymentIntentId: paymentIntentId,
      sourceTable: 'tips',
      sourceId: row.id,
      idempotencyKey: `tip:${row.id}`,
    }).catch(() => {})
  }
}

/** Webhook-independent reconcile on the success redirect — retrieves the session
 *  and records it. Returns the gross amount (cents) when it was a paid tip, else null. */
export async function recordTipFromSessionId(sessionId: string): Promise<number | null> {
  if (!stripe) return null
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    return null
  }
  if (session.metadata?.kind !== 'tip' || session.payment_status !== 'paid') return null
  await recordTipFromSession(session)
  return session.amount_total ?? null
}
