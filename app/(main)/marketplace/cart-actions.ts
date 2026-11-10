'use server'

import { getMyProfileId } from '@/lib/auth'
import { rateLimitOk } from '@/lib/rate-limit'
import { cartEnabled } from '@/lib/commerce/cart-flag'
import { addToStoredCart, clearStoredCart, loadCart, mergeGuestIntoStored, removeFromStoredCart, setStoredQty } from '@/lib/commerce/cart-store'
import { cartCheckoutEnabled } from '@/lib/commerce/cart-checkout-flag'
import { loadCartView } from '@/lib/commerce/cart-load'
import { createCommerceCheckout } from '@/lib/commerce/checkout'
import { onPageCheckoutAvailable } from '@/lib/billing/stripe-browser'
import type { Cart } from '@/lib/commerce/cart'

// The persistent cart's server actions (DEF-ETSY P5). Dark until COMMERCE_CART_ENABLED is set: every
// action answers 'off' and touches nothing. The profile always comes from the session, never an argument.
export type CartResult = { ok: true; cart: Cart } | { ok: false; error: 'off' | 'signed-out' | 'slow-down' | 'cart-full' | 'invalid-qty' | 'failed' }

async function guarded(run: (profileId: string) => Promise<CartResult>): Promise<CartResult> {
  if (!cartEnabled()) return { ok: false, error: 'off' }
  const profileId = await getMyProfileId()
  if (!profileId) return { ok: false, error: 'signed-out' }
  if (!(await rateLimitOk('cart', profileId, 60, '1 m', { whenUnconfigured: 'allow' }))) return { ok: false, error: 'slow-down' }
  try {
    return await run(profileId)
  } catch {
    return { ok: false, error: 'failed' }
  }
}

// authz-ok: signed-in own-cart only. guarded() reads the profile from the session (never an argument), refuses signed-out callers and the dark switch, and every read and write is scoped to that profile id.
export async function getCartAction(): Promise<CartResult> {
  return guarded(async (p) => ({ ok: true, cart: await loadCart(p) }))
}

// authz-ok: signed-in own-cart only. guarded() reads the profile from the session (never an argument), refuses signed-out callers and the dark switch, and every read and write is scoped to that profile id.
export async function addToCartAction(productId: string, variantId: string | null, qty = 1): Promise<CartResult> {
  return guarded(async (p) => {
    const r = await addToStoredCart(p, { productId: String(productId), variantId: variantId ? String(variantId) : null, qty: Number(qty) })
    return r.refused ? { ok: false, error: r.refused } : { ok: true, cart: r.cart }
  })
}

// authz-ok: signed-in own-cart only. guarded() reads the profile from the session (never an argument), refuses signed-out callers and the dark switch, and every read and write is scoped to that profile id.
export async function setCartQtyAction(lineKey: string, qty: number): Promise<CartResult> {
  return guarded(async (p) => ({ ok: true, cart: await setStoredQty(p, String(lineKey), Number(qty)) }))
}

// authz-ok: signed-in own-cart only. guarded() reads the profile from the session (never an argument), refuses signed-out callers and the dark switch, and every read and write is scoped to that profile id.
export async function removeFromCartAction(lineKey: string): Promise<CartResult> {
  return guarded(async (p) => ({ ok: true, cart: await removeFromStoredCart(p, String(lineKey)) }))
}

// authz-ok: signed-in own-cart only. guarded() reads the profile from the session (never an argument), refuses signed-out callers and the dark switch, and every read and write is scoped to that profile id.
export async function mergeGuestCartAction(guestLines: unknown): Promise<CartResult> {
  return guarded(async (p) => ({ ok: true, cart: await mergeGuestIntoStored(p, guestLines) }))
}

export type CartCheckoutResult =
  | { clientSecret: string; sessionId?: string; url?: undefined; error?: undefined }
  | { url: string; clientSecret?: undefined; sessionId?: undefined; error?: undefined }
  | { error: string; clientSecret?: undefined; url?: undefined; sessionId?: undefined }

// Pay for the saved cart (DEF-ETSY P5). Dark until COMMERCE_CART_CHECKOUT_ENABLED is set on top of the cart
// switch. The lines come from the stored cart and are priced and pruned from the live rows (loadCartView), so
// what is charged is what /cart showed; the buyer is the session profile, never an argument; the one place
// that validates stock, options, sellers, currency and funds flow is createCommerceCheckout, unchanged. The
// cart is not emptied here: a buyer who closes the card form keeps it, and it is cleared after payment.
// authz-ok: signed-in own-cart only. The profile comes from the session (never an argument), the dark switch and signed-out callers are refused, and createCommerceCheckout re-validates every line.
export async function startCartCheckoutAction(opts?: { forceHosted?: boolean }): Promise<CartCheckoutResult> {
  if (!cartCheckoutEnabled()) return { error: 'Checkout from your cart is not open yet.' }
  const profileId = await getMyProfileId()
  if (!profileId) return { error: 'Sign in to check out.' }
  if (!(await rateLimitOk('cart_checkout', profileId, 10, '10 m'))) return { error: 'Easy there. Try again in a moment.' }
  let view
  try {
    view = await loadCartView(profileId)
  } catch {
    return { error: 'Could not read your cart. Try again.' }
  }
  if (view.lines.length === 0) return { error: 'Your cart is empty.' }
  const r = await createCommerceCheckout({
    buyerProfileId: profileId,
    items: view.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty })),
    ui: opts?.forceHosted ? 'hosted' : onPageCheckoutAvailable() ? 'elements' : 'hosted',
  })
  if (r.error) return { error: r.error }
  if (r.clientSecret) return { clientSecret: r.clientSecret, sessionId: r.sessionId }
  if (r.url) return { url: r.url }
  return { error: 'Could not start checkout. Please try again.' }
}

// Empty the cart once its contents are paid for. Called by the card form's success handler.
// authz-ok: signed-in own-cart only. guarded() reads the profile from the session (never an argument), refuses signed-out callers and the dark switch, and only that profile's cart is emptied.
export async function clearCartAction(): Promise<CartResult> {
  return guarded(async (p) => {
    await clearStoredCart(p)
    return { ok: true, cart: [] }
  })
}
