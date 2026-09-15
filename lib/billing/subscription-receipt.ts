// THE SUBSCRIPTION RECEIPTS (LIVE-344). Somebody starts paying every month and is told nothing.
//
// Three recurring loops settled in silence:
//   • a MEMBER joining a paid Space membership tier (reconcileSpaceMembershipSubscription). The
//     membership row appeared, the Circle access was granted, and neither the member nor the Space
//     was told a recurring charge had started.
//   • an OPERATOR putting their Space on a paid plan (reconcileSpacePlanSubscription). The plan
//     flipped, the entitlements landed, and the person paying for it saw a changed settings page and
//     nothing else.
//   • a MEMBER's own Crew subscription and the Household bundle, whose invoices are booked by
//     recordMembershipDuesFromInvoice. That one fires on the FIRST payment and on every renewal,
//     which is exactly the cadence a subscription receipt wants.
//
// ── IDEMPOTENCY, WHICH IS DIFFERENT ON EACH OF THE THREE ─────────────────────────────────────────
// A subscription emits many events for one purchase (`.created` and `.updated` inside the same
// second, then one per renewal, per card change, per status flip), so "the caller already deduped
// it" has to mean something specific on each path, and each caller states which:
//   • the membership receipt runs only on the INSERT that created the membership (a duplicate insert
//     returns 23505 and sends nothing);
//   • the plan receipt runs only on the free -> paid TRANSITION, read from the Space's stored plan
//     BEFORE the reconcile writes the new one, so a redelivery reads paid -> paid and sends nothing;
//   • the invoice receipt runs only when the ledger append reported `recorded: true`, which is the
//     exactly-once signal recordFinancialTransaction already computes from its idempotency key.
// Nothing in this file dedupes for itself, and nothing in this file should learn to.

import 'server-only'

import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { appUrl } from './stripe'
import { SPACE_PLAN_LABEL, type SpacePlan } from '@/lib/pricing/plans'
import {
  displayNameFor,
  notifyEarner,
  receiptAmount,
  receiptDate,
  sendMoneyReceipt,
  spaceReceiptTarget,
} from './receipt-email'

const LOG_MEMBERSHIP = '[space-membership receipt]'
const LOG_PLAN = '[space-plan receipt]'
const LOG_INVOICE = '[membership receipt]'

/** The `notifications.type` a Space owner's new-paying-member notice carries. */
export const SPACE_MEMBER_PAID_NOTIFICATION_TYPE = 'space_membership_paid'

/** "$12 a month", or null when the subscription carries no readable recurring price. Sums every item
 *  so a multi-item Space plan prints what the operator actually pays, not its first line. */
export function subscriptionPriceLabel(sub: Stripe.Subscription): string | null {
  try {
    const items = sub.items?.data ?? []
    if (!items.length) return null
    let total = 0
    let interval: string | null = null
    let currency: string | null = null
    for (const item of items) {
      const unit = item.price?.unit_amount
      if (typeof unit !== 'number') continue
      total += unit * (item.quantity ?? 1)
      interval = interval ?? item.price?.recurring?.interval ?? null
      currency = currency ?? item.price?.currency ?? null
    }
    const amount = receiptAmount(total, currency)
    if (!amount) return null
    if (interval === 'year') return `${amount} a year`
    if (interval === 'month') return `${amount} a month`
    return amount
  } catch {
    return null
  }
}

/** The tier a member joined, by name. Best-effort: a missing name costs a label, never the receipt. */
async function tierName(tierId: string | null | undefined): Promise<string> {
  if (!tierId) return 'Membership'
  try {
    const { data, error } = await createAdminClient()
      .from('space_membership_tiers')
      .select('name')
      .eq('id', tierId)
      .maybeSingle()
    if (error) {
      console.warn(`${LOG_MEMBERSHIP} tier name unreadable`, { tierId, error: error.message })
      return 'Membership'
    }
    return ((data as { name?: string | null } | null)?.name ?? '').trim() || 'Membership'
  } catch {
    return 'Membership'
  }
}

// ── 1. A member joins a paid Space membership tier ─────────────────────────────────────────────

/**
 * Tell the new member their membership started, and tell the Space it gained a paying member.
 *
 * Called ONLY from the first-payment INSERT in reconcileSpaceMembershipSubscription. A tier switch,
 * a card recovery and a cancellation all take the UPDATE path and send nothing from here: none of
 * them is a new member, and a receipt that fires on a status flip is a receipt nobody trusts.
 *
 * BEST-EFFORT ON EVERY PATH; every failure is logged. Resolves void on every path.
 */
