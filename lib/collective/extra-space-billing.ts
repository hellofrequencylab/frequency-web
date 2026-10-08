import { randomUUID } from 'node:crypto'
import type Stripe from 'stripe'
import { stripe } from '@/lib/billing/stripe'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { isCollectivePlan } from './member-spaces'
import { billingLive } from '@/lib/pricing/settings'
import { resolveStripePriceId } from '@/lib/billing/pricing-prices'
import { catalogPriceKey, type BillingInterval } from '@/lib/billing/pricing-keys'
import { reconciledItemsFromSubscription } from '@/lib/billing/space-subscription-items'
import { reconcileSpacePlanSubscription } from '@/lib/billing/space-subscriptions'
import { ok, fail, type ActionResult } from '@/lib/action-result'

export interface ExtraSpaceQuote {
  quantity: number; minQuantity: number; priceId: string; unitCents: number; interval: BillingInterval
}
interface OwnedCollective { owner_profile_id: string; stripe_subscription_id: string | null; plan: string; status: string; type: string; feature_roles?: unknown; entitlements?: unknown }

async function ownedSubscription(spaceId: string): Promise<{ sub: Stripe.Subscription; ownerId: string } | null> {
  const caller = await getCallerProfile()
  if (!caller || !stripe || !(await billingLive())) return null
  const result = await createAdminClient().from('spaces')
    .select('owner_profile_id, stripe_subscription_id, plan, status, type, feature_roles, entitlements').eq('id', spaceId).maybeSingle()
  const row = result.data as unknown as OwnedCollective | null
  if (result.error || !row || row.owner_profile_id !== caller.id || !isCollectivePlan(row.plan)
    || row.status !== 'active' || row.type === 'root'
    || !spaceFunctionAccess({ ownerProfileId: row.owner_profile_id, featureRoles: row.feature_roles, entitlements: row.entitlements }, 'billing', 'admin')
    || !row.stripe_subscription_id) return null
  const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id, {}, { timeout: 20000, maxNetworkRetries: 0 })
  if (sub.metadata.space_id !== spaceId || sub.metadata.kind !== 'space_plan'
    || !['active', 'trialing', 'past_due'].includes(sub.status)) return null
  const base = reconciledItemsFromSubscription(sub).filter(i => ['collective', 'nonprofit_collective'].includes(i.itemKey))
  if (base.length !== 1) return null
  return { sub, ownerId: caller.id }
}

async function quoteFor(sub: Stripe.Subscription, spaceId: string): Promise<ExtraSpaceQuote | null> {
  if (!stripe) return null
  const items = reconciledItemsFromSubscription(sub)
  const base = items.find(i => ['collective', 'nonprofit_collective'].includes(i.itemKey))!
  const extras = items.filter(i => i.itemKey === 'collective_space')
  if (extras.length > 1 || (extras[0] && extras[0].interval !== base.interval)) return null
  const current = extras[0]
  const priceId = current?.lockedPriceId ?? await resolveStripePriceId(catalogPriceKey('collective_space', base.interval, false))
  if (!priceId) return null
  const price = await stripe.prices.retrieve(priceId, {}, { timeout: 20000, maxNetworkRetries: 0 })
  if (!current && price.active !== true) return null
  const key = price.metadata.frequency_pricing_key
  if (price.currency !== 'usd' || price.unit_amount === null || price.unit_amount < 0
    || price.recurring?.interval !== base.interval || ![catalogPriceKey('collective_space', base.interval, false), catalogPriceKey('collective_space', base.interval, true)].includes(key)) return null
  const count = await createAdminClient().from('spaces').select('id', { count: 'exact', head: true }).eq('parent_id', spaceId)
  if (count.error || count.count === null) return null
  return { quantity: current?.quantity ?? 0, minQuantity: Math.max(0, count.count - 5), priceId,
    unitCents: price.unit_amount, interval: base.interval }
}

