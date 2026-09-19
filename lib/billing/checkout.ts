// Stripe checkout + billing-portal session creation (P2.2). Server-only. No-ops
// (return null) when billing isn't configured, so callers degrade gracefully.
//
// Works with JUST the Stripe connector (STRIPE_SECRET_KEY): if no explicit price id is
// set, checkout builds an inline subscription price, and `confirmCheckout` flips the
// member's tier on the success redirect — so the upgrade works even before a webhook
// is wired (the webhook then handles async events + cancellation).

import type Stripe from 'stripe'
import { stripe, appUrl } from './stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordFinancialTransaction, ENTITY_ID } from '@/lib/finance/record'
import type { EntitlementTier } from '@/lib/core/entitlement'
import type { BillingPeriod } from './pricing-keys'
import { receiptEmailFor } from './receipt-address'
import { sendMembershipInvoiceReceipt } from './subscription-receipt'
import { checkoutReturnFields, resolveCheckoutSession, type CheckoutUi } from './checkout-ui'

/** The member tier a checkout may be opened for. Crew, and only Crew: the sellable member ladder is
 *  Member (free) and Crew (ADR-878). Narrowing this here is what makes a Supporter purchase
 *  unrepresentable rather than merely unreachable. */
type PaidTier = 'crew'

export interface MembershipCheckoutResult {
  url?: string
  /** An on-page (elements) session's secret. EXACTLY ONE of this and `url` is ever set: an elements
   *  session has no url, and a hosted one has no secret. Branch on what came back, never on what was
   *  asked for (docs/CHECKOUT.md §3). */
  clientSecret?: string
  /** The session id, so the control can settle from its success handler rather than waiting on the
   *  webhook. Handed back for BOTH shapes. */
  sessionId?: string
}

/** Create a subscription Checkout session for Crew; returns a hosted URL, an on-page client secret,
 *  or null when the checkout cannot start.
 *
 *  🔴 CREW IS PAY WHAT YOU WANT, so `amountCents` is REQUIRED. The session always bills an INLINE
 *  recurring price at exactly the amount the member picked. There is no catalog price to resolve, no
 *  founder variant, and no grandfathered `locked_price_id` lookup, because all three are answers to
 *  "what is the price of Crew" and Crew has no price: the member sets it and can change it.
 *
 *  THE FOUNDER LOCK IS GONE FROM THIS PATH ON PURPOSE (owner directive, 2026-07-30: "forget the founding
 *  member purchase path"). It used to run first, so a profile carrying `locked_price_id` would have been
 *  charged that old fixed price and the amount they had just chosen on the picker would have been
 *  silently discarded. Making the amount required rather than optional is what makes that unrepresentable
 *  instead of merely unreached: there is no longer a code path through this function that charges a
 *  member anything other than what they picked.
 *
 *  The amount MUST already be validated against the operator PWYW floor by the caller
 *  (lib/pricing/catalog-config.ts isValidPwywAmount); this function refuses a non-positive amount but is
 *  not the policy seam. ANNUAL is 10x the chosen monthly (two months free, the house convention), which
 *  the caller computes so the member sees the annual figure before they commit to it. */