export async function sendSpaceMembershipReceipts(opts: {
  spaceId: string
  memberProfileId: string
  tierId: string | null
  sub: Stripe.Subscription
}): Promise<void> {
  try {
    const space = await spaceReceiptTarget(opts.spaceId)
    if (!space) {
      console.error(`${LOG_MEMBERSHIP} space not found; nobody was told about a new paying member`, {
        spaceId: opts.spaceId,
        memberProfileId: opts.memberProfileId,
      })
      return
    }
    const tier = await tierName(opts.tierId)
    const price = subscriptionPriceLabel(opts.sub)
    const when = receiptDate()
    const spaceUrl = `${appUrl()}/spaces/${space.slug}`
    const memberName = (await displayNameFor(opts.memberProfileId)) ?? 'Someone'

    // ── The member's receipt ─────────────────────────────────────────────────────────────────
    await sendMoneyReceipt({
      profileId: opts.memberProfileId,
      subject: `Your ${tier} membership at ${space.name}`,
      content: {
        greetingName: await displayNameFor(opts.memberProfileId),
        lead: `Your ${tier} membership at ${space.name} is active.`,
        lines: [
          { label: 'Space', value: space.name },
          { label: 'Membership', value: tier },
          { label: 'Price', value: price ?? '' },
          { label: 'Started', value: when },
        ],
        closing: [
          'It renews on its own until you cancel it, and you can cancel any time from your plan and billing settings.',
          'Keep this email as your record of what you joined and what it costs.',
        ],
        actionLabel: `Go to ${space.name}`,
        actionUrl: spaceUrl,
      },
      logTag: LOG_MEMBERSHIP,
      context: { spaceId: opts.spaceId, memberProfileId: opts.memberProfileId, side: 'member' },
    })

    // ── The Space's notice ───────────────────────────────────────────────────────────────────
    if (!space.ownerProfileId) {
      console.error(`${LOG_MEMBERSHIP} space has no owner; the new-member notice was NOT sent`, {
        spaceId: opts.spaceId,
      })
      return
    }
    await notifyEarner({
      recipientProfileId: space.ownerProfileId,
      actorProfileId: opts.memberProfileId,
      type: SPACE_MEMBER_PAID_NOTIFICATION_TYPE,
      referenceType: 'space',
      referenceId: space.slug,
      bellBody: `joined ${tier} at ${space.name}`,
      bellBodyNoActor: `Someone joined ${tier} at ${space.name}`,
      subject: `${memberName} joined ${tier}`,
      content: {
        greetingName: await displayNameFor(space.ownerProfileId),
        lead: `${memberName} joined ${tier} at ${space.name} and is paying for it.`,
        lines: [
          { label: 'Member', value: memberName },
          { label: 'Membership', value: tier },
          { label: 'Price', value: price ?? '' },
          { label: 'Started', value: when },
        ],
        closing: [
          'It renews on its own. The money goes to your payout account on your usual payout schedule.',
          'Anything the tier unlocks is already open to them.',
        ],
        actionLabel: `Go to ${space.name}`,
        actionUrl: spaceUrl,
      },
      logTag: LOG_MEMBERSHIP,
      context: { spaceId: opts.spaceId, memberProfileId: opts.memberProfileId, side: 'space' },
    })
  } catch (err) {
    console.error(`${LOG_MEMBERSHIP} membership receipts failed`, {
      spaceId: opts.spaceId,
      memberProfileId: opts.memberProfileId,
      err,
    })
  }
}

// ── 2. An operator puts a Space on a paid plan ─────────────────────────────────────────────────

/**
 * Tell the operator their Space is on a paid plan and what it costs.
 *
 * Called ONLY on the free -> paid transition (see the header). The Space IS the payer here, so there
 * is no second party: nobody else needs to hear that an operator bought their own plan.
 *
 * A TRIAL still gets this message, and says so. Stripe starts a trialing subscription the moment the
 * checkout completes and the plan is granted through the trial, so the operator has a live plan and
 * a card on file; telling them when the billing actually starts is the honest version.
 *
 * BEST-EFFORT ON EVERY PATH; every failure is logged. Resolves void on every path.
 */