/** Exact live/locked price, not a duplicated catalog guess. Missing Stripe prices produce no CTA. */
export async function loadExtraSpaceQuote(spaceId: string): Promise<ExtraSpaceQuote | null> {
  try { const owned = await ownedSubscription(spaceId); return owned ? await quoteFor(owned.sub, spaceId) : null }
  catch { return null }
}

/** Only the collective_space item changes. Reservation serializes this and attach-capacity reads. */
export async function updateExtraCollectiveSpaces(spaceId: string, target: number, expectedPriceId: string, expectedUnitCents: number): Promise<ActionResult> {
  if (!Number.isSafeInteger(target) || target < 0 || target > 2147483642) return fail('Choose a valid number of extra Spaces.')
  let token: string | null = null
  let mutated = false
  const db = createAdminClient()
  try {
    const owned = await ownedSubscription(spaceId)
    if (!owned || !stripe) return fail('You must own an active, subscribed Collective to change extra Spaces.')
    const quote = await quoteFor(owned.sub, spaceId)
    if (!quote) return fail('Extra-Space pricing is not available yet. Try again once billing is ready.')
    if (quote.priceId !== expectedPriceId || quote.unitCents !== expectedUnitCents) return fail('Pricing changed. Refresh this page before saving.')
    if (target < quote.minQuantity) return fail('Detach member Spaces before reducing the number you pay for.')
    if (target === quote.quantity) return ok()
    token = randomUUID()
    const reservation = (await db.rpc('begin_collective_space_change' as never,
      { p_parent_id: spaceId, p_owner_id: owned.ownerId, p_target: target, p_token: token } as never)) as unknown as { error: unknown; data: boolean | null }
    if (reservation.error) return fail('Could not reserve this change. Check your attached Spaces and try again.')
    if (reservation.data !== true) return fail('Another billing change is in progress. Try again shortly.')
    // A concurrent completed change may have landed between the first quote and reservation.
    const fresh = await ownedSubscription(spaceId)
    if (!fresh) return fail('Your subscription changed. Refresh before saving.')
    const freshQuote = await quoteFor(fresh.sub, spaceId)
    if (!freshQuote || freshQuote.priceId !== expectedPriceId || freshQuote.unitCents !== expectedUnitCents) return fail('Pricing changed. Refresh before saving.')
    if (target === freshQuote.quantity) return ok()
    const current = reconciledItemsFromSubscription(fresh.sub).find(i => i.itemKey === 'collective_space')
    const item = current?.stripeSubscriptionItemId
      ? target === 0 ? { id: current.stripeSubscriptionItemId, deleted: true } : { id: current.stripeSubscriptionItemId, quantity: target }
      : { price: quote.priceId, quantity: target }
    mutated = true // A network failure can leave the outcome uncertain; retain the reservation.
    const updated = await stripe.subscriptions.update(fresh.sub.id, {
      items: [item], proration_behavior: 'create_prorations', payment_behavior: 'error_if_incomplete',
    }, { idempotencyKey: token, timeout: 20000, maxNetworkRetries: 0 })
    await reconcileSpacePlanSubscription(updated)
    const settled = await db.from('space_subscription_items').select('quantity, status')
      .eq('space_id', spaceId).eq('item_key', 'collective_space').maybeSingle()
    const actual = settled.data && ['active', 'trialing', 'past_due'].includes(settled.data.status) ? settled.data.quantity : 0
    if (settled.error || actual !== target) return fail('Your billing change is saved and capacity is still syncing. Refresh shortly.')
    await db.rpc('finish_collective_space_change' as never, { p_parent_id: spaceId, p_token: token } as never)
    token = null
    return ok()
  } catch { return fail('Could not update extra Spaces. Refresh before trying again.') }
  finally {
    // On uncertain reconciliation retain the restrictive reservation until its bounded expiry.
    if (token && !mutated) await db.rpc('finish_collective_space_change' as never, { p_parent_id: spaceId, p_token: token } as never)
  }
}