export async function createMembershipCheckout(opts: {
  profileId: string
  email?: string | null
  tier: PaidTier
  period?: BillingPeriod
  /** The member's chosen PWYW amount in cents (already validated against the operator floor). */
  amountCents: number
  ui?: CheckoutUi
}): Promise<MembershipCheckoutResult | null> {
  if (!stripe) return null
  // Defaults to hosted, which is what makes this rollout safe surface by surface: every caller that
  // does not ask for the on-page form keeps today's redirect exactly (docs/CHECKOUT.md §2).
  const ui: CheckoutUi = opts.ui === 'elements' ? 'elements' : 'hosted'

  const period: BillingPeriod = opts.period ?? 'monthly'
  const chosen =
    Number.isFinite(opts.amountCents) && opts.amountCents > 0 ? Math.round(opts.amountCents) : null
  // Default-deny: an unusable amount is a caller bug, and minting a session at some fallback price is
  // exactly the "charged a number they never chose" failure this path exists to prevent.
  if (chosen === null) return null

  // DIRECTION — FAIL CLOSED (SCAN-539). A PostgREST error arrives in `error`, not as a throw, so an
  // unchecked read left `profileRow` null and the session below was minted with NO customer, which makes
  // Stripe create a BRAND NEW customer for a member who already has one. That is not a degraded read, it
  // is a permanent split identity: the member's subscriptions, invoices, payment methods and billing
  // portal end up on two customers, and nothing after the fact can tell which is theirs. Refusing (null,
  // the function's existing default-deny arm) costs a retryable upgrade click. A member who genuinely has
  // no customer yet (`data === null`, no error) still checks out with customer_email, as before.
  const { data: profile, error: profileErr } = await createAdminClient()
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', opts.profileId)
    .maybeSingle()
  if (profileErr) {
    console.error('[billing] stripe_customer_id unreadable, refusing checkout:', profileErr.message)
    return null
  }
  const profileRow = profile as { stripe_customer_id?: string | null } | null

  // The stable Crew Product, so the ad-hoc PWYW prices every checkout mints roll up under ONE product
  // in Stripe instead of littering the dashboard with a product per subscriber. Falls back to inline
  // product_data when it is unset, which keeps a bare-connector install working.
  const crewProductId = process.env.STRIPE_PRODUCT_CREW || null
  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
    quantity: 1,
    price_data: {
      currency: 'usd',
      ...(crewProductId
        ? { product: crewProductId }
        : { product_data: { name: 'Frequency Membership (Crew)' } }),
      unit_amount: chosen,
      recurring: { interval: period === 'annual' ? 'year' : 'month' },
    },
  }

  const customer = profileRow?.stripe_customer_id ?? undefined

  // STRIPE'S OWN RECEIPT, AS A BACKSTOP (LIVE-344). A subscription takes no `receipt_email` (it is a
  // payment-intent parameter), so the CUSTOMER's address is the equivalent: it is where every invoice
  // receipt goes. The caller's `email` is whatever the surface happened to hold, so fall back to the
  // member's proven account address rather than minting a customer Stripe can never write to.
  const receiptEmail = opts.email ?? (await receiptEmailFor(opts.profileId))

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [lineItem],
    ...(customer ? { customer } : { customer_email: receiptEmail ?? undefined }),
    client_reference_id: opts.profileId,
    // The chosen amount rides the metadata so the success redirect + the webhook can resolve the
    // Supporter mark from what the member actually picked, without re-reading the Stripe price.
    metadata: {
      profile_id: opts.profileId,
      tier: opts.tier,
      billing_period: period,
      pwyw_amount_cents: String(chosen),
    },
    subscription_data: {
      metadata: {
        profile_id: opts.profileId,
        tier: opts.tier,
        billing_period: period,
        pwyw_amount_cents: String(chosen),
      },
    },
    // Hosted takes success_url + cancel_url; an elements session REJECTS both and takes a single
    // return_url. Hand-writing either pair fails at RUNTIME, in a money path, because the stripe
    // package ships no type declarations (docs/CHECKOUT.md §3).
    ...checkoutReturnFields(ui, {
      successUrl: `${appUrl()}/settings/billing?upgraded=1&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl()}/upgrade`,
    }),
    allow_promotion_codes: true,
  })
  // 🔴 TRAP 1 (docs/CHECKOUT.md §3): `!session.url` is TRUE FOR EVERY ELEMENTS SESSION. Ask the
  // resolver, never the URL. The resolver also owns the degrade: an elements request Stripe will
  // not honour comes back as the hosted URL rather than an error, so the buyer always has a way
  // to pay.
  const handed = resolveCheckoutSession(session, ui, 'membership')
  if (handed.error) return null
  return { url: handed.url, clientSecret: handed.clientSecret, sessionId: session.id }
}

