// Commerce checkout — the one new caller of the existing billing rails. Mirrors
// lib/billing/tickets.ts (destination charge + application fee, pending row keyed
// by checkout session, idempotent settle, financial_transactions recording,
// destination-charge refund). Three seller kinds and two funds flows, decided in ONE place by
// ./funds-flow.ts (LIVE-621, ADR-1576):
//   platform → plain charge on the platform account (no transfer; keep 100%)
//   profile  → destination charge to the maker's connected account (maker rake)
//   space    → destination charge to the Space owner's connected account (plan rake)
//   split    → two or more sellers in one cart: a plain charge on the platform carrying
//              `transfer_group`, one transfer per seller created at settle from the ledger in
//              ./transfers.ts (LIVE-622, ADR-1614); a refund or a lost dispute reverses each
//              seller's transfer pro rata in ./split-refund.ts (LIVE-623, ADR-1615)
// Server-only. Flag-gated by payoutsLive() like every other billing path.

import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe, appUrl } from '@/lib/billing/stripe'
import { checkoutReturnFields, resolveCheckoutSession, type CheckoutUi } from '@/lib/billing/checkout-ui'
import { getConnectStatus, payoutsLive } from '@/lib/billing/connect'
import { spaceTakeRateCents, memberTakeRateCents } from '@/lib/billing/fees'
import { classifyOrderSource } from './order-source'
import { effectiveOrderSource } from '@/lib/pricing/network-world'
import type { OrderSource } from '@/lib/billing/pricing-keys'
import { confirmBookingByOrder, cancelBookingByOrder } from '@/lib/spaces/booking'
import { enrolByOrder, revokeJourneyByOrder } from './journey-fulfilment'
import { getJourneyOffer, isSoldOut, journeySlugsByPlanId } from '@/lib/journeys/paid'
import { CHECKOUT_SESSION_PLACEHOLDER, journeyWelcomeDoor } from '@/lib/journeys/sales-path'
import { checkJourneyTier } from '@/lib/journeys/tier-gate'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordFinancialTransaction } from '@/lib/finance/record'
import { computeBookingRefundCents } from './cancellation'
import { canTakePayments } from './selling'
import { spacePaymentsVerdict } from '@/lib/pricing/payments-gate'
import { PAYMENTS_BUYER_REFUSAL } from '@/lib/pricing/payments-copy'
import { getVariantsByIds } from './variants'
import { effectiveVariantPriceCents, effectiveVariantStock } from './types'
import { planFundsFlow, splitTotals, type SellerSplit } from './funds-flow'
import { settleSplitOrderTransfers } from './transfers'
import { reverseSplitTransfers, reverseSplitRefundForPaymentIntent } from './split-refund'
import { receiptEmailFor } from '@/lib/billing/receipt-address'
import { commercePaymentMethodParams } from './payment-methods'
import { checkoutGaMetadata } from '@/lib/analytics/ga-client-id'
import { sendOrderReceipts } from './order-receipt'
import type { CheckoutInput, CommerceVariant, OrderOwnerKind, ServiceConfig } from './types'
import { SHIP_TO_COUNTRIES, cartNeedsShipping, shippingDetailsFromSession } from './shipping'
import { emitDisputeLost } from '@/lib/trust/emitters'

function db(): SupabaseClient {
  return createAdminClient()
}

// The additive recovery RPCs are service-only until the public generated schema is refreshed.
async function settlementRpc(name: 'claim_commerce_settlement' | 'advance_commerce_settlement' | 'release_commerce_settlement', args: Record<string, unknown>): Promise<unknown> {
  const client = db() as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }
  const { data, error } = name === 'claim_commerce_settlement'
    ? await client.rpc('claim_commerce_settlement', args)
    : name === 'advance_commerce_settlement'
      ? await client.rpc('advance_commerce_settlement', args)
      : await client.rpc('release_commerce_settlement', args)
  if (error) throw new Error(`[commerce] settlement ${name} failed: ${error.message}`)
  return data
}

interface ProductRow {
  id: string
  owner_kind: 'platform' | 'profile' | 'space'
  owner_profile_id: string | null
  owner_space_id: string | null
  entity_id: string
  title: string
  price_cents: number
  currency: string
  stock: number | null
  status: string
  // ADR-1397: the Journey this row sells, so the seat pre-check can find its pool without a
  // second read per item.
  product_kind: string
  journey_plan_id: string | null
}

const PRODUCT_COLS =
  'id, owner_kind, owner_profile_id, owner_space_id, entity_id, title, price_cents, currency, stock, status, product_kind, journey_plan_id'

/** Member-facing copy for a checkout that could not start. One string so every failure arm agrees. */
const CHECKOUT_START_FAILED = 'Could not start checkout. Please try again.'

export interface CommerceCheckoutResult {
  url?: string
  /** Set INSTEAD of `url` when the caller asked for an on-page card form (LIVE-359). Callers branch
   *  on which one arrived, never on which one they asked for -- see `@/lib/billing/checkout-ui`. */
  clientSecret?: string
  /**
   * The Checkout Session's id, returned ALONGSIDE `clientSecret` on the elements path.
   *
   * 🔴 IT IS WHAT LETS AN ON-PAGE PURCHASE SETTLE WITHOUT THE WEBHOOK. `resolveCheckoutSession` has
   * always handed this back and `createCommerceCheckout` has always spread it into the result -- it
   * was simply absent from this interface, so no caller could read it and every on-page commerce
   * purchase was webhook-only. `confirm({ redirect: 'if_required' })` means the common card path
   * NEVER navigates, so the `session_id={CHECKOUT_SESSION_ID}` on the success URL is never visited
   * and the reconcile written as the webhook's backstop is unreachable on exactly the path that
   * became the default. See `recordCommerceOrderFromSessionId` below.
   *
   * Not set on the hosted path, which has a `url` whose landing page already carries the id.
   */
  sessionId?: string
  error?: string
  /** The pending order's id (Phase 4: lets a service booking link its hold to the order it will settle). */
  orderId?: string
}

type ResolvedCharge =
  // `source` is the EFFECTIVE source the fee was computed at: a disconnected space collapses it to `self`
  // (ADR-811 §3), so the persisted attribution matches the 0% it was actually billed (the honest receipt).
  | { platformFeeCents: number; sellerStripeAccountId: string | null; source: OrderSource }
  | { error: string }

async function resolveCharge(seller: ProductRow, grossCents: number, source: OrderSource): Promise<ResolvedCharge> {
  if (seller.owner_kind === 'platform') {
    return { platformFeeCents: 0, sellerStripeAccountId: null, source }
  }
  if (seller.owner_kind === 'profile') {
    // ⚠️ UNREACHABLE FOR A SALE since LIVE-753: canTakePayments('profile') is false, so createCommerceCheckout
    // refuses a personal seller before pricing. Kept as the default-deny receipt math, not a permission.
    const status = await getConnectStatus(seller.owner_profile_id ?? '')
    if (!status.accountId || !status.ready) return { error: 'This seller can’t take payment yet.' }
    // An individual seller: 0% on their OWN sale, and their TIER's rung on a network-sourced one — free
    // Member 10%, Crew 8% (ADR-914). Moving the listing into a Business Space buys it down further (the
    // space branch below).
    //
    // Reads the REAL `membership_tier`, not the beta-granted one: BETA_OPEN_ACCESS reports 'crew' to
    // every signed-in member, and billing the Crew rate to someone who has not bought Crew charges them
    // for a discount they do not hold.
    //
    // DIRECTION — FAIL CLOSED ON THE TRANSACTION (SCAN-539). The old comment claimed "fail-safe — an
    // error leaves the tier null, which prices at the free rung", but a PostgREST error arrives in
    // `error`, not as a throw, so that was never a decision: the unchecked null fell through and billed
    // a Crew seller the free rung's 10% on a rate they had paid to buy down to 8%. Over-charging on a
    // contract we could not verify is worse than not selling: it takes real money and stays invisible
    // until the seller audits their receipts, while refusing costs one retryable checkout. A genuinely
    // absent profile row (`data === null`, no error) still prices at the free rung — only UNKNOWN refuses.
    const { data: sellerProf, error: sellerProfErr } = await db()
      .from('profiles')
      .select('membership_tier')
      .eq('id', seller.owner_profile_id ?? '')
      .maybeSingle()
    if (sellerProfErr) {
      console.error('[commerce] seller membership tier unreadable, refusing checkout:', sellerProfErr.message)
      return { error: CHECKOUT_START_FAILED }
    }
    const sellerTier = (sellerProf as { membership_tier: string | null } | null)?.membership_tier ?? null
    return {
      platformFeeCents: await memberTakeRateCents(grossCents, source, sellerTier),
      sellerStripeAccountId: status.accountId,
      source,
    }
  }
  const { data } = await db()
    .from('spaces')
    .select('owner_profile_id, plan, network_connected')
    .eq('id', seller.owner_space_id ?? '')
    .maybeSingle()
  const owner =
    (data as { owner_profile_id?: string | null; plan?: string | null; network_connected?: boolean | null } | null) ??
    null
  if (!owner?.owner_profile_id) return { error: 'This storefront has no owner to pay.' }
  // THE PAYMENTS GATE (ADR-1709, LIVE-753): a Space shop takes money from Business up, through
  // space_payments and the space_storefront checkout floor, outside the grace window. No grandfather
  // clause (owner ruling 2026-10-06): a free Space's listing is an inquiry. The buyer sees a neutral sentence.
  const payments = await spacePaymentsVerdict(seller.owner_space_id ?? '', {
    plan: owner.plan ?? null,
    also: 'space_storefront',
  })
  if (!payments.ok) return { error: PAYMENTS_BUYER_REFUSAL }
  const status = await getConnectStatus(owner.owner_profile_id)
  if (!status.accountId || !status.ready) return { error: 'This storefront can’t take payment yet.' }
  // A standalone (disconnected) Space has left the graph, so it can have NO network-sourced revenue —
  // its source collapses to self (ADR-811 §3), guaranteeing 0% even if a stray referral cookie was set.
  const effective = effectiveOrderSource(source, owner.network_connected)
  return {
    // A space store's take-rate is 0% on its OWN booking (the hard promise) and the tier's network rate
    // on a sale the collective sourced (ADR-811), keyed on the space plan (Business 5% → Collective 3% → …).
    platformFeeCents: await spaceTakeRateCents(grossCents, owner.plan ?? 'free', effective, seller.owner_space_id),
    sellerStripeAccountId: status.accountId,
    source: effective,
  }
}

