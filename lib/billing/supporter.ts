// SUPPORTER CONTRIBUTIONS — the pay-what-you-want (PWYW) backing channel behind the Crew
// "Supporter" badge (Pricing ladder Phase C, ADR-463 / ADR-495). Supporter is retired as a
// tier and is now an opt-in PWYW badge on Crew (profiles.is_supporter). This module owns the
// actual CONTRIBUTION CHARGE + the `supporter_contributions` ledger, DORMANT until billing
// goes live: the gate lives at the action call site (startSupporterContribution), so while
// `billing_live` is OFF the badge toggle stays badge-only (today's behavior) and nothing here
// is ever reached with a live Stripe session.
//
// A contribution is a ONE-TIME Stripe charge (mode:'payment'), mirroring the Founders Round
// one-time flow: the charge is a direct platform payment (NOT a Connect destination charge like
// tips), so the full amount is the Foundation's revenue, booked as a `donation` on the
// entity-partitioned ledger (lib/finance/record.ts). The badge (is_supporter) is the ongoing
// state; each successful contribution is a discrete ledger row.
//
// Flow (mirrors tips/founders): the action validates the PWYW amount, records a `pending`
// supporter_contributions row + returns the hosted Checkout URL. On success Stripe fires
// checkout.session.completed -> recordSupporterContributionFromSession flips the row to
// `succeeded` (idempotent) and appends the Foundation ledger entry; the success redirect also
// reconciles via recordSupporterContributionFromSessionId, so a contribution is never lost if
// the webhook isn't wired yet. Server-only (service-role writes).

import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordFinancialTransaction, ENTITY_ID } from '@/lib/finance/record'

/** The metadata `kind` tag on a supporter-contribution Checkout session, so the shared
 *  webhook / confirm recorders route to the right handler and no-op on other sessions. */
export const SUPPORTER_CONTRIBUTION_KIND = 'supporter_contribution' as const

/** A sane ceiling for a single PWYW contribution (mirrors TIP_MAX_CENTS). The floor is the
 *  operator-set PWYW minimum (catalog.pwyw.minCents), passed in per call. */
export const SUPPORTER_MAX_CENTS = 100000 // $1,000

/** Is a chosen PWYW amount valid against the operator floor + the ceiling? PURE — the single
 *  validation both the action and its tests share. A non-finite / sub-floor / over-ceiling
 *  amount is rejected (default-deny) so we never open a checkout for a bad amount. */
export function isValidContributionAmount(amountCents: number, minCents: number): boolean {
  if (!Number.isFinite(amountCents)) return false
  const amount = Math.round(amountCents)
  return amount >= Math.max(1, Math.round(minCents)) && amount <= SUPPORTER_MAX_CENTS
}

// The supporter_contributions table isn't in the generated types yet (ADR-246) — reach it
// through a localized untyped view, the repo convention for a not-yet-typed table (see
// lib/pricing/gates.ts pricing_feature_gates). Drop after `gen types`.
interface ContributionsTable {
  from: (t: 'supporter_contributions') => {
    insert: (v: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>
    update: (v: Record<string, unknown>) => {
      eq: (c: string, val: unknown) => {
        eq: (c2: string, val2: unknown) => {
          select: (
            cols: string,
          ) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>
        }
      }
    }
  }
}

function contribDb(): ContributionsTable {
  return createAdminClient() as unknown as ContributionsTable
}

/** Insert the `pending` contribution row the recorder later flips to `succeeded`. Returns the
 *  DB error message (or null on success), so the action can refuse the checkout URL and expire
 *  the just-created Stripe session if the row never landed (mirrors createTipCheckout). */
export async function insertPendingContribution(opts: {
  profileId: string
  amountCents: number
  checkoutSessionId: string
}): Promise<string | null> {
  const { error } = await contribDb()
    .from('supporter_contributions')
    .insert({
      profile_id: opts.profileId,
      amount_cents: Math.round(opts.amountCents),
      currency: 'usd',
      status: 'pending',
      stripe_checkout_session_id: opts.checkoutSessionId,
    })
  return error ? error.message ?? 'insert failed' : null
}

/**
 * Mark the contribution behind a completed Checkout session as succeeded (idempotent), turn the
 * member's Supporter badge ON, and append the Foundation `donation` ledger entry. The SINGLE
 * grant point shared by the webhook branch and the success-page confirm, so the contribution is
 * recorded exactly once regardless of which fires first. A non-contribution / unpaid session is a
 * clean no-op (returns null).
 *
 * authz-delegated: the contributor identity is bound to the Stripe session (metadata.profile_id,
 * written by the gated startSupporterContribution from the auth session, never client-supplied),
 * and every write is scoped to the pending row for THIS session id. Stripe is the authority for
 * "this payment happened, for this profile." Does NOT trust billingLive(): it is only ever reached
 * AFTER a real paid Stripe session exists (gate enforced at session creation).
 */
export async function recordSupporterContributionFromSession(
  session: Stripe.Checkout.Session,
): Promise<{ recorded: boolean; amountCents: number } | null> {
  if (session.metadata?.kind !== SUPPORTER_CONTRIBUTION_KIND) return null
  if (session.payment_status !== 'paid') return null

  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null

  // Only advance pending -> succeeded (idempotent; a redelivered event flips nothing and the
  // ledger append below runs exactly once per contribution). `.select()` returns the rows we
  // actually flipped.
  const { data: updated } = await contribDb()
    .from('supporter_contributions')
    .update({
      status: 'succeeded',
      succeeded_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'pending')
    .select('id, amount_cents, profile_id, currency')

  const rows = (updated ?? []) as {
    id: string
    amount_cents: number
    profile_id: string | null
    currency: string
  }[]

  if (rows.length === 0) return { recorded: false, amountCents: 0 }

  const admin = createAdminClient()
  let amountCents = 0
  for (const row of rows) {
    amountCents = row.amount_cents ?? 0
    // A supporter contribution is a direct platform payment (not a Connect charge) — the full
    // amount is the Foundation's revenue, booked as a donation. Idempotent per contribution;
    // best-effort so a ledger hiccup never fails the webhook.
    await recordFinancialTransaction({
      entityId: ENTITY_ID.foundation,
      revenueType: 'donation',
      amountCents,
      profileId: row.profile_id,
      currency: row.currency,
      stripePaymentIntentId: paymentIntentId,
      sourceTable: 'supporter_contributions',
      sourceId: row.id,
      idempotencyKey: `supporter_contribution:${row.id}`,
    }).catch(() => {})

    // A successful contribution turns the Supporter badge ON (the ongoing state). Scoped to the
    // contributor's own profile id from the session; harmless to re-run (writes a fixed value).
    if (row.profile_id) {
      await admin.from('profiles').update({ is_supporter: true }).eq('id', row.profile_id)
    }
  }

  return { recorded: true, amountCents }
}

/** Webhook-independent reconcile on the success redirect — retrieves the session and records it.
 *  Returns the gross amount (cents) when it was a paid contribution, else null. Mirrors
 *  recordTipFromSessionId. The caller passes the live Stripe client. */
export async function recordSupporterContributionFromSessionId(
  stripe: Stripe | null,
  sessionId: string,
): Promise<number | null> {
  if (!stripe) return null
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    return null
  }
  if (session.metadata?.kind !== SUPPORTER_CONTRIBUTION_KIND || session.payment_status !== 'paid') return null
  const res = await recordSupporterContributionFromSession(session)
  return res?.amountCents ?? null
}