export async function sendSpacePlanReceipt(opts: {
  spaceId: string
  plan: SpacePlan
  sub: Stripe.Subscription
}): Promise<void> {
  try {
    const space = await spaceReceiptTarget(opts.spaceId)
    if (!space) {
      console.error(`${LOG_PLAN} space not found; the plan receipt was NOT emailed`, { spaceId: opts.spaceId })
      return
    }
    if (!space.ownerProfileId) {
      console.error(`${LOG_PLAN} space has no owner; the plan receipt was NOT emailed`, { spaceId: opts.spaceId })
      return
    }
    const planLabel = SPACE_PLAN_LABEL[opts.plan] ?? opts.plan
    const price = subscriptionPriceLabel(opts.sub)
    const trialing = opts.sub.status === 'trialing'
    await sendMoneyReceipt({
      profileId: space.ownerProfileId,
      subject: `${space.name} is on the ${planLabel} plan`,
      content: {
        greetingName: await displayNameFor(space.ownerProfileId),
        lead: trialing
          ? `${space.name} is on the ${planLabel} plan. Your trial is running, so nothing has been charged yet.`
          : `${space.name} is on the ${planLabel} plan.`,
        lines: [
          { label: 'Space', value: space.name },
          { label: 'Plan', value: planLabel },
          { label: 'Price', value: price ?? '' },
          { label: 'Started', value: receiptDate() },
        ],
        closing: [
          trialing
            ? 'Billing starts when the trial ends. Cancel before then and nothing is charged.'
            : 'It renews on its own until you cancel it.',
          'Everything about the plan, including cancelling, lives in the Space billing settings.',
        ],
        actionLabel: 'Open billing settings',
        actionUrl: `${appUrl()}/spaces/${space.slug}/settings/billing`,
      },
      logTag: LOG_PLAN,
      context: { spaceId: opts.spaceId, plan: opts.plan },
    })
  } catch (err) {
    console.error(`${LOG_PLAN} plan receipt failed`, { spaceId: opts.spaceId, err })
  }
}

// ── 3. A member's own subscription invoice (Crew, and the Household bundle) ────────────────────

/**
 * Email the member the record of a paid membership invoice: the first payment and every renewal.
 *
 * Called ONLY when the ledger append reported `recorded: true`, so a redelivered `invoice.paid`
 * books nothing and sends nothing.
 *
 * NAMING (docs/NAMING.md, ADR-1084): a Crew membership is priced "contribute what you want", so the
 * Crew wording says contribution. A bundle is a straightforward purchase of seats and says payment.
 *
 * BEST-EFFORT ON EVERY PATH; every failure is logged. Resolves void on every path.
 */
export async function sendMembershipInvoiceReceipt(opts: {
  profileId: string | null
  amountCents: number
  currency: string | null
  /** The subscription metadata's `tier`, when it carries one. */
  tier?: string | null
  /** The subscription metadata's `kind`, when it carries one (the Household bundle sets it). */
  kind?: string | null
  invoiceId?: string | null
}): Promise<void> {
  try {
    if (!opts.profileId) {
      console.error(`${LOG_INVOICE} paid invoice resolved to no member; the receipt was NOT emailed`, {
        invoiceId: opts.invoiceId ?? null,
      })
      return
    }
    const amount = receiptAmount(opts.amountCents, opts.currency)
    const isCrew = (opts.tier ?? '').toLowerCase() === 'crew' && !opts.kind
    const what = isCrew ? 'Crew contribution' : 'membership payment'
    await sendMoneyReceipt({
      profileId: opts.profileId,
      subject: isCrew ? 'Your Crew contribution' : 'Your Frequency membership payment',
      content: {
        greetingName: await displayNameFor(opts.profileId),
        lead: amount ? `Your ${amount} ${what} went through.` : `Your ${what} went through.`,
        lines: [
          { label: 'Amount', value: amount ?? '' },
          { label: 'Date', value: receiptDate() },
          { label: 'For', value: isCrew ? 'Crew membership' : 'Frequency membership' },
        ],
        closing: [
          isCrew
            ? 'Every Crew amount carries the same access. You can change what you contribute, or stop, any time.'
            : 'It renews on its own until you cancel it.',
          'Your plan and billing settings hold every payment and the button to change it.',
        ],
        actionLabel: 'See your plan and billing',
        actionUrl: `${appUrl()}/settings/billing`,
      },
      logTag: LOG_INVOICE,
      context: { profileId: opts.profileId, invoiceId: opts.invoiceId ?? null },
    })
  } catch (err) {
    console.error(`${LOG_INVOICE} invoice receipt failed`, { invoiceId: opts.invoiceId ?? null, err })
  }
}