/** Validate a single-seller cart, record a pending order + items, return Checkout URL. */
export async function createCommerceCheckout(input: CheckoutInput): Promise<CommerceCheckoutResult> {
  if (!input.items?.length) return { error: 'Your cart is empty.' }
  if (!stripe) return { error: 'Payments aren’t turned on yet.' }

  // ── IDENTITY: EXACTLY ONE OF THEM (LIVE-396) ──────────────────────────────────────────────────
  // The same invariant `commerce_orders` carries in SQL (buyer_profile_id / guest_email) and that
  // `createTicketCheckout` enforces for its own table. Refusing BOTH and NEITHER here is what keeps
  // the column pair honest, because this function is the only writer of a new order.
  const buyerProfileId = input.buyerProfileId || null
  const guestEmail = (input.guestEmail || '').trim().toLowerCase() || null
  if (!!buyerProfileId === !!guestEmail) {
    console.error('[commerce] checkout identity invalid', {
      hasBuyer: !!buyerProfileId,
      hasGuest: !!guestEmail,
    })
    return { error: CHECKOUT_START_FAILED }
  }
  const requestedUi: CheckoutUi = input.ui === 'elements' ? 'elements' : 'hosted'

  const ids = [...new Set(input.items.map((i) => i.productId))]
  const { data } = await db().from('commerce_products').select(PRODUCT_COLS).in('id', ids)
  const products = (data ?? []) as ProductRow[]
  if (products.length !== ids.length) return { error: 'Some items are no longer available.' }
  if (products.some((p) => p.status !== 'active')) return { error: 'Some items are no longer on sale.' }

  // 🔴 THE GUEST ENTRY IS JOURNEY-ONLY (LIVE-396). The schema and the claim door are general; this
  // is not. A Journey is account-bound access that `claim_guest_orders` + `enrolByOrder` can hand
  // over on sign-in with nothing else owed. A physical good would owe a shipping address, stock and
  // a returns path to somebody with no account, and none of that is answered. Enforced here because
  // this is the only writer of a new order, so no future caller can widen it by accident.
  if (guestEmail && products.some((p) => p.product_kind !== 'journey')) {
    return { error: 'Sign in to buy this.' }
  }

  // ── Journey seats, checked BEFORE the money (ADR-1397) ────────────────────────────────────────
  // A seat check at fulfilment can only refuse somebody who has already paid: charged, no access,
  // and a refund they have to ask for. Refusing here costs nothing. `journey_plans.enroll_cap` is
  // the ONE pool every door counts against, so the free door and this one cannot disagree about
  // whether a room is full.
  //
  // ⚠️ This is a PRE-CHECK, not a hold. Two buyers can still clear it a millisecond apart and both
  // pay; that race is settled in favour of the BUYER (enrolByOrder admits them and logs the
  // oversell) because the alternative is taking somebody's money and refusing the thing. A real
  // hold belongs with the stock reservation work, not here.
  const journeyItems = products.filter((p) => p.product_kind === 'journey' && p.journey_plan_id)
  for (const p of journeyItems) {
    const offer = await getJourneyOffer(p.journey_plan_id as string)
    if (offer && isSoldOut(offer)) return { error: 'This Journey is full. Check back soon.' }
    // `null` for a guest is correct and already handled: checkJourneyTier refuses a TIER-GATED
    // Journey to anyone with no profile (a guest cannot hold a Space membership) and returns ok for
    // an ungated one. So a guest may buy an open Journey and is turned away from a members-only one
    // with the message that names the Space and tier.
    const tier = await checkJourneyTier(p.journey_plan_id as string, buyerProfileId)
    if (!tier.ok) return { error: tier.error }
  }

  // ── WHERE A GUEST COMES BACK TO (PROG-GD5) ────────────────────────────────────────────────────
  // The member return is /orders. A GUEST cannot land there: it is a member page with no public
  // twin, so the shell dropped every paid stranger on the marketing home with no acknowledgement
  // and no door. A guest is journey-only (refused above otherwise), so the return is the Journey's
  // welcome, reached through sign-in with the address that paid: `journeyWelcomeDoor`, the one door
  // the receipt also uses. Resolved BEFORE the order is written so a slug that cannot be read costs
  // a fallback to the sign-in door for /orders, never a session with nowhere to return to.
  const guestSlug = guestEmail
    ? ((await journeySlugsByPlanId(journeyItems.map((p) => p.journey_plan_id as string))).get(
        journeyItems[0]?.journey_plan_id as string,
      ) ?? null)
    : null

  // Resolve any selected variants (Etsy-Grade Phase 2): each must belong to its product AND be active;
  // its effective price (variant override, else the product price) drives the line + gross, and its
  // effective stock is soft-checked here (the paid-order RPC still enforces it atomically). A plain
  // item with no variantId is unchanged. One Line per cart item feeds gross, the Stripe line items, and
  // the order-item rows so price + variant stay consistent across all three.
  const variantMap = await getVariantsByIds(input.items.map((i) => i.variantId ?? '').filter(Boolean))
  // A PRODUCT WITH OPTIONS IS BOUGHT AS ONE OF THEM (SCAN-712). The VariantPicker is a client
  // component and a server action is a public POST, so a line with no variantId on a product that
  // has active variants used to price at the base price and pass every option's stock check: a
  // print whose A3 and A2 options were sold out could still be bought at the base price with no
  // option recorded. One batched read of the active variants on the variant-less products, then
  // each such line is refused below.
  const bareIds = [...new Set(input.items.filter((i) => !i.variantId).map((i) => i.productId))]
  const requiresVariant = new Set<string>()
  if (bareIds.length) {
    const { data: activeVariants, error: variantsError } = await db()
      .from('commerce_variants')
      .select('product_id')
      .in('product_id', bareIds)
      .eq('active', true)
    if (variantsError) return { error: 'Could not read the options for that item. Try again.' }
    for (const v of (activeVariants ?? []) as { product_id: string }[]) requiresVariant.add(v.product_id)
  }
  const lines: {
    product: ProductRow
    variant: CommerceVariant | null
    qty: number
    unitCents: number
    title: string
  }[] = []
  for (const it of input.items) {
    const p = products.find((x) => x.id === it.productId)!
    const qty = Math.max(1, Math.floor(it.qty))
    let variant: CommerceVariant | null = null
    if (it.variantId) {
      variant = variantMap.get(it.variantId) ?? null
      if (!variant || variant.productId !== p.id || !variant.active) {
        return { error: 'That option is no longer available.' }
      }
      const available = effectiveVariantStock(variant)
      if (available != null && available < qty) return { error: 'That option is out of stock.' }
    } else if (requiresVariant.has(p.id)) {
      return { error: 'Pick an option.' }
    }
    const unitCents = variant ? effectiveVariantPriceCents({ priceCents: p.price_cents }, variant) : p.price_cents
    lines.push({ product: p, variant, qty, unitCents, title: variant ? `${p.title} (${variant.name})` : p.title })
  }

  // SCAN-713: a PLAIN product's tracked stock, checked before the money. The variant branch above
  // soft-checks the variant's stock; a variant-less line never compared p.stock to the quantity, so
  // a sold-out tee on a cached store page (ISR, up to an hour stale) could still be bought and the
  // oversell only surfaced as a log line at settle. Quantities are summed per product across the
  // cart so two lines of the same item cannot each pass alone. The concurrent-buyer race remains,
  // and the settle arm below refunds the loser.
  const plainQty = new Map<string, number>()
  for (const l of lines) if (!l.variant) plainQty.set(l.product.id, (plainQty.get(l.product.id) ?? 0) + l.qty)
  for (const [productId, qty] of plainQty) {
    const p = products.find((x) => x.id === productId)
    if (p && p.stock != null && p.stock < qty) return { error: 'This item is sold out.' }
  }

  const gross = lines.reduce((sum, l) => sum + l.unitCents * l.qty, 0)
  if (gross <= 0) return { error: 'Nothing to charge.' }

  // ── THE FUNDS FLOW (LIVE-621, ADR-1576) ───────────────────────────────────────────────────────
  // ONE seam decides how the money moves, from the priced lines: one seller is a DESTINATION charge
  // (today's session, exactly); two or more are SEPARATE charges and transfers (the payment lands on
  // the platform carrying `transfer_group`, no `transfer_data`, and LIVE-622's ledger pays each
  // seller after). This door used to refuse a second seller with "one seller at a time"; the refusal
  // is gone because the flow that made it honest is no longer the only one. The seam also owns ONE
  // CURRENCY PER CART (HYG-107, ADR-1500: `application_fee_amount` is an integer in the
  // PaymentIntent's currency, and a gross summed across two currencies is a number in none; refusing
  // here means no pending order is written for it and no fee is computed on nonsense) and keeps the
  // Frequency Store out of a separate plan (the platform is where the charge lands, never a transfer
  // destination). `cartCurrency` is the single value every consumer below reads.
  const plan = planFundsFlow(
    lines.map((l) => ({ seller: l.product, currency: l.product.currency || 'usd', qty: l.qty, unitCents: l.unitCents })),
  )
  if ('refused' in plan) {
    if (plan.refused === 'mixed_currency') return { error: 'Please check out items in one currency at a time.' }
    if (plan.refused === 'store_with_others') {
      return { error: 'Frequency Store items check out on their own. Please buy them separately.' }
    }
    return { error: 'Your cart is empty.' }
  }
  const cartCurrency = plan.currency
  // Each seller's own product row (the first line it sold), which carries what the seam does not read:
  // the ledger entity, and the fields resolveCharge prices from. One group on a destination plan.
  const sellerGroups = plan.groups.map((g) => ({ seller: lines[g.firstLine].product, grossCents: g.grossCents }))

  // R2 (Phase 0): only a seller `canTakePayments` admits may take in-app money; a connect-only listing
  // never opens a Stripe session, the buyer contacts the seller instead. Checked per seller, because a
  // split cart is refused if ANY of its sellers cannot be paid. Single source of truth: canTakePayments.
  if (sellerGroups.some((g) => !canTakePayments(g.seller.owner_kind))) {
    return { error: 'This seller takes contact only. Message them to arrange the sale.' }
  }

  // Price EACH seller through the same rungs a single seller gets: classify the source per seller
  // (ADR-811 §A: self = the operator's own booking at 0%, network = the collective sourced the
  // customer; default-safe to self on any ambiguity), then resolveCharge at that seller's plan or tier
  // rung. A destination plan prices one seller, which is exactly the path this door always took.
  const priced: {
    seller: ProductRow
    grossCents: number
    charge: Exclude<ResolvedCharge, { error: string }>
    attributionRef: string | null
  }[] = []
  for (const g of sellerGroups) {
    const { source, attributionRef } = await classifyOrderSource({
      entryPoint: input.entryPoint ?? null,
      buyerProfileId: input.buyerProfileId,
      sellerProfileId: g.seller.owner_profile_id,
      // A Space shop: the relationship check (ADR-913) asks the SPACE's followers / members / CRM too,
      // not just the owner profile. Null for a profile or platform seller, and that is NOT a narrower
      // audience: with no Space the check measures the profile plus every Space the seller owns
      // (friends, and active members of their Spaces), per ADR-1584 (LIVE-221, owner ruling 2026-09-29).
      sellerSpaceId: g.seller.owner_kind === 'space' ? g.seller.owner_space_id ?? null : null,
    })
    const charge = await resolveCharge(g.seller, g.grossCents, source)
    if ('error' in charge) return charge
    priced.push({ seller: g.seller, grossCents: g.grossCents, charge, attributionRef: attributionRef ?? null })
  }
  if (priced.some((p) => p.charge.sellerStripeAccountId) && !(await payoutsLive())) {
    return { error: 'Payments aren’t turned on yet.' }
  }

  // The one seller of a destination order, or null for a split order, which names none.
  const head = plan.mode === 'destination' ? priced[0] : null
  // A separate plan's shares, one per seller, as priced at this checkout. Every one has a connected
  // account: the seam keeps the platform out of a separate plan and resolveCharge refuses a seller
  // with no account, so a share with none here is a bug, refused before an order is written.
  if (!head && priced.some((p) => !p.charge.sellerStripeAccountId)) {
    console.error('[commerce] split share with no destination account', { sellers: priced.length })
    return { error: CHECKOUT_START_FAILED }
  }
  const splits: SellerSplit[] = head
    ? []
    : priced.map((p) => ({
        seller: p.seller,
        grossCents: p.grossCents,
        platformFeeCents: p.charge.platformFeeCents,
        stripeAccountId: p.charge.sellerStripeAccountId as string,
      }))
  const splitFee = splitTotals(splits)
  // A split order is network-sourced when ANY share was billed at a network rung: that is the reason
  // its fee is non-zero. Its provenance tag is the first such share's.
  const networkShare = priced.find((p) => p.charge.source === 'network') ?? null

  // L6-03 (2026-09-05): the ORDER is written BEFORE the Stripe session, and every write is checked.
  // The previous order was session → order insert (error discarded) → items insert (error discarded)
  // → return the URL regardless, so a failed insert (constraint, RLS, transient) or a process kill
  // between the two left a payable session with NO order behind it: the buyer paid, the webhook found
  // zero 'pending' rows to flip, and there was nothing to fulfil or refund from the operator UI. The
  // tips and tickets rails already check their pending insert and expire the session on failure;
  // commerce was the outlier. Now: pending order → items → Stripe session (carrying order_id in its
  // metadata) → session id stored on the order. Any failure marks the order 'failed' (a status the
  // table already has; 'cancelled' is reserved for an abandoned/expired session) and returns the
  // action's error shape instead of a URL. The webhook contract is UNCHANGED: recordCommerceOrderFromSession
  // still finds the row by stripe_checkout_session_id + status='pending', and abandonCommerceOrderFromSession
  // the same way; order_id in the session metadata is carried for reconciliation, not looked up.
  const { data: orderRow, error: orderErr } = await db()
    .from('commerce_orders')
    .insert({
      buyer_profile_id: buyerProfileId,
      // Exactly one of the pair is non-null at insert; claim_guest_orders() may later set the buyer
      // beside a surviving address, which is the record of how the order was bought.
      guest_email: guestEmail,
      // A destination order names its one seller. A split order is 'split' with NO owner ids: it has
      // no single seller, and the schema refuses a split row that names one (20270345009700).
      owner_kind: head ? head.seller.owner_kind : 'split',
      owner_profile_id: head ? head.seller.owner_profile_id : null,
      owner_space_id: head ? head.seller.owner_space_id : null,
      // The ledger entity every commerce product is created under (ENTITY_ID.labs); a split order
      // takes the first line's, which on a destination order is the one seller's.
      entity_id: head ? head.seller.entity_id : lines[0].product.entity_id,
      amount_cents: gross,
      // A destination order's fee is its one seller's. A split order's is the SUM of the per-seller
      // fees, each at its own rung, never one rate on the total; the platform keeps it by transferring
      // less (LIVE-622).
      platform_fee_cents: head ? head.charge.platformFeeCents : splitFee.platformFeeCents,
      // Persist the EFFECTIVE source the fee was billed at (a disconnected space collapses to self, ADR-811
      // §3), and drop the provenance tag when it collapsed — a self order carries no network attribution.
      source: head ? head.charge.source : networkShare ? 'network' : 'self',
      attribution_ref: head
        ? head.charge.source === 'network'
          ? head.attributionRef
          : null
        : networkShare?.attributionRef ?? null,
      currency: cartCurrency,
      status: 'pending',
      shipping: input.shipping ?? {},
      // One destination account on a destination order; none on a split order, whose sellers are paid
      // by transfer against the charge.
      seller_stripe_account_id: head ? head.charge.sellerStripeAccountId : null,
      // WHICH FUNDS FLOW THIS ORDER TOOK (LIVE-621), so a refund knows whether to reverse one transfer
      // or the transfers (LIVE-623). The schema ties it to owner_kind both ways.
      funds_flow: plan.mode,
      // A split order records each seller's share AS PRICED AT THIS CHECKOUT. The rung a Space or a
      // person sat on that day is not derivable later from the items, and LIVE-622 plans one transfer
      // per entry. A destination order writes nothing here: its one share is the row itself.
      ...(head
        ? {}
        : {
            metadata: {
              split: splits.map((s) => ({
                owner_kind: s.seller.owner_kind,
                owner_profile_id: s.seller.owner_profile_id,
                owner_space_id: s.seller.owner_space_id,
                stripe_account_id: s.stripeAccountId,
                gross_cents: s.grossCents,
                platform_fee_cents: s.platformFeeCents,
              })),
            },
          }),
    })
    .select('id')
    .maybeSingle()
  const orderId = (orderRow as { id?: string } | null)?.id
  if (orderErr || !orderId) {
    console.error('[commerce] pending order insert failed', { error: orderErr?.message ?? 'no id returned' })
    return { error: CHECKOUT_START_FAILED }
  }

  const { error: itemsErr } = await db().from('commerce_order_items').insert(
    lines.map((l) => ({
      order_id: orderId,
      product_id: l.product.id,
      // variant_id drives the per-variant stock decrement in decrement_commerce_stock_atomic
      // (Etsy-Grade Phase 2); null for a plain item, which decrements product stock as before.
      variant_id: l.variant?.id ?? null,
      title: l.title,
      qty: l.qty,
      unit_cents: l.unitCents,
      subtotal_cents: l.unitCents * l.qty,
    })),
  )
  if (itemsErr) {
    console.error('[commerce] order items insert failed', { orderId, error: itemsErr.message })
    await markPendingOrderFailed(orderId, 'items_insert_failed')
    return { error: CHECKOUT_START_FAILED }
  }

  // Stripe's own receipt, as a backstop (LIVE-344). The first-party order receipt is what a buyer is
  // meant to read (lib/commerce/order-receipt.ts); this is what still reaches them when that message
  // cannot be composed. Best-effort by construction: an unresolvable address omits the field and
  // never refuses a checkout.
  // A guest has no profile to resolve an address from, and the one they typed IS the address the
  // receipt must reach — it is the only way to tell them what they bought before they have an
  // account. Mirrors createTicketCheckout, which resolves the guest address the same way.
  const receiptEmail = guestEmail ?? (buyerProfileId ? await receiptEmailFor(buyerProfileId) : null)
  const gaMeta = await checkoutGaMetadata()

  // LIVE-346: a physical cart needs a carrier address. Nothing on the buy path collects one
  // in-app (startCheckoutAction never passes `shipping`), so Stripe is the validator. The
  // shared on-page form has no Address Element, so a physical cart uses hosted Checkout —
  // the only surface that can take the address today. Digital / Journey / booking stay on-page.
  const needsShipping = cartNeedsShipping(products.map((p) => p.product_kind))
  const ui: CheckoutUi = needsShipping ? 'hosted' : requestedUi
  if (needsShipping && requestedUi === 'elements') {
    console.error(
      '[commerce] physical goods need a Stripe-validated shipping address; using hosted checkout',
      { orderId },
    )
  }

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lines.map((l) => ({
        quantity: l.qty,
        price_data: {
          currency: cartCurrency,
          unit_amount: l.unitCents,
          product_data: { name: l.title },
        },
      })),
      ...(needsShipping
        ? { shipping_address_collection: { allowed_countries: [...SHIP_TO_COUNTRIES] } }
        : {}),
      // payment_intent_data is UNCONDITIONAL, because `receipt_email` belongs on it and a PLATFORM
      // (first-party Frequency Store) order has no connected account to carry it. The Connect fields
      // follow the FUNDS FLOW (LIVE-621):
      //   destination  application fee + transfer_data + on_behalf_of on the one seller's account; a
      //                platform charge sets none of the three, exactly as before.
      //   separate     `transfer_group` = the order id, and NOTHING else. No transfer_data (the money
      //                lands on the platform), no on_behalf_of, no application_fee_amount (the platform
      //                keeps its fee by transferring less). LIVE-622 creates one transfer per seller
      //                under this group, so each is tied to the charge that funds it.
      payment_intent_data: {
        ...(head
          ? head.charge.sellerStripeAccountId
            ? {
                application_fee_amount: head.charge.platformFeeCents,
                transfer_data: { destination: head.charge.sellerStripeAccountId },
                on_behalf_of: head.charge.sellerStripeAccountId,
              }
            : {}
          : { transfer_group: orderId }),
        ...(receiptEmail ? { receipt_email: receiptEmail } : {}),
        metadata: {
          kind: 'commerce_order',
          ...(buyerProfileId ? { buyer_profile_id: buyerProfileId } : { guest_email: guestEmail }),
          order_id: orderId,
        },
      },
      // INSTALMENTS, SCOPED (LIVE-396). Empty unless the owner has named a configuration, in which
      // case this is where Klarna / Affirm reach a Journey purchase WITHOUT reaching every other
      // thing commerce sells. `journeyOnly` is all-or-nothing on purpose: a mixed cart is not a
      // Journey purchase, and one qualifying line must not let a buyer finance the rest of it.
      ...commercePaymentMethodParams({
        journeyOnly: products.length > 0 && products.every((p) => p.product_kind === 'journey'),
      }),
      // Prefill and lock the address for a guest so the receipt, the Stripe customer and the row all
      // agree — and so the address the claim later matches on is the one they actually typed.
      ...(guestEmail ? { customer_email: guestEmail } : {}),
      ...(buyerProfileId ? { client_reference_id: buyerProfileId } : {}),
      // SCAN-715: a hold-first caller shortens the session so an abandoned Checkout frees its slot.
      ...(input.expiresInSeconds
        ? { expires_at: Math.floor(Date.now() / 1000) + Math.max(30 * 60, Math.floor(input.expiresInSeconds)) }
        : {}),
      metadata: {
        kind: 'commerce_order',
        ...(buyerProfileId ? { buyer_profile_id: buyerProfileId } : { guest_email: guestEmail }),
        order_id: orderId,
        ...gaMeta,
      },
      ...checkoutReturnFields(ui, {
        // A member comes back to My orders. A guest comes back through the sign-in door to the
        // Journey's welcome (see guestSlug above); a guest whose slug could not be read still comes
        // back through sign-in rather than to a member page the shell would bounce.
        successUrl: guestEmail
          ? `${appUrl()}${
              guestSlug
                ? journeyWelcomeDoor(guestSlug, { sessionId: CHECKOUT_SESSION_PLACEHOLDER, email: guestEmail })
                : `/sign-in?next=${encodeURIComponent('/orders')}&email=${encodeURIComponent(guestEmail)}`
            }`
          : `${appUrl()}/orders?ok=1&session_id=${CHECKOUT_SESSION_PLACEHOLDER}`,
        // Cancel back to the surface the buyer was purchasing from, never the free peer board
        // (`/marketplace` redirects to Classifieds). Frequency Store → /store; Market + Space
        // shops both browse under the Market umbrella, and so does a split cart (never the Store).
        cancelUrl: `${appUrl()}${head?.seller.owner_kind === 'platform' ? '/store' : '/market'}`,
      }),
    })
  } catch (err) {
    console.error('[commerce] stripe session create failed', { orderId, err })
    await markPendingOrderFailed(orderId, 'stripe_session_failed')
    return { error: CHECKOUT_START_FAILED }
  }

  // Link the session to the order (checked). Without this link the webhook cannot find the row, so
  // if it fails the session is expired (best-effort, like tips/tickets) so it can never be paid into
  // a void, and the order is marked failed.
  const { data: linked, error: linkErr } = await db()
    .from('commerce_orders')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', orderId)
    .eq('status', 'pending')
    .select('id')

  // 🔴 RESOLVE BEFORE THE GUARD, NOT AFTER. This condition used to read `!session.url`, which is
  // TRUE FOR EVERY ELEMENTS SESSION -- Stripe returns `url: null` and a client secret instead. Left
  // as it was, turning the on-page form on would have marked every commerce order 'failed' and
  // expired a session the buyer was about to pay, while typechecking perfectly (`stripe` ships no
  // types). "Nothing to hand back" is the question the guard actually means, and only
  // resolveCheckoutSession can answer it for both modes.
  const handed = resolveCheckoutSession(session, ui, 'commerce')
  if (linkErr || !(linked ?? []).length || handed.error) {
    console.error('[commerce] session link failed', { orderId, sessionId: session.id, error: linkErr?.message ?? null })
    try {
      await stripe.checkout.sessions.expire(session.id)
    } catch {
      // best-effort: an unexpired session simply lapses on its own; we still refuse the URL
    }
    await markPendingOrderFailed(orderId, linkErr || !(linked ?? []).length ? 'session_link_failed' : 'no_session_url')
    return { error: CHECKOUT_START_FAILED }
  }

  return { ...handed, orderId }
}