/**
 * THE SETTLE'S RECORDER (docs/CHECKOUT.md §3). Grant Crew from an on-page checkout session id, in
 * the buyer's own tab, rather than waiting on the webhook.
 *
 * 🔴 THIS PATH MUST STAY KIND-LESS. The member-entitlement allowlist is
 * `s.mode === 'subscription' && !s.metadata?.kind` (SCAN-541). Stamping a `kind` here would stop
 * granting Crew to someone who paid, with no error anywhere. confirmCheckout is the same function
 * the success-redirect already uses, so the two paths cannot drift.
 */
export async function recordCrewCheckoutFromSessionId(sessionId: string): Promise<boolean> {
  if (!stripe) return false
  if (!sessionId.startsWith('cs_')) return false

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    return false
  }
  // The allowlist, restated positively: Crew is the one subscription that emits NO kind.
  if (session.mode !== 'subscription' || session.metadata?.kind) return false
  const profileId = session.metadata?.profile_id ?? session.client_reference_id
  if (!profileId) return false

  const tier = await confirmCheckout(sessionId, profileId)
  return tier === 'crew'
}

/**
 * Confirm a completed checkout on the success redirect and flip the member's tier
 * (a webhook-independent fallback). Verifies the session is paid AND belongs to this
 * profile before writing. Returns the new tier, or null if not applicable.
 */
export async function confirmCheckout(sessionId: string, profileId: string): Promise<EntitlementTier | null> {
  if (!stripe) return null
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    return null
  }
  if (session.payment_status !== 'paid') return null
  if ((session.metadata?.profile_id ?? session.client_reference_id) !== profileId) return null

  // Only a member Crew subscription grants a membership tier here. A one-time
  // Founders payment (mode:'payment', kind:'founders') and Space subscriptions
  // (kind:'space_plan'/'space_membership') are ALSO 'paid' sessions for this profile —
  // without this guard, opening /settings/billing?session_id=<founders session> would
  // flip the member to Crew for a one-time payment. Mirrors the webhook's routing.
  if (session.mode !== 'subscription' || session.metadata?.kind) return null

  // READ TOLERANCE, not a sell path. Nothing opens a Supporter checkout any more (ADR-878), but a
  // session minted before that change could still land here: honor it as 'crew' + the is_supporter
  // PWYW BADGE, never as a tier (the membership_tier CHECK rejects it, and since 2026-08-24
  // EntitlementTier has no such label to write). This tolerance lives HERE, on the boundary, because
  // Stripe session metadata is an external string the union cannot constrain — unlike the profile
  // column, whose retired read-time fold is gone precisely because the column can no longer hold it.
  //
  // PWYW: a member who chose at or above the suggested amount also earns the Supporter mark. The mark is
  // RECOGNITION ONLY — every Crew amount buys identical access — so a failure to resolve it must never
  // block the upgrade, hence the best-effort try/catch that degrades to "no mark".
  let isSupporter = session.metadata?.tier === 'supporter'
  const pwywAmount = Number(session.metadata?.pwyw_amount_cents)
  if (!isSupporter && Number.isFinite(pwywAmount) && pwywAmount > 0) {
    try {
      const { loadCatalogConfig, earnsSupporterMark } = await import('@/lib/pricing/catalog-config')
      isSupporter = earnsSupporterMark(pwywAmount, (await loadCatalogConfig()).pwyw)
    } catch {
      isSupporter = false
    }
  }
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const { error } = await createAdminClient()
    .from('profiles')
    .update({
      membership_tier: 'crew',
      ...(isSupporter ? { is_supporter: true } : {}),
      ...(customerId ? { stripe_customer_id: customerId } : {}),
    })
    .eq('id', profileId)
  // Surface a failed entitlement write instead of returning a false "upgraded" banner.
  if (error) throw new Error(`confirmCheckout(${profileId}) failed: ${error.message}`)
  return 'crew'
}

/**
 * Record a paid membership invoice as Foundation DUES on the entity-partitioned ledger
 * (ADR-037/246). Driven by the `invoice.paid` webhook, so it captures the first payment
 * AND every renewal. Idempotent per invoice. Membership is a direct platform subscription
 * (not a Connect charge), so the full amount is the Foundation's revenue.
 *
 * The dues-vs-donation split above the membership floor is an open legal decision
 * (ADR-037); the whole amount is recorded as 'dues' until counsel sets that line.
 */
