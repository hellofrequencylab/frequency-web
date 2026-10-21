import { createHash } from 'node:crypto'
import { stripe } from '@/lib/billing/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { activeAgreementForSpace } from '@/lib/billing/manual-agreements'
import { resolveStripePriceId } from '@/lib/billing/pricing-prices'
import { catalogPriceKey, type CatalogItemKey } from '@/lib/billing/pricing-keys'
import { reconciledItemsFromSubscription } from '@/lib/billing/space-subscription-items'
import { reconcileSpacePlanSubscription } from '@/lib/billing/space-subscriptions'
import { NETWORK_SITE_PLAN } from '@/lib/pricing/plans'
import { spaceHasEntitlement } from '@/lib/spaces/entitlements'
import { BADGE_REMOVAL_ENTITLEMENT } from '@/lib/sites/site-badge'
import { ok, fail, isError, type ActionResult } from '@/lib/action-result'
import { isNetworkPlan } from './member-spaces'
import { ownedSubscription } from './extra-space-billing'

// WHAT A NETWORK PAYS FOR ITS CLIENT WEBSITES (ADR-1816). Each live client site is billed on the Network's own
// subscription on a volume ladder: $39 for sites 1 to 10, $29 for 11 to 25, $19 from 26, the custom domain
// included, plus $15 a site for badge removal. The ladder is graduated (site 11 costs $29, site 1 still $39), so
// the count is split across three flat-price lines and the badge-free count rides a fourth. This file owns the
// pure split and the one IO step that makes the subscription match the live sites. Creating, archiving or
// un-badging a site calls `syncClientSiteBilling`; nobody types a quantity.

type SiteLine = 'network_site' | 'network_site_mid' | 'network_site_high' | 'network_site_unbranded'
type SiteLineQuantities = Record<SiteLine, number>

const LINES: readonly SiteLine[] = ['network_site', 'network_site_mid', 'network_site_high', 'network_site_unbranded']
const LINE_CENTS: Record<SiteLine, number> = {
  network_site: NETWORK_SITE_PLAN.tiers[0].cents,
  network_site_mid: NETWORK_SITE_PLAN.tiers[1].cents,
  network_site_high: NETWORK_SITE_PLAN.tiers[2].cents,
  network_site_unbranded: NETWORK_SITE_PLAN.badgeRemovalCents,
}

/** Split `sites` live client sites over the ladder, and carry how many of them are badge-free. PURE. A badge-free
 *  count past the site count is clamped, and negatives or fractions read as zero. */
export function siteLineQuantities(sites: number, unbranded: number): SiteLineQuantities {
  const n = Number.isFinite(sites) && sites > 0 ? Math.floor(sites) : 0
  const [first, second] = NETWORK_SITE_PLAN.tiers
  const low = Math.min(n, first.upTo)
  const mid = Math.min(Math.max(n - first.upTo, 0), second.upTo - first.upTo)
  const high = Math.max(n - second.upTo, 0)
  const free = Number.isFinite(unbranded) && unbranded > 0 ? Math.min(Math.floor(unbranded), n) : 0
  return { network_site: low, network_site_mid: mid, network_site_high: high, network_site_unbranded: free }
}

/** What the Network pays Frequency a month for these quantities. PURE. */
export function clientSiteMonthlyCents(q: SiteLineQuantities): number {
  return LINES.reduce((sum, line) => sum + q[line] * LINE_CENTS[line], 0)
}

/** The live client sites a Network resells, and how many hold badge removal. Archived sites are not billed. */
async function liveClientSites(networkId: string): Promise<{ sites: number; unbranded: number } | null> {
  const result = await createAdminClient().from('spaces').select('id, entitlements').eq('reseller_network_id' as never, networkId).eq('status', 'active')
  if (result.error || !result.data) return null
  const rows = result.data as unknown as { entitlements: unknown }[]
  return { sites: rows.length, unbranded: rows.filter((r) => spaceHasEntitlement({ entitlements: r.entitlements }, BADGE_REMOVAL_ENTITLEMENT)).length }
}

/** A Network Frequency set up by hand: a Network plan with no subscription behind it (the admin Plan panel is the
 *  only way to get one, since a cancelled subscription drops the plan to free) and no recorded cash deal. The
 *  caller must be its owner. Its client sites carry no charge, because there is no bill to put them on. */
async function isCompedNetwork(networkId: string): Promise<boolean> {
  const caller = await getMyProfileId()
  if (!caller) return false
  const result = await createAdminClient().from('spaces').select('owner_profile_id, plan, status, stripe_subscription_id').eq('id', networkId).maybeSingle()
  const row = result.data as unknown as { owner_profile_id: string | null; plan: string; status: string; stripe_subscription_id: string | null } | null
  if (result.error || !row || row.owner_profile_id !== caller || !isNetworkPlan(row.plan) || row.status !== 'active' || row.stripe_subscription_id) return false
  return !(await activeAgreementForSpace(networkId))
}

/** May the signed-in person add, hand off, un-badge or remove this Network's client sites? The owner of a
 *  subscribed Network (they are billed), or the owner of a hand-set Network (nothing is billed). */