/** Mark a never-paid pending order 'failed' so nothing dangles (L6-03). Guarded on status='pending' so it
 *  can never touch a row the webhook has already settled. The reason lands in metadata for the operator;
 *  the row is still pending at this point (no session is linked yet, or it was just expired), so nothing
 *  else writes its metadata and a whole-value write cannot clobber a settle marker. Fail-soft: a failure
 *  here leaves a 'pending' row that no session can ever pay, which is inert. */
async function markPendingOrderFailed(orderId: string, reason: string): Promise<void> {
  try {
    await db()
      .from('commerce_orders')
      .update({ status: 'failed', metadata: { checkout_failure: reason } })
      .eq('id', orderId)
      .eq('status', 'pending')
  } catch (err) {
    console.error('[commerce] could not mark order failed', { orderId, reason, err })
  }
}

/** Settle the order behind a completed Checkout session (idempotent). Platform
 *  (first-party) revenue = the full amount; a destination charge's revenue = the
 *  application fee (seller gross is off-ledger). */
export async function recordCommerceOrderFromSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.metadata?.kind !== 'commerce_order') return
  if (session.payment_status !== 'paid') return
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null

  if (!paymentIntentId || !Number.isSafeInteger(session.amount_total) || !session.currency) {
    throw new Error('[commerce] paid session has incomplete payment authority')
  }
  const paidAmount = session.amount_total as number
  const paidCurrency = session.currency.toLowerCase()

  // LIVE-346: the pending row stored `input.shipping ?? {}`, which is empty on every live
  // buy path. Overwrite it with the address Stripe validated, when one arrived. Leave the
  // pending value alone when Stripe collected nothing (an intangible cart, or a miss).
  const collectedShipping = shippingDetailsFromSession(session)

  // The flip is NOT best-effort (SCAN-710): supabase-js never throws, so a swallowed error here
  // would let the webhook ack 200 with the event claimed, Stripe would never redeliver, and the
  // paid order would stay pending forever. Throw so the webhook releases its claim and 500s; the
  // retry is safe because the update is guarded by status = 'pending' (same shape as tips.ts).
  const { data: updated, error: flipError } = await db()
    .from('commerce_orders')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
      ...(collectedShipping ? { shipping: collectedShipping } : {}),
    })
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'pending')
    .eq('amount_cents', paidAmount)
    .eq('currency', paidCurrency)
    // owner_profile_id / owner_space_id ride along for the SELLER's notice (LIVE-344): the row already
    // knows who the money went to, and re-reading the product to find out would be a second read of a
    // fact this update is holding.
    // ONE LITERAL, not a concatenation: the generated PostgREST types parse this string, and a built
    // one widens to `string` and types the result as GenericStringError[].
    .select('id, owner_kind, owner_profile_id, owner_space_id, entity_id, amount_cents, platform_fee_cents, buyer_profile_id, currency, funds_flow')
  if (flipError) {
    throw new Error(`[commerce] paid flip failed (session=${session.id}): ${flipError.message}`)
  }
  type SettlementRow = {
    id: string
    owner_kind: OrderOwnerKind
    owner_profile_id: string | null
    owner_space_id: string | null
    entity_id: string
    amount_cents: number
    platform_fee_cents: number
    buyer_profile_id: string | null
    currency: string
    funds_flow: string | null
  }
  let rows = (updated ?? []) as SettlementRow[]
  if (rows.length === 0) {
    // A redelivery must resume required steps, but only for the original verified payment.
    const { data, error } = await db().from('commerce_orders')
      .select('id, owner_kind, owner_profile_id, owner_space_id, entity_id, amount_cents, platform_fee_cents, buyer_profile_id, currency, funds_flow')
      .eq('stripe_checkout_session_id', session.id).eq('stripe_payment_intent_id', paymentIntentId)
      .eq('amount_cents', paidAmount).eq('currency', paidCurrency).in('status', ['paid', 'fulfilled'])
    if (error) throw new Error(`[commerce] settlement replay read failed: ${error.message}`)
    rows = (data ?? []) as SettlementRow[]
  }

  for (const row of rows) {
    const token = crypto.randomUUID()
    const claim = await settlementRpc('claim_commerce_settlement', {
      _order: row.id, _session: session.id, _payment_intent: paymentIntentId,
      _amount: paidAmount, _currency: paidCurrency, _token: token,
    }) as { state: string; steps?: Record<string, unknown> }
    if (claim.state === 'complete' || claim.state === 'refused') continue
    if (claim.state !== 'claimed') throw new Error('[commerce] settlement already in progress; retry')
    const steps = claim.steps ?? {}
    const runStep = async (step: string, work: () => Promise<void>) => {
      if (steps[step] === true || (step === 'receipts' && steps[step] === 'suppressed_legacy')) return
      if (await settlementRpc('advance_commerce_settlement', { _order: row.id, _token: token, _step: null }) !== true) {
        throw new Error('[commerce] settlement authority changed; retry')
      }
      await work()
      if (await settlementRpc('advance_commerce_settlement', { _order: row.id, _token: token, _step: step }) !== true) {
        throw new Error('[commerce] settlement checkpoint failed; retry')
      }
    }
    try {
      const revenue = row.owner_kind === 'platform' ? row.amount_cents : row.platform_fee_cents
      await runStep('finance', async () => {
        await recordFinancialTransaction({
          entityId: row.entity_id,
          revenueType: 'commerce',
          amountCents: revenue,
          profileId: row.buyer_profile_id,
          currency: row.currency,
          stripePaymentIntentId: paymentIntentId,
          sourceTable: 'commerce_orders',
          sourceId: row.id,
          idempotencyKey: `commerce_order:${row.id}`,
        })
      })

      await runStep('inventory', async () => {
        const { error } = await db().rpc('decrement_commerce_stock_atomic', { _order: row.id })
        if (!error) return
        if (/out_of_stock/i.test(error.message ?? '')) {
          await refundOversoldOrder(row.id, row.buyer_profile_id)
          // Never grant access or announce a sale after an oversell/refund. Failed refunds retry.
          throw new Error(`[commerce] oversold order cannot be fulfilled: ${row.id}`)
        }
        throw new Error(`[commerce] stock decrement failed: ${error.message}`)
      })
      // This ledger has its own durable reconciler; retries always retain its captured payees.
      if (row.funds_flow === 'separate') await settleSplitOrderTransfers(row.id)

      // A missing linked booking is a normal product order. Database errors must remain retryable.
      await runStep('booking', () => confirmBookingByOrder(row.id, { strict: true }))

      // Required paid access uses the ordinary adoption path with checked writes; a retry repairs it.
      await runStep('journey', () => enrolByOrder(row.id, { strict: true }))

      // Stable recipient keys dedupe the existing notification/outbox writes even if a checkpoint fails.
      await runStep('receipts', () => sendOrderReceipts({
        id: row.id,
        ownerKind: row.owner_kind,
        ownerProfileId: row.owner_profile_id,
        ownerSpaceId: row.owner_space_id,
        buyerProfileId: row.buyer_profile_id,
        amountCents: row.amount_cents,
        currency: row.currency,
        // The address Stripe collected is the only way to reach a buyer with no account.
        buyerEmail: session.customer_details?.email ?? null,
      }, { strict: true }))
    } finally {
      await settlementRpc('release_commerce_settlement', { _order: row.id, _token: token })
    }
  }
}