export async function recordMembershipDuesFromInvoice(invoice: Stripe.Invoice): Promise<void> {
  const amount = invoice.amount_paid ?? 0
  if (amount <= 0) return
  // Memberships are the only subscriptions; a non-subscription invoice isn't dues.
  // Stripe 22 carries the subscription (and a snapshot of its metadata) under
  // invoice.parent.subscription_details — so profile_id is on the invoice, no retrieve.
  const subDetails = invoice.parent?.subscription_details
  if (!subDetails) return

  // Space plan / Space membership invoices are NOT personal Foundation membership dues — those
  // subscriptions are reconciled by lib/billing/space-subscriptions.ts and their revenue is booked
  // elsewhere (a Connect/space charge, not Foundation dues at full gross). Booking them here would
  // double-count them as Foundation dues, so skip anything carrying a Space kind (ADR-363/246).
  const kind = subDetails.metadata?.kind
  if (kind === 'space_plan' || kind === 'space_membership') return

  // Resolve the member: the subscription metadata snapshot (authoritative), else by customer.
  let profileId: string | null = (subDetails.metadata?.profile_id as string | undefined) ?? null
  if (!profileId) {
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null
    if (customerId) {
      const { data } = await createAdminClient()
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()
      profileId = (data as { id: string } | null)?.id ?? null
    }
  }

  const { recorded } = await recordFinancialTransaction({
    entityId: ENTITY_ID.foundation,
    revenueType: 'dues',
    amountCents: amount,
    profileId,
    currency: invoice.currency ?? 'usd',
    sourceTable: 'memberships',
    sourceId: invoice.id ?? null,
    idempotencyKey: invoice.id ? `invoice:${invoice.id}` : undefined,
  })

  // THE MEMBER'S RECEIPT (LIVE-344). A member's own subscription is billed here and nowhere else, so
  // this is the one place that sees both the FIRST payment and every renewal, which is exactly the
  // cadence a subscription receipt wants.
  //
  // IDEMPOTENCY IS `recorded`. The ledger append is already exactly-once on `invoice:<id>`, and it
  // reports whether THIS call was the one that wrote the row. A redelivered `invoice.paid` books
  // nothing and therefore sends nothing, which is a stronger guarantee than any check this function
  // could invent for itself. An invoice with no id has no idempotency key, so it never reports
  // `recorded` twice for a different reason: it reports it every time, and Stripe always sets one.
  //
  // Best-effort: a failed message must never 500 a paid invoice into a redelivery loop.
  // ./subscription-receipt.ts logs every miss.
  if (recorded) {
    await sendMembershipInvoiceReceipt({
      profileId,
      amountCents: amount,
      currency: invoice.currency ?? 'usd',
      tier: (subDetails.metadata?.tier as string | undefined) ?? null,
      kind: (kind as string | undefined) ?? null,
      invoiceId: invoice.id ?? null,
    }).catch(() => {})
  }
}

/** Open the Stripe billing portal for a member to manage/cancel; returns the URL. */
export async function createBillingPortal(profileId: string): Promise<string | null> {
  if (!stripe) return null
  // DIRECTION — FAIL CLOSED, LOUDLY (SCAN-539). There is no other direction available: without a customer
  // id there is no portal to open, so an unreadable read can only return null. What changes is that it is
  // no longer SILENT and no longer indistinguishable from "this member has no billing to manage" — the
  // read error is logged, because a paying member being told they have nothing to manage (and so being
  // unable to cancel) is a support incident that otherwise leaves no trace anywhere.
  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', profileId)
    .maybeSingle()
  if (error) {
    console.error('[billing] stripe_customer_id unreadable, cannot open billing portal:', error.message)
    return null
  }
  const profile = data
  if (!profile?.stripe_customer_id) return null

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${appUrl()}/settings/billing`,
  })
  return session.url
}
