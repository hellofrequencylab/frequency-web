// Read a member's saved cart as it stands today (DEF-ETSY P5): the stored lines, the live product and variant
// rows behind them, and the pure view that prices and prunes them (./cart-view). Both /cart and checkout from
// the cart go through this one door, so the page a buyer reads and the lines they pay for cannot disagree.
// When the view left a line out or lowered one, the saved cart is brought into line with it (P5 slice 5), so
// the buyer is told once and the stored cart is what they were told. The view still carries what changed.
// Server-only. The caller has established the profile id from the session.

import { loadCart, savePrunedCart } from './cart-store'
import { buildCartView } from './cart-view'
import { getProductsStrict } from './products'
import { getVariantsByIds } from './variants'

export async function loadCartView(profileId: string) {
  const cart = await loadCart(profileId)
  // STRICT reads: a line is dropped from the saved cart on what these return, so a failed read throws (the
  // page errors, checkout says "could not read your cart") instead of reading as "no longer for sale".
  const [products, variants] = await Promise.all([
    getProductsStrict(cart.map((l) => l.productId)),
    getVariantsByIds(cart.flatMap((l) => (l.variantId ? [l.variantId] : [])), { strict: true }),
  ])
  const view = buildCartView(cart, products, variants)
  if (view.removed.length > 0 || view.reduced.length > 0) {
    try {
      await savePrunedCart(profileId, cart, view.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty })))
    } catch (err) {
      // Never fatal: the view is already right and the next read prunes again. Loud, so a cart that keeps
      // failing to save shows in the logs instead of quietly re-telling the buyer on every visit.
      console.error('[cart] could not save the pruned cart', { profileId, err })
    }
  }
  return view
}