/**
 * The BY-ID twin of `recordCommerceOrderFromSession`, for the on-page settle (the sibling of
 * `recordTicketFromSessionId` in lib/billing/tickets.ts).
 *
 * 🔴 WHY IT EXISTS. The on-page card form confirms with `redirect: 'if_required'`, so the common
 * card path never navigates and `/orders?ok=1&session_id=...` is never visited. Until this landed
 * the webhook was the ONLY thing that could flip a commerce order to `paid` -- and for a Journey
 * that webhook is also the only thing that calls `enrolByOrder`, so a late or misconfigured
 * delivery meant a buyer who had paid and had no access, behind a panel that had already told them
 * they were in.
 *
 * AUTHORITY IS STRIPE, not the caller. The session is re-fetched from Stripe and refused unless
 * `metadata.kind === 'commerce_order'` and `payment_status === 'paid'`, so the most anyone can do
 * with an id that is not theirs is settle a purchase that genuinely happened -- which is precisely
 * what the webhook does, unprompted, seconds later.
 *
 * SAFE TO RUN TWICE. A service-only lease fences concurrent deliveries and completed steps remain
 * durable. A verified replay resumes required work under the original payment and recipient keys.
 */
export async function recordCommerceOrderFromSessionId(sessionId: string): Promise<boolean> {
  if (!stripe) return false
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    return false
  }
  if (session.metadata?.kind !== 'commerce_order' || session.payment_status !== 'paid') return false
  await recordCommerceOrderFromSession(session)
  return true
}

