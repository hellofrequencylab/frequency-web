/**
 * Store items on a Hunt, at the three places a player or an operator meets them (FH-038S).
 *
 *  - `huntsAfterOrderReturn`: the order checkout-return paths (the on-page settle, /orders and a Journey
 *    welcome all settle through `recordCommerceOrderFromSessionId`) project the same benefits the webhook
 *    does. One benefit per unit of a bound line, replay-safe, so whichever arrives first wins and the other
 *    is a no-op.
 *  - `storeLinksForHunt`: the player's deep link to an approved item, resolved on the server through
 *    `resolveStoreLink`. An item the store cannot sell right now keeps its name and loses its link.
 *  - `revokeOrderLineUnits`: a refund that names a line and a count revokes only that many units of that
 *    line, unused units first. This is how finance resolves a partial refund the provider reported by amount
 *    alone: a unit is never guessed from an amount (docs/hunts/REFUNDS-AND-DISPUTES.md).
 *
 * Same two rules as the rest of the money hooks: best effort (a failure never fails the store's settlement)
 * and dark until HUNTS_COMMERCE_ENABLED is on.
 */
import { db, huntRpc } from './commerce-store'
import { huntSwitchOn } from './flags'
import { resolveStoreLink, type StoreOffer } from './merch'
import { huntsAfterOrderSession } from './order-hooks'
import { applyReversal, decideReversal, pickUnitsToRevoke } from './refunds'

/** After a checkout return settled a commerce order. Never throws into the store's own settlement. */
export async function huntsAfterOrderReturn(sessionId: string): Promise<void> {
  if (!huntSwitchOn('commerce')) return
  try {
    await huntsAfterOrderSession(sessionId)
  } catch (err) {
    // The id came from the request: a fixed message, and only its safe characters, reach the log.
    console.error('[hunts-commerce] order return hook failed for session', sessionId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80), err)
  }
}

export type TrailStoreLink = Readonly<{ offerId: string; title: string; href: string | null; includesBenefit: boolean }>

type OfferRow = { id: string; hunt_id: string; seller_space_id: string; product_id: string; variant_id: string | null; benefit_code: string | null; requires_state: StoreOffer['requiresState']; status: StoreOffer['status'] }
type ProductRow = { id: string; title: string; owner_space_id: string | null; status: string; stock: number | null }
type VariantRow = { id: string; product_id: string; active: boolean; stock: number | null }

const inStock = (stock: number | null): boolean => stock === null || stock > 0

/**
 * The approved store items a player may be sent to from this Hunt. The seller and the exact item are read
 * here, never taken from the page: `href` is set only when `resolveStoreLink` says the item can be bought
 * now, and is null (the name stays, the purchase action goes) when it cannot. Empty while the switch is off.
 */
export async function storeLinksForHunt(huntId: string): Promise<TrailStoreLink[]> {
  if (!huntSwitchOn('commerce')) return []
  const { data: of } = await db()
    .from('hunt_store_offers')
    .select('id, hunt_id, seller_space_id, product_id, variant_id, benefit_code, requires_state, status')
    .eq('hunt_id', huntId)
    .eq('status', 'approved')
    .limit(12)
  const offers = (of as OfferRow[] | null) ?? []
  if (offers.length === 0) return []
  const { data: pr } = await db().from('commerce_products').select('id, title, owner_space_id, status, stock').in('id', [...new Set(offers.map((o) => o.product_id))])
  const products = new Map(((pr as ProductRow[] | null) ?? []).map((p) => [p.id, p]))
  const variantIds = offers.map((o) => o.variant_id).filter((v): v is string => !!v)
  const { data: vr } = variantIds.length ? await db().from('commerce_variants').select('id, product_id, active, stock').in('id', variantIds) : { data: [] }
  const variants = new Map(((vr as VariantRow[] | null) ?? []).map((v) => [v.id, v]))

  const out: TrailStoreLink[] = []
  for (const o of offers) {
    const product = products.get(o.product_id)
    if (!product) continue // nothing to name: the item is gone from the store
    const variant = o.variant_id ? variants.get(o.variant_id) : null
    const offer: StoreOffer = { id: o.id, huntId: o.hunt_id, sellerSpaceId: o.seller_space_id, productId: o.product_id, variantId: o.variant_id, benefitCode: o.benefit_code, requiresState: o.requires_state, status: o.status }
    const item = o.variant_id && !variant
      ? null
      : {
          productId: variant ? variant.product_id : product.id,
          variantId: variant ? variant.id : null,
          ownerSpaceId: product.owner_space_id,
          active: product.status === 'active' && (variant ? variant.active : true),
          inStock: inStock(variant ? variant.stock : product.stock),
        }
    const link = resolveStoreLink(offer, item)
    out.push({
      offerId: o.id,
      title: product.title,
      href: link.action === 'link' ? `/market/${encodeURIComponent(link.productId)}` : null,
      includesBenefit: o.benefit_code !== null,
    })
  }
  return out
}

