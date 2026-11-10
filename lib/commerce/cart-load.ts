// Read a member's saved cart as it stands today (DEF-ETSY P5): the stored lines, the live product and variant
// rows behind them, and the pure view that prices and prunes them (./cart-view). Both /cart and checkout from
// the cart go through this one door, so the page a buyer reads and the lines they pay for cannot disagree.
// Server-only. Reads only; the caller has established the profile id from the session.

import { loadCart } from './cart-store'
import { buildCartView } from './cart-view'
import { getProduct } from './products'
import { getVariantsByIds } from './variants'
import type { CommerceProduct } from './types'

export async function loadCartView(profileId: string) {
  const cart = await loadCart(profileId)
  const ids = [...new Set(cart.map((l) => l.productId))]
  const [found, variants] = await Promise.all([
    Promise.all(ids.map((id) => getProduct(id))),
    getVariantsByIds(cart.flatMap((l) => (l.variantId ? [l.variantId] : []))),
  ])
  const products = new Map<string, CommerceProduct>()
  for (const p of found) if (p) products.set(p.id, p)
  return buildCartView(cart, products, variants)
}