/** Abandon the pending order behind an EXPIRED or async-failed Checkout session (idempotent): mark it
 *  cancelled and release any held booking (Phase 4). No charge occurred, so there is nothing to refund;
 *  without this, an abandoned service checkout would leave its 'pending' booking hold occupying the slot
 *  forever. FAIL-SOFT booking release (no-op for a normal product order / pre-migration). */
export async function abandonCommerceOrderFromSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.metadata?.kind !== 'commerce_order') return
  // Same contract as the paid flip (SCAN-710): a dropped error would ack the expired event and
  // leave the booking hold in place forever. Throw so Stripe redelivers; pending-only, so safe.
  const { data: updated, error: cancelError } = await db()
    .from('commerce_orders')
    .update({ status: 'cancelled' })
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'pending')
    .select('id')
  if (cancelError) {
    throw new Error(`[commerce] expired-session cancel failed (session=${session.id}): ${cancelError.message}`)
  }
  for (const row of (updated ?? []) as { id: string }[]) {
    await cancelBookingByOrder(row.id)
  }
}

/**
 * The Stripe `amount` (cents) to refund for a booking-backed service order whose ServiceConfig
 * carries a cancellation/no-show policy, or `undefined` for a FULL refund (a normal product order,
 * a service with no policy, or any read miss). PURE money math lives in ./cancellation.ts; this is
 * the thin IO that resolves the booking's start time + the product's policy and clamps to a genuine
 * partial. FAIL-SOFT: any read error returns undefined so the caller issues the full refund rather
 * than blocking the cancel (ADR-596, finding #4).
 */
