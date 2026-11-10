'use server'

import { getMyProfileId } from '@/lib/auth'
import { rateLimitOk } from '@/lib/rate-limit'
import { cartEnabled } from '@/lib/commerce/cart-flag'
import { addToStoredCart, loadCart, mergeGuestIntoStored, removeFromStoredCart, setStoredQty } from '@/lib/commerce/cart-store'
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
export const getCartAction = () => guarded(async (p) => ({ ok: true, cart: await loadCart(p) }))

// authz-ok: signed-in own-cart only. guarded() reads the profile from the session (never an argument), refuses signed-out callers and the dark switch, and every read and write is scoped to that profile id.
export const addToCartAction = (productId: string, variantId: string | null, qty = 1) =>
  guarded(async (p) => {
    const r = await addToStoredCart(p, { productId: String(productId), variantId: variantId ? String(variantId) : null, qty: Number(qty) })
    return r.refused ? { ok: false, error: r.refused } : { ok: true, cart: r.cart }
  })

// authz-ok: signed-in own-cart only. guarded() reads the profile from the session (never an argument), refuses signed-out callers and the dark switch, and every read and write is scoped to that profile id.
export const setCartQtyAction = (lineKey: string, qty: number) =>
  guarded(async (p) => ({ ok: true, cart: await setStoredQty(p, String(lineKey), Number(qty)) }))

// authz-ok: signed-in own-cart only. guarded() reads the profile from the session (never an argument), refuses signed-out callers and the dark switch, and every read and write is scoped to that profile id.
export const removeFromCartAction = (lineKey: string) =>
  guarded(async (p) => ({ ok: true, cart: await removeFromStoredCart(p, String(lineKey)) }))

// authz-ok: signed-in own-cart only. guarded() reads the profile from the session (never an argument), refuses signed-out callers and the dark switch, and every read and write is scoped to that profile id.
export const mergeGuestCartAction = (guestLines: unknown) => guarded(async (p) => ({ ok: true, cart: await mergeGuestIntoStored(p, guestLines) }))