type UnitState = 'pending_claim' | 'active' | 'suspended' | 'revoked' | 'consumed'

/**
 * Revoke `count` units of ONE order line, and nothing else on the order. `ref` is the canonical refund id,
 * so running it again with the same reference changes nothing. Unused units go first; a consumed unit is
 * touched only when no unused one is left, and then it opens a review case and keeps its service history.
 */
export async function revokeOrderLineUnits(
  input: Readonly<{ orderId: string; lineId: string; count: number; ref: string }>,
): Promise<{ ok: true; units: string[]; revoked: number; cases: number } | { ok: false; error: string }> {
  if (!huntSwitchOn('commerce')) return { ok: false, error: 'Hunt commerce is off.' }
  const ref = input.ref.trim()
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(ref) || !/^[0-9a-f-]{36}$/i.test(input.lineId)) return { ok: false, error: 'Give the refund reference from the payment provider.' }
  if (!Number.isInteger(input.count) || input.count < 1) return { ok: false, error: 'Give how many units were refunded.' }
  const { data, error } = await db().from('hunt_entitlements').select('unit_key, state').eq('source_type', 'store-order').eq('source_id', input.orderId).like('unit_key', `${input.lineId}:%`)
  if (error) return { ok: false, error: 'Could not read that order’s benefits. Try again.' }
  // One unit may carry several benefit codes: it counts as consumed when any was, and as revoked only when all are.
  const rank = (state: UnitState) => (state === 'consumed' ? 2 : state === 'revoked' ? 0 : 1)
  const byUnit = new Map<string, UnitState>()
  for (const r of (data as { unit_key: string; state: UnitState }[] | null) ?? []) {
    const seen = byUnit.get(r.unit_key)
    if (!seen || rank(r.state) > rank(seen)) byUnit.set(r.unit_key, r.state)
  }
  // A repeat of the same refund must not reach for the next unit. The database logs each revocation under
  // `refund:<ref>:<unit>`, so the units this reference already took are read back and counted first.
  const prefix = `refund:${ref}:`
  const { data: ev } = await db().from('hunt_entitlement_events').select('ref').eq('kind', 'revoked').like('ref', `${prefix}${input.lineId}:%`)
  const already = [...new Set(((ev as { ref: string }[] | null) ?? []).filter((e) => e.ref.startsWith(prefix)).map((e) => e.ref.slice(prefix.length)))].sort()
  if (already.length >= input.count) return { ok: true, units: already, revoked: 0, cases: 0 }
  const fresh = pickUnitsToRevoke([...byUnit].filter(([unitKey]) => !already.includes(unitKey)).map(([unitKey, state]) => ({ unitKey, state })), input.count - already.length)
  const picked = [...already, ...fresh].sort()
  if (picked.length === 0) return { ok: false, error: 'That line has no Hunt benefit left to revoke.' }
  if (picked.length < input.count) return { ok: false, error: `That line has only ${picked.length} unit${picked.length === 1 ? '' : 's'} with a Hunt benefit.` }
  try {
    const out = await applyReversal(huntRpc, { type: 'store-order', id: input.orderId }, decideReversal({ kind: 'refund_partial', ref, amountMinor: 0, currency: 'usd', unitKeys: picked }))
    return { ok: true, units: picked, revoked: out.revoked, cases: out.cases }
  } catch (err) {
    console.error(`[hunts-commerce] order ${input.orderId} unit refund failed`, err)
    return { ok: false, error: 'Could not record that refund. Try again.' }
  }
}