async function bookingPartialRefundCents(order: { id: string; amount_cents: number }): Promise<number | undefined> {
  if (!(order.amount_cents > 0)) return undefined
  try {
    // order_id ↔ booking is 1:1.
    const admin = createAdminClient()
    const { data: bk } = await admin
      .from('space_bookings')
      .select('starts_at, product_id')
      .eq('order_id', order.id)
      .maybeSingle()
    const booking = bk ?? null
    if (!booking?.product_id || !booking.starts_at) return undefined // not booking-backed

    const { data: prod } = await db()
      .from('commerce_products')
      .select('product_kind, metadata')
      .eq('id', booking.product_id)
      .maybeSingle()
    const product = prod as { product_kind: string; metadata: Record<string, unknown> | null } | null
    if (!product || (product.product_kind !== 'service' && product.product_kind !== 'booking')) return undefined

    const svc = ((product.metadata?.service ?? {}) as ServiceConfig) || {}
    // No enforceable policy → full refund (undefined). computeBookingRefundCents also guards this,
    // but short-circuiting keeps the common (policy-less) path a no-op.
    if (!svc.noShowFeePct || svc.cancellationWindowHours == null) return undefined

    const { refundCents } = computeBookingRefundCents({
      paidCents: order.amount_cents,
      startsAt: booking.starts_at,
      now: new Date(),
      cancellationWindowHours: svc.cancellationWindowHours,
      noShowFeePct: svc.noShowFeePct,
    })
    // Only pass an explicit amount for a genuine partial; a full refund stays undefined (unchanged behavior).
    return refundCents < order.amount_cents ? refundCents : undefined
  } catch {
    return undefined // fail-soft: fall back to a full refund, never block the cancel
  }
}

/** SCAN-713: the losing side of a stock race. The buyer paid for a unit the shelf no longer has, so
 *  the whole order goes back (refundCommerceOrder, the same unwind a dispute approval uses) and the
 *  buyer gets a bell notice. Best-effort by construction: the settle already flipped the row, and a
 *  refund that does not land is an operator task, logged, never a thrown webhook. */
async function refundOversoldOrder(orderId: string, buyerProfileId: string | null): Promise<void> {
  try {
    const res = await refundCommerceOrder(orderId)
    if (res.error) {
      console.error('[commerce] oversold order refund failed; refund by hand', { orderId, error: res.error })
      return
    }
    if (buyerProfileId) {
      await db().from('notifications').insert({
        recipient_id: buyerProfileId,
        actor_id: null,
        type: 'order_refunded',
        reference_type: 'order',
        reference_id: orderId,
        body: 'That item sold out just before your order went through, so we refunded you in full.',
      })
    }
  } catch (err) {
    console.error('[commerce] oversold order refund threw; refund by hand', { orderId, err })
  }
}

/** Refund a paid order. Destination charges unwind with reverse_transfer +
 *  refund_application_fee; platform charges refund normally; a split order refunds on the platform
 *  and then reverses each seller's transfer pro rata (LIVE-623). A booking-backed service order with a
 *  cancellation/no-show policy refunds the COMPUTED (partial) amount; everything else refunds fully. */
export async function refundCommerceOrder(orderId: string): Promise<{ ok?: true; error?: string }> {
  if (!stripe) return { error: 'Payments aren’t turned on yet.' }
  const { data } = await db()
    .from('commerce_orders')
    .select('id, owner_kind, funds_flow, status, amount_cents, stripe_payment_intent_id, refunded_at, metadata')
    .eq('id', orderId)
    .maybeSingle()
  const order = data as
    | {
        id: string
        owner_kind: string
        funds_flow: string | null
        status: string
        amount_cents: number
        stripe_payment_intent_id: string | null
        refunded_at: string | null
        metadata: Record<string, unknown> | null
      }
    | null
  if (!order) return { error: 'Order not found.' }
  if (order.status === 'refunded') return { ok: true }
  // L6-08 (2026-09-05): a PARTIAL refund keeps its settled status (the schema has no partial state; see
  // recordCommerceRefund) but stamps refunded_at and records the amount in metadata.refund.
  // SCAN-714: a bare `refunded_at` short-circuit treated any partial (a booking policy, a goodwill
  // refund from the Stripe dashboard) as "already refunded", so approving a dispute after one made no
  // Stripe call and closed as "Approved and refunded" while the buyer stayed under-refunded. The
  // partial record is what says how much is still owed; only a refund with nothing partial behind
  // it is finished.
  const partialRecord = order.metadata?.refund as PartialRefundRecord | undefined
  const alreadyRefunded = partialRecord?.kind === 'partial' ? Math.max(0, partialRecord.refunded_cents) : 0
  if (order.refunded_at && alreadyRefunded === 0) return { ok: true }
  if (order.status !== 'paid' && order.status !== 'fulfilled') return { error: 'Only a paid order can be refunded.' }
  if (!order.stripe_payment_intent_id) return { error: 'This order has no charge to refund.' }
  const remaining = order.amount_cents - alreadyRefunded
  if (remaining <= 0) return { ok: true }

  // Cancellation/no-show ENFORCEMENT (ADR-596, finding #4): a booking-backed service order with a
  // policy refunds only the computed amount (the seller keeps the fee). undefined ⇒ full refund.
  // After an earlier partial the policy has had its say: what is left goes back whole.
  const partialAmount =
    alreadyRefunded > 0
      ? null
      : await bookingPartialRefundCents({ id: order.id, amount_cents: order.amount_cents })
  const refundCents = partialAmount != null ? partialAmount : remaining

  try {
    await stripe.refunds.create({
      payment_intent: order.stripe_payment_intent_id,
      ...(refundCents < order.amount_cents ? { amount: refundCents } : {}),
      // The unwind follows the FUNDS FLOW (LIVE-621). A destination charge reverses its one transfer
      // and its application fee. A platform charge has neither. A SEPARATE order has neither ON THE
      // CHARGE either: its money landed on the platform and its transfers are separate objects, so
      // `reverse_transfer` here would be refused by Stripe and dead-end the refund. The transfers
      // LIVE-622 created at settle are rows in commerce_order_transfers, and each is reversed pro
      // rata AFTER this refund, below (LIVE-623, ./split-refund.ts): the buyer first.
      ...(order.owner_kind === 'platform' || order.funds_flow === 'separate'
        ? {}
        : { reverse_transfer: true, refund_application_fee: true }),
      metadata: { kind: 'commerce_order', order_id: order.id },
    })
  } catch (err) {
    console.error('[commerce] refund failed', { orderId, err })
    return { error: 'Refund failed at the payment processor.' }
  }
  // L6-08 (2026-09-05): record what was ACTUALLY refunded. Before this the partial amount went to Stripe
  // and the recorder was then told nothing, so it flipped the order to 'refunded' and reversed the whole
  // revenue: the ledger under-reported by the retained fee and the order read as fully refunded to
  // buyer and seller. The partial path releases the booking slot (this IS the policy-cancel).
  // A top-up after an earlier partial completes the refund: no options, so the order flips to refunded.
  await recordCommerceRefund(
    order.stripe_payment_intent_id,
    partialAmount != null ? { refundedCents: partialAmount, releaseBooking: true } : undefined,
  )
  // A SPLIT ORDER'S SELLERS GIVE BACK THEIR SHARE (LIVE-623, ADR-1615): each transfer reversed pro
  // rata to the seller's share of the gross, a transfer never made cancelled instead. The buyer has
  // their money already, so nothing here can fail the refund: a reversal that does not land is a
  // row the reconciler retries, and the charge.refunded webhook for this same refund runs the same
  // idempotent call again.
  if (order.funds_flow === 'separate') {
    try {
      await reverseSplitTransfers(order.id, alreadyRefunded + refundCents)
    } catch (err) {
      console.error('[commerce] split refund reversal not recorded; the charge.refunded webhook retries it', { orderId, err })
    }
  }
  return { ok: true }
}

