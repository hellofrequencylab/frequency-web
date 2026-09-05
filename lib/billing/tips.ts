// Tips — the first payout channel (Phase 2, ADR-176). A signed-in member tips a
// host/partner; the money moves as a Stripe DESTINATION CHARGE: the platform
// creates a one-off Checkout payment with a ZERO application fee (ADR-913 — a tip is a gratuity
// between people and Frequency takes none of it) and transfers the full amount to the recipient's
// connected account (ADR-175). Server-only.
//
// Flow: createTipCheckout validates + records a `pending` tip row + returns the
// hosted Checkout URL. On success Stripe fires checkout.session.completed →
// recordTipFromSession flips the row to `succeeded` (idempotent); the success
// redirect also reconciles via recordTipFromSessionId, so a tip is never lost if
// the webhook isn't wired yet (mirrors the membership checkout pattern).
//
// Refund (2026-09-05, L2-07): a tip refunded from the Stripe dashboard fires charge.refunded;
// recordTipRefundFromCharge flips the `succeeded` row to `refunded` (keyed on the payment
// intent, idempotent) and reverses the ledger entry through the same seam the ticket refund
// uses. Before this the tip had no refund path at all: the row stayed `succeeded`, the
// recipient's tip total and the ledger revenue never moved.

// ── `import 'server-only'` IS THE POINT OF THE LINE BELOW, NOT DECORATION (LIVE-037) ──────────
// The header above already said "Server-only." A comment enforces nothing: tip-button.tsx
// imported three constants from here and shipped the service-role client to the browser anyway.
// The directive turns the intent into a BUILD FAILURE that names the importer.
import 'server-only'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe, appUrl } from './stripe'
import { getConnectStatus, payoutsLive } from './connect'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordFinancialTransaction, ENTITY_ID } from '@/lib/finance/record'
import { notifyTipRecipient } from './tips-notify'

// The amounts live in ./tips-core (dependency-free) so client components can read them
// without dragging this module's admin client + Stripe SDK into the browser (LIVE-037).
// Re-exported here so every existing server caller is unchanged.
export { TIP_PRESETS_CENTS, TIP_MIN_CENTS, TIP_MAX_CENTS } from './tips-core'
import { TIP_MIN_CENTS, TIP_MAX_CENTS } from './tips-core'

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

  // 🔴 NO PLATFORM FEE ON A TIP (owner ruling, 2026-07-30). A tip is a gratuity between people: the
  // sender is already someone the recipient earned, so charging it contradicts the promise the whole
  // pricing model now rests on — "once you have your contact, Frequency doesn't take a cut" (ADR-913).
  // It was also the ONLY money surface with no source classification at all, so a tip from a
  // recipient's own follower was charged where the identical person buying a ticket was not.
  //
  // Zero, not "the self rate". A tip has no order source to classify and never will: there is no
  // listing, no discovery surface, and nothing for Frequency to have sourced. Passing 0 as an
  // explicit application fee (rather than omitting it) keeps the destination charge shape identical
  // to the other channels, so the webhook + refund paths need no special case.
  // (2026-09-05 correction, L2-07: "the refund path" did not exist for tips until
  // recordTipRefundFromCharge below; the shape argument was right, the path was missing.)
  const fee = 0
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
    .select('id, platform_fee_cents, from_profile_id, currency, to_profile_id, amount_cents, message')
  const rows = (updated ?? []) as {
    id: string
    platform_fee_cents: number
    from_profile_id: string | null
    currency: string
    to_profile_id: string
    amount_cents: number
    message: string | null
  }[]
  for (const row of rows) {
    // 2026-09-05 (scan2 L9-05): tell the recipient. Runs once per flipped row, so a redelivered
    // event (zero rows flipped) never notifies twice. Best-effort like the ledger append below.
    await notifyTipRecipient(row).catch(() => {})
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

/**
 * Flip a `succeeded` tip to `refunded` and reverse its ledger entry (idempotent; succeeded →
 * refunded only, keyed on the PaymentIntent). Mirrors recordTicketRefund (lib/billing/tickets.ts):
 * a negative 'refund' row on the same entity, keyed `tip-refund:<id>` so a redelivered
 * charge.refunded appends nothing twice. The reversed amount is the platform fee the succeed
 * path booked (0 since ADR-913), so the ledger stays an exact net of what was recorded.
 *
 * The status flip is NOT best-effort: a refund the DB refuses to record would otherwise be
 * acked 200 and lost, so the error is thrown and the webhook releases its claim + 500s (Stripe
 * redelivers). The ledger append stays best-effort, as on the succeed path.
 */
export async function recordTipRefund(paymentIntentId: string | null): Promise<void> {
  if (!paymentIntentId) return
  const { data: updated, error } = await db()
    .from('tips')
    .update({ status: 'refunded', refunded_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', paymentIntentId)
    .eq('status', 'succeeded')
    .select('id, platform_fee_cents, from_profile_id, currency')
  if (error) throw new Error(`[tips] refund flip failed (pi=${paymentIntentId}): ${error.message}`)
  const rows = (updated ?? []) as {
    id: string
    platform_fee_cents: number
    from_profile_id: string | null
    currency: string
  }[]
  for (const row of rows) {
    await recordFinancialTransaction({
      entityId: ENTITY_ID.labs,
      revenueType: 'refund',
      amountCents: -(row.platform_fee_cents ?? 0),
      profileId: row.from_profile_id,
      currency: row.currency,
      stripePaymentIntentId: paymentIntentId,
      sourceTable: 'tips',
      sourceId: row.id,
      idempotencyKey: `tip-refund:${row.id}`,
    }).catch(() => {})
  }
}

/** Resolve a `charge.refunded` event's PaymentIntent and reconcile the tip behind it. Only a
 *  FULL refund unwinds the tip (a partial refund must not flip the row or reverse the full fee,
 *  the same guard recordTicketRefundFromCharge applies). No-ops on a charge that isn't a tip:
 *  the kind tag lives on the PaymentIntent, not the Charge, so no metadata is consulted and the
 *  `succeeded` tip match on the intent id is the whole filter. */
export async function recordTipRefundFromCharge(charge: Stripe.Charge): Promise<void> {
  if ((charge.amount_refunded ?? 0) < (charge.amount ?? 0)) return
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null
  await recordTipRefund(paymentIntentId)
}
