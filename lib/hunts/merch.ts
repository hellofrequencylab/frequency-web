/**
 * Approved store items (FH-038, docs/hunts/STORE-ITEMS.md).
 *
 * The store owns the sale and fulfillment. A Hunt may LINK to an approved item, or recognize a benefit
 * that was explicitly bound to an order line. A link or a product impression creates no entitlement.
 * Pure planning here; the benefit itself is written by the same idempotent `hunt_entitlement_project`
 * that tickets use, so an order retry never duplicates one.
 */
import { BENEFIT_CODE } from './pass-binding'
import { unitSemanticKey, type ProjectionUnit } from './entitlements'

export type StoreOffer = Readonly<{
  id: string
  huntId: string
  sellerSpaceId: string
  productId: string
  variantId: string | null
  /** null for a plain link: the Hunt sends the player to the item and recognizes nothing. */
  benefitCode: string | null
  requiresState: 'paid' | 'fulfilled'
  status: 'approved' | 'withdrawn'
}>

/** What the canonical store says about the item the offer points at. */
type CanonicalItem = Readonly<{
  productId: string
  variantId: string | null
  ownerSpaceId: string | null
  active: boolean
  inStock: boolean
}>

type LinkAction =
  | { action: 'link'; productId: string; variantId: string | null }
  | { action: 'unavailable'; reason: 'withdrawn' | 'not_found' | 'seller_mismatch' | 'sku_mismatch' | 'inactive' | 'sold_out' }

/**
 * May the Hunt show a purchase action for this offer? The seller and exact SKU are resolved server-side. An
 * unavailable item removes the purchase action and says why; it never falls through to another item.
 */
export function resolveStoreLink(offer: StoreOffer, item: CanonicalItem | null): LinkAction {
  if (offer.status !== 'approved') return { action: 'unavailable', reason: 'withdrawn' }
  if (!item) return { action: 'unavailable', reason: 'not_found' }
  if (item.ownerSpaceId !== offer.sellerSpaceId) return { action: 'unavailable', reason: 'seller_mismatch' }
  if (item.productId !== offer.productId || item.variantId !== offer.variantId) return { action: 'unavailable', reason: 'sku_mismatch' }
  if (!item.active) return { action: 'unavailable', reason: 'inactive' }
  if (!item.inStock) return { action: 'unavailable', reason: 'sold_out' }
  return { action: 'link', productId: item.productId, variantId: item.variantId }
}

export type OrderLine = Readonly<{ id: string; productId: string | null; variantId: string | null; qty: number }>

export type OrderSource = Readonly<{
  kind: 'store-order'
  id: string
  status: 'pending' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded' | 'failed'
  ownerSpaceId: string | null
  buyerProfileId: string | null
  lines: readonly OrderLine[]
}>

type OrderPlan =
  | { ok: true; units: readonly ProjectionUnit[]; skipped: readonly Readonly<{ lineId: string; reason: 'no_bound_offer' | 'seller_mismatch' | 'sku_mismatch' }>[] }
  | { ok: false; disposition: 'pending' | 'refused'; reason: string }

const REACHED: Record<StoreOffer['requiresState'], readonly OrderSource['status'][]> = {
  paid: ['paid', 'fulfilled'],
  fulfilled: ['fulfilled'],
}

/**
 * One entitlement per unit of a bound line, and nothing for an ordinary line on a mixed order. A paid
 * order status alone never proves which item qualifies: each line must match an approved offer on the
 * exact product and variant, sold by the offer's seller.
 */
export function planOrderProjection(order: OrderSource, offers: readonly StoreOffer[]): OrderPlan {
  if (order.status === 'pending') return { ok: false, disposition: 'pending', reason: 'payment_not_settled' }
  if (order.status !== 'paid' && order.status !== 'fulfilled') return { ok: false, disposition: 'refused', reason: order.status }

  const units: ProjectionUnit[] = []
  const skipped: { lineId: string; reason: 'no_bound_offer' | 'seller_mismatch' | 'sku_mismatch' }[] = []

  for (const line of order.lines) {
    const candidates = offers.filter((o) => o.status === 'approved' && o.benefitCode !== null && o.productId === line.productId)
    if (candidates.length === 0) {
      skipped.push({ lineId: line.id, reason: 'no_bound_offer' })
      continue
    }
    const exact = candidates.find((o) => o.variantId === line.variantId)
    if (!exact) {
      skipped.push({ lineId: line.id, reason: 'sku_mismatch' })
      continue
    }
    if (exact.sellerSpaceId !== order.ownerSpaceId) {
      skipped.push({ lineId: line.id, reason: 'seller_mismatch' })
      continue
    }
    // The offer decides when the benefit opens: after payment, or only after fulfillment.
    if (!REACHED[exact.requiresState].includes(order.status)) continue
    if (!exact.benefitCode || !BENEFIT_CODE.test(exact.benefitCode)) continue
    if (!Number.isInteger(line.qty) || line.qty < 1) continue

    for (let n = 1; n <= line.qty; n++) {
      const unitKey = `${line.id}:${n}`
      units.push({
        huntId: exact.huntId,
        bindingId: null,
        offerId: exact.id,
        bindingRevision: 1,
        sourceType: 'store-order',
        sourceId: order.id,
        unitKey,
        benefitCode: exact.benefitCode,
        sellerSpaceId: exact.sellerSpaceId,
        profileId: order.buyerProfileId,
        sourceSeq: 1,
        semanticKey: unitSemanticKey(exact.huntId, order.id, unitKey, exact.benefitCode),
      })
    }
  }
  return { ok: true, units, skipped }
}