export interface CommerceRefundOptions {
  /** Cents actually returned to the buyer. Omit for a full refund; a value >= amount_cents is full. */
  refundedCents?: number
  /** Release the booking slot behind a PARTIAL refund (the policy-cancel path). A full refund always
   *  releases it; a partial one arriving from the webhook alone (a dashboard goodwill refund) does not,
   *  because a partial refund by itself does not say the appointment was cancelled. */
  releaseBooking?: boolean
}

interface RefundedOrderRow {
  id: string
  owner_kind: OrderOwnerKind
  entity_id: string
  amount_cents: number
  platform_fee_cents: number
  buyer_profile_id: string | null
  currency: string
  metadata: Record<string, unknown> | null
}

const REFUND_ROW_COLS = 'id, owner_kind, entity_id, amount_cents, platform_fee_cents, buyer_profile_id, currency, metadata'

/** What a partial refund leaves in commerce_orders.metadata.refund (L6-08). The schema's status check
 *  (`pending|paid|fulfilled|cancelled|refunded|failed`, migration 20260815000000) has NO partial state and
 *  this lane adds no migration, so the order KEEPS its settled status (the sale partly stands: the seller
 *  kept the fee), `refunded_at` is stamped, and the amounts live here. The full path reads
 *  `revenue_reversed_cents` back so a later top-up to a full refund reverses only the remainder. */
export interface PartialRefundRecord {
  kind: 'partial'
  refunded_cents: number
  retained_cents: number
  revenue_reversed_cents: number
  recorded_at: string
}

/** The platform's recorded revenue for an order: the full amount for a first-party sale, the
 *  application fee for a destination charge (seller gross is off-ledger). */
function recordedRevenueCents(row: Pick<RefundedOrderRow, 'owner_kind' | 'amount_cents' | 'platform_fee_cents'>): number {
  return row.owner_kind === 'platform' ? row.amount_cents : row.platform_fee_cents
}

/** Record a refund against the order behind a PaymentIntent (idempotent).
 *  - FULL (no `refundedCents`, or >= amount_cents): paid/fulfilled → refunded, reverse the ledger for the
 *    revenue not already reversed by an earlier partial, release the booking, and restore tracked stock.
 *  - PARTIAL (`refundedCents` < amount_cents): status unchanged, refunded_at stamped once, ledger reversal
 *    pro-rated to the refunded share, booking released only when the caller says so. Stock is NOT restored
 *    on a partial refund: the goods were not returned, and the only partial path in the product is the
 *    booking policy, which has no stock. */
export async function recordCommerceRefund(
  paymentIntentId: string | null,
  opts: CommerceRefundOptions = {},
): Promise<void> {
  if (!paymentIntentId) return
  if (opts.refundedCents != null) {
    const { data, error } = await db()
      .from('commerce_orders')
      .select(`${REFUND_ROW_COLS}, status`)
      .eq('stripe_payment_intent_id', paymentIntentId)
      .in('status', ['paid', 'fulfilled', 'refunded'])
      .maybeSingle()
    if (error) throw new Error(`[commerce] refund target read failed: ${error.message}`)
    const target = data as (RefundedOrderRow & { status?: string }) | null
    if (!target) return // nothing settled behind this charge (not ours)
    if (target.status === 'refunded') {
      await unwindFullCommerceRefund(target, paymentIntentId)
      return
    }
    if (opts.refundedCents < target.amount_cents) {
      await recordPartialCommerceRefund(target.id, paymentIntentId, opts.refundedCents, opts.releaseBooking === true)
      return
    }
  }
  await recordFullCommerceRefund(paymentIntentId)
}

