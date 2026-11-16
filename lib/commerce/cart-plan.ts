// What checkout will do with a cart, told before the buyer pays (DEF-ETSY P5 slice 6). PURE: it reads the
// priced lines it is handed and answers who sells what, whether an address will be asked for, and whether the
// checkout door would refuse the cart outright. It asks the SAME seams the door asks (./funds-flow
// planFundsFlow for one currency and the Store-on-its-own rule, ./selling canTakePayments for a contact-only
// seller, ./shipping cartNeedsShipping for the address), so /cart cannot promise a checkout the door refuses.
// It moves no money and decides nothing the door does not decide again.
//
// WHAT IT CANNOT SEE: a seller's plan gate and Stripe readiness need a read, so the door can still refuse a
// cart this calls payable. That refusal keeps its own sentence at the door.

import { planFundsFlow, sellerKey } from './funds-flow'
import { canTakePayments } from './selling'
import { cartNeedsShipping } from './shipping'
import type { CommerceProduct } from './types'

/** Why the door would refuse this cart as it stands. */
export type CartBlock = 'mixed_currency' | 'store_with_others' | 'contact_only'

export interface CartSeller {
  /** The door's own seller identity (funds-flow sellerKey). */
  key: string
  kind: CommerceProduct['ownerKind']
  profileId: string | null
  spaceId: string | null
  /** This seller's lines, by cart line key, in cart order. */
  lineKeys: string[]
  totals: { currency: string; cents: number }[]
  /** True when this seller cannot take in-app payment: the buyer messages them instead. */
  contactOnly: boolean
}

export interface CartCheckoutPlan {
  /** In first-appearance order, the order the door pays them in. */
  sellers: CartSeller[]
  /** True when any line ships, so checkout asks for an address on the secure payment page. */
  needsShipping: boolean
  blocked: CartBlock | null
}

export interface CartPlanLine {
  key: string
  product: Pick<CommerceProduct, 'ownerKind' | 'ownerProfileId' | 'ownerSpaceId' | 'productKind' | 'currency'>
  qty: number
  unitCents: number
}

export function planCartCheckout(lines: readonly CartPlanLine[]): CartCheckoutPlan {
  const sellers: CartSeller[] = []
  const byKey = new Map<string, CartSeller>()
  const flowLines = lines.map((l) => ({
    seller: { owner_kind: l.product.ownerKind, owner_profile_id: l.product.ownerProfileId, owner_space_id: l.product.ownerSpaceId },
    currency: l.product.currency || 'usd',
    qty: l.qty,
    unitCents: l.unitCents,
  }))
  lines.forEach((l, i) => {
    const key = sellerKey(flowLines[i].seller)
    let s = byKey.get(key)
    if (!s) {
      s = {
        key,
        kind: l.product.ownerKind,
        profileId: l.product.ownerProfileId,
        spaceId: l.product.ownerSpaceId,
        lineKeys: [],
        totals: [],
        contactOnly: !canTakePayments(l.product.ownerKind),
      }
      byKey.set(key, s)
      sellers.push(s)
    }
    s.lineKeys.push(l.key)
    const currency = flowLines[i].currency.toLowerCase()
    const cents = l.unitCents * l.qty
    const t = s.totals.find((x) => x.currency === currency)
    if (t) t.cents += cents
    else s.totals.push({ currency, cents })
  })

  let blocked: CartBlock | null = null
  if (lines.length > 0) {
    const plan = planFundsFlow(flowLines)
    if ('refused' in plan) {
      if (plan.refused === 'mixed_currency' || plan.refused === 'store_with_others') blocked = plan.refused
    } else if (sellers.some((s) => s.contactOnly)) {
      blocked = 'contact_only'
    }
  }
  return { sellers, needsShipping: lines.length > 0 && cartNeedsShipping(lines.map((l) => l.product.productKind)), blocked }
}