export async function canManageClientSites(networkId: string): Promise<{ billed: boolean } | null> {
  const owned = await ownedSubscription(networkId)
  if (owned && isNetworkPlan(owned.plan)) return { billed: true }
  return (await isCompedNetwork(networkId)) ? { billed: false } : null
}

/** Make the Network's subscription carry exactly the client-site lines its live sites call for, prorated.
 *  Owner-gated on the Network (the same gate as extra chapters). A line whose Stripe price has not been created
 *  yet refuses the change, so a site is never added for free by accident. */
export async function syncClientSiteBilling(networkId: string): Promise<ActionResult> {
  try {
    const owned = await ownedSubscription(networkId)
    if (!owned && (await isCompedNetwork(networkId))) return ok()
    if (!owned || !stripe || !isNetworkPlan(owned.plan)) return fail('You must own an active, subscribed Network to bill client sites.')
    const live = await liveClientSites(networkId)
    if (!live) return fail('Could not count your client sites. Try again.')
    const want = siteLineQuantities(live.sites, live.unbranded)
    const items = reconciledItemsFromSubscription(owned.sub)
    const base = items.find((i) => i.itemKey === 'network' || i.itemKey === 'collective' || i.itemKey === 'nonprofit_collective')
    if (!base) return fail('Your subscription changed. Refresh before saving.')
    const changes: ({ id: string; quantity: number } | { id: string; deleted: true } | { price: string; quantity: number })[] = []
    for (const line of LINES) {
      const current = items.find((i) => i.itemKey === line)
      const target = want[line]
      if ((current?.quantity ?? 0) === target) continue
      if (current?.stripeSubscriptionItemId) {
        changes.push(target === 0 ? { id: current.stripeSubscriptionItemId, deleted: true } : { id: current.stripeSubscriptionItemId, quantity: target })
        continue
      }
      const priceId = await resolveStripePriceId(catalogPriceKey(line as CatalogItemKey, base.interval, false))
      if (!priceId) return fail('Client site pricing is not set up yet. Talk to us.')
      const price = await stripe.prices.retrieve(priceId, {}, { timeout: 20000, maxNetworkRetries: 0 })
      const expected = LINE_CENTS[line] * (base.interval === 'year' ? 10 : 1)
      if (price.active !== true || price.currency !== 'usd' || price.unit_amount !== expected || price.recurring?.interval !== base.interval
        || price.metadata.frequency_pricing_key !== catalogPriceKey(line as CatalogItemKey, base.interval, false)) return fail('Client site pricing is not available yet. Talk to us.')
      changes.push({ price: priceId, quantity: target })
    }
    if (!changes.length) return ok()
    const idempotencyKey = `client-sites:${networkId}:${createHash('sha256').update(JSON.stringify([owned.sub.id, want, items.map((i) => [i.itemKey, i.quantity])])).digest('hex').slice(0, 32)}`
    const updated = await stripe.subscriptions.update(owned.sub.id, {
      items: changes, proration_behavior: 'create_prorations', payment_behavior: 'error_if_incomplete',
    }, { idempotencyKey, timeout: 20000, maxNetworkRetries: 0 })
    await reconcileSpacePlanSubscription(updated)
    return ok()
  } catch { return fail('Could not update your client site billing. Refresh before trying again.') }
}

/** Turn badge removal on or off for one client site (+$15 a month on the Network's bill). Grants or clears the
 *  `badge_removal` entitlement, then re-syncs the bill; if the bill cannot change, the grant is put back so the
 *  Network never gets the removal unpaid. Owner-gated on the Network, and the site must be one it resells. */
export async function setClientSiteBadgeRemoval(networkId: string, siteId: string, on: boolean): Promise<ActionResult> {
  try {
    if (!(await canManageClientSites(networkId))) return fail('You must own an active, subscribed Network to change a client site.')
    const db = createAdminClient()
    const found = await db.from('spaces').select('id, entitlements').eq('id', siteId).eq('reseller_network_id' as never, networkId).maybeSingle()
    const site = found.data as unknown as { id: string; entitlements: unknown } | null
    if (found.error || !site) return fail('That site is not one of your client sites.')
    const before = site.entitlements && typeof site.entitlements === 'object' && !Array.isArray(site.entitlements) ? (site.entitlements as Record<string, unknown>) : {}
    if ((before[BADGE_REMOVAL_ENTITLEMENT] === true) === on) return ok()
    const write = async (entitlements: Record<string, unknown>) => (await db.from('spaces').update({ entitlements } as never).eq('id', siteId)).error
    const next = { ...before }
    if (on) next[BADGE_REMOVAL_ENTITLEMENT] = true
    else delete next[BADGE_REMOVAL_ENTITLEMENT]
    if (await write(next)) return fail('Could not save that change. Try again.')
    const synced = await syncClientSiteBilling(networkId)
    if (isError(synced)) { await write(before); return synced }
    return ok()
  } catch { return fail('Could not change that client site. Refresh before trying again.') }
}