/** Flip a refunded order + reverse the ledger entry (idempotent; paid → refunded). */
async function recordFullCommerceRefund(paymentIntentId: string): Promise<void> {
  const { data: updated, error: flipError } = await db()
    .from('commerce_orders')
    .update({ status: 'refunded', refunded_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', paymentIntentId)
    .in('status', ['paid', 'fulfilled'])
    .select(REFUND_ROW_COLS)
  if (flipError) throw new Error(`[commerce] refunded flip failed: ${flipError.message}`)
  const rows = (updated ?? []) as RefundedOrderRow[]
  if (rows.length === 0) {
    // All required cleanup remains retryable after the refund status committed.
    const { data, error } = await db().from('commerce_orders').select(REFUND_ROW_COLS)
      .eq('stripe_payment_intent_id', paymentIntentId).eq('status', 'refunded')
    if (error) throw new Error(`[commerce] refunded replay read failed: ${error.message}`)
    for (const row of (data ?? []) as RefundedOrderRow[]) await unwindFullCommerceRefund(row, paymentIntentId)
    return
  }
  for (const row of rows) await unwindFullCommerceRefund(row, paymentIntentId)
}

/** Replay the same idempotent unwind after the refund status has committed. */
async function unwindFullCommerceRefund(row: RefundedOrderRow, paymentIntentId: string): Promise<void> {
  const revenue = recordedRevenueCents(row)
  // A partial refund recorded earlier already reversed part of this revenue (L6-08); reverse the rest.
  const partial = (row.metadata?.refund ?? null) as Partial<PartialRefundRecord> | null
  const alreadyReversed = partial?.kind === 'partial' ? Math.max(0, Number(partial.revenue_reversed_cents) || 0) : 0
  await recordFinancialTransaction({
    entityId: row.entity_id,
    revenueType: 'refund',
    amountCents: -Math.max(0, revenue - alreadyReversed),
    profileId: row.buyer_profile_id,
    currency: row.currency,
    stripePaymentIntentId: paymentIntentId,
    sourceTable: 'commerce_orders',
    sourceId: row.id,
    idempotencyKey: `commerce_order-refund:${row.id}`,
  })

  // A failed cancellation must release the webhook claim so the next delivery repairs it.
  await cancelBookingByOrder(row.id, { strict: true })

  // Journeys (ADR-1397): a FULL refund takes the access back with the money. Deliberately NOT on the
  // partial-refund path below -- a partial refund is a price adjustment, not a withdrawal, and a
  // learner who got $50 back should not lose the program. A finished Journey is never un-finished
  // (revokeJourneyByOrder skips completed enrolments), because a completion and its rewards already
  // happened and rewriting a member's record to settle a billing question is the worse error.
  try {
    await revokeJourneyByOrder(row.id, { strict: true })
  } finally {
    // Stock has its own atomic restore marker. Access failure must not skip this unwind.
    await restoreCommerceStock(row, { strict: true })
  }
}

/** Record a PARTIAL refund (L6-08): stamp refunded_at + metadata.refund, reverse the pro-rated revenue,
 *  and release the booking when asked. Both the server action and the charge.refunded webhook arrive here
 *  for the same refund. SCAN-714: the old `refunded_at is null` guard made the SECOND partial (a goodwill
 *  refund after a policy one, or a cumulative amount from the webhook) a silent no-op. The record is
 *  cumulative now: it is rewritten only when the refunded amount GREW, and only the delta's revenue is
 *  reversed, so a replay of the same amount is still a no-op. */
async function recordPartialCommerceRefund(
  orderId: string,
  paymentIntentId: string,
  refundedCents: number,
  releaseBooking: boolean,
): Promise<void> {
  const { data } = await db().from('commerce_orders').select(REFUND_ROW_COLS).eq('id', orderId).maybeSingle()
  const row = data as RefundedOrderRow | null
  if (!row) return
  const refunded = Math.max(0, Math.min(row.amount_cents, Math.round(refundedCents)))
  const prior = row.metadata?.refund as PartialRefundRecord | undefined
  const priorRefunded = prior?.kind === 'partial' ? Math.max(0, prior.refunded_cents) : 0
  const priorReversed = prior?.kind === 'partial' ? Math.max(0, prior.revenue_reversed_cents) : 0
  if (refunded <= priorRefunded) return // the same or an earlier amount: already recorded (idempotent)
  const revenue = recordedRevenueCents(row)
  // Pro-rate: Stripe refunds the application fee in the same proportion on a partial refund with
  // refund_application_fee, and a platform sale's revenue IS the amount, so the share is exact there.
  const reversed = row.amount_cents > 0 ? Math.min(revenue, Math.round((revenue * refunded) / row.amount_cents)) : 0
  const delta = Math.max(0, reversed - priorReversed)
  const record: PartialRefundRecord = {
    kind: 'partial',
    refunded_cents: refunded,
    retained_cents: row.amount_cents - refunded,
    revenue_reversed_cents: reversed,
    recorded_at: new Date().toISOString(),
  }
  // The compare-and-set is on the STORED amount: two writers racing with the same new total leave
  // one of them matching nothing, so the delta is reversed once.
  let stamp = db()
    .from('commerce_orders')
    .update({ refunded_at: record.recorded_at, metadata: { ...(row.metadata ?? {}), refund: record } })
    .eq('id', orderId)
    .in('status', ['paid', 'fulfilled'])
  stamp = prior?.kind === 'partial'
    ? stamp.eq('metadata->refund->>refunded_cents', String(priorRefunded))
    : stamp.is('metadata->refund', null)
  const { data: stamped } = await stamp.select('id')
  if (!(stamped ?? []).length) return // another writer recorded it first (idempotent)

  await recordFinancialTransaction({
    entityId: row.entity_id,
    revenueType: 'refund',
    amountCents: -delta,
    profileId: row.buyer_profile_id,
    currency: row.currency,
    stripePaymentIntentId: paymentIntentId,
    sourceTable: 'commerce_orders',
    sourceId: row.id,
    idempotencyKey: `commerce_order-refund:${row.id}:partial:${refunded}`,
  }).catch(() => {})

  if (releaseBooking) await cancelBookingByOrder(row.id)
}

/** Re-increment tracked stock for a FULLY refunded order (L6-16), in ONE statement.
 *
 *  LIVE-161 (2026-09-06): this used to be three round trips per item -- read the stock, write it
 *  back under a `where stock = <the value read>` guard, retry up to five times on a lost race --
 *  followed by a fourth request stamping `metadata.inventory_restored`. The guard was real (it
 *  never overwrote a concurrent sale) but it could EXHAUST its retries and silently drop the units,
 *  and the once-marker being a separate request meant two callers arriving together could both read
 *  "not yet restored" and both put the stock back.
 *
 *  restore_commerce_stock_atomic (migration 20270345001600) is the inverse of
 *  decrement_commerce_stock_atomic: it takes `select ... for update` on the order row, so
 *  concurrent restorers serialise and the second one no-ops on the marker; it increments with
 *  `stock = stock + n` under the UPDATE's own lock, so there is no lost update to retry for; and
 *  the increments plus the marker commit together, so the shelf and the order can never disagree.
 *  It also owns both preconditions now (never decremented -> nothing to give back; already
 *  restored -> no-op), which is why the caller passes nothing but the id.
 */
async function restoreCommerceStock(order: Pick<RefundedOrderRow, 'id'>, opts?: { strict?: boolean }): Promise<void> {
  const { error } = await db().rpc('restore_commerce_stock_atomic', { _order: order.id })
  if (error) {
    if (opts?.strict) throw new Error(`[commerce] stock restore failed: ${error.message}`)
    // Nothing partial can be left behind (the RPC is one transaction), so a failure here means the
    // stock is simply still off the shelf. Strict recovery callers above throw for redelivery.
    console.error('[commerce] stock restore failed; tracked stock is still held by this order', {
      orderId: order.id,
      error: error.message,
    })
  }
}

/** Resolve the refund's PaymentIntent from a charge.refunded event and reconcile.
 *  No-ops unless a matching paid commerce order exists (mirrors tickets). L6-08 (2026-09-05): a
 *  partial refund (amount_refunded < amount) is recorded AS partial, never as a full one; the ticket
 *  twin returns early instead, but commerce issues partials itself (the booking policy), so the
 *  recorder has to understand them. The status flip only happens once the charge is fully refunded. */
export async function recordCommerceRefundFromCharge(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null
  const amount = charge.amount ?? 0
  const refunded = charge.amount_refunded ?? 0
  if (refunded < amount) {
    await recordCommerceRefund(paymentIntentId, { refundedCents: refunded })
  } else {
    await recordCommerceRefund(paymentIntentId)
  }
  // LIVE-623: a refund of a split order, made here or in the Stripe dashboard, takes each seller's
  // pro rata part back from their transfer. `amount_refunded` is cumulative, so a replay of this
  // event, or of an earlier partial, reverses nothing twice. A charge that is not a split order's
  // matches nothing. Throws on a database error, so the webhook redelivers.
  await reverseSplitRefundForPaymentIntent(paymentIntentId, refunded)
}

/**
 * A dispute on a commerce charge that the platform LOST (LIVE-623, ADR-1615): the buyer has the
 * disputed amount back through their bank, so the order is recorded refunded for it through the same
 * recorder a refund uses, and on a split order each seller's transfer is reversed pro rata through the
 * same function. That is the liability case ADR-1565 §5 names: the money already sat in the sellers'
 * balances when the chargeback landed. What the buyer has had back is the refunds already on the
 * charge plus the disputed amount. A dispute won, or closed with a warning, changes nothing; a charge
 * that is not a commerce order's matches nothing. Throws on a database or Stripe read error, so the
 * webhook redelivers.
 *
 * NOT HERE: taking a DESTINATION order's one transfer back after a lost dispute (the order is recorded
 * refunded; its seller's transfer is not reversed), and disputes on tickets, tips or donations.
 */
export async function recordCommerceDisputeClosed(dispute: Stripe.Dispute): Promise<void> {
  if (dispute?.status !== 'lost') return
  const paymentIntentId =
    typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id ?? null
  if (!paymentIntentId) return
  const { data, error } = await db()
    .from('commerce_orders')
    .select('id, amount_cents, funds_flow, owner_profile_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .in('status', ['paid', 'fulfilled', 'refunded'])
    .maybeSingle()
  if (error) throw new Error(`order for disputed ${paymentIntentId} unreadable: ${error.message}`)
  const order = data as { id: string; amount_cents: number; funds_flow: string | null; owner_profile_id: string | null } | null
  if (!order) return
  // A lost chargeback is a trust penalty for the member who sold it (LIVE-679). Keyed on the dispute,
  // so a redelivered webhook counts it once.
  await emitDisputeLost(order, dispute.id)

  let refundedBefore = 0
  if (dispute.charge && typeof dispute.charge === 'object') {
    refundedBefore = dispute.charge.amount_refunded ?? 0
  } else if (typeof dispute.charge === 'string' && stripe) {
    const charge = await stripe.charges.retrieve(dispute.charge)
    refundedBefore = charge?.amount_refunded ?? 0
  }
  const taken = Math.min(order.amount_cents, refundedBefore + Math.max(0, dispute.amount ?? 0))
  if (taken <= 0) return

  console.warn('[commerce] dispute lost; recording it as a refund', { orderId: order.id, disputeId: dispute.id, taken })
  await recordCommerceRefund(paymentIntentId, taken < order.amount_cents ? { refundedCents: taken } : undefined)
  if (order.funds_flow === 'separate') await reverseSplitTransfers(order.id, taken)
}
