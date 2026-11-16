// The persistent cart store (DEF-ETSY P5 slice 2). One row per buyer in commerce_carts holding the
// lines of lib/commerce/cart.ts. Like the other commerce modules it writes with the service role, so the
// CALLER must have established the profile id (a server action reads it from the session) and the
// COMMERCE_CART_ENABLED switch; this module trusts neither a profile id it did not get from them.
// Every read goes through parseCart, so a malformed stored row yields a clean cart, never a bad line.
// Server-only. It holds no price and no seller: checkout reads both fresh from the product rows.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { addLine, lineKey, mergeCarts, parseCart, removeLine, setQty, takeOutPaid, type Cart } from './cart'

// eslint-disable-next-line no-restricted-syntax -- commerce_carts is not in the generated types yet (ADR-246 exception)
const db = () => createAdminClient() as unknown as SupabaseClient

export async function loadCart(profileId: string): Promise<Cart> {
  const { data, error } = await db().from('commerce_carts').select('lines').eq('profile_id', profileId).maybeSingle()
  if (error) throw new Error(`[cart] load failed: ${error.message}`)
  return parseCart((data as { lines?: unknown } | null)?.lines)
}

async function saveCart(profileId: string, cart: Cart): Promise<void> {
  const { error } = await db()
    .from('commerce_carts')
    .upsert({ profile_id: profileId, lines: parseCart(cart), updated_at: new Date().toISOString() }, { onConflict: 'profile_id' })
  if (error) throw new Error(`[cart] save failed: ${error.message}`)
}

export async function addToStoredCart(
  profileId: string,
  line: { productId: string; variantId: string | null; qty: number },
): Promise<{ cart: Cart; refused?: 'cart-full' | 'invalid-qty' }> {
  const r = addLine(await loadCart(profileId), line)
  if (!r.refused) await saveCart(profileId, r.cart)
  return r
}

export async function setStoredQty(profileId: string, key: string, qty: number): Promise<Cart> {
  const cart = setQty(await loadCart(profileId), key, qty)
  await saveCart(profileId, cart)
  return cart
}

export async function removeFromStoredCart(profileId: string, key: string): Promise<Cart> {
  const cart = removeLine(await loadCart(profileId), key)
  await saveCart(profileId, cart)
  return cart
}

/** Fold a guest cart (read from the browser, untrusted) into the signed-in cart. */
export async function mergeGuestIntoStored(profileId: string, guestRaw: unknown): Promise<Cart> {
  const merged = mergeCarts(await loadCart(profileId), parseCart(guestRaw))
  await saveCart(profileId, merged)
  return merged
}

/** Empty the saved cart, after what was in it has been paid for. */
export async function clearStoredCart(profileId: string): Promise<void> {
  await saveCart(profileId, [])
}

const sameCart = (a: Cart, b: Cart) => a.length === b.length && a.every((l, i) => lineKey(l) === lineKey(b[i]) && l.qty === b[i].qty)

/** Save the cart as the buyer was just shown it: without the lines that are no longer for sale and with
 *  the rest lowered to stock. `read` is the cart the caller looked at and `pruned` what was left of it. The
 *  change is applied to the cart as it stands now, so a line added in between is kept and a line is only
 *  ever dropped or lowered, never put back or raised. Writes nothing when nothing changes. */
export async function savePrunedCart(profileId: string, read: Cart, pruned: Cart): Promise<void> {
  const looked = new Set(read.map(lineKey))
  const kept = new Map(pruned.map((l) => [lineKey(l), l.qty]))
  const now = await loadCart(profileId)
  const next: Cart = []
  for (const l of now) {
    const k = lineKey(l)
    if (!looked.has(k)) next.push(l)
    else if (kept.has(k)) next.push({ ...l, qty: Math.min(l.qty, kept.get(k)!) })
  }
  if (!sameCart(now, next)) await saveCart(profileId, next)
}

/** Take the lines of a paid order out of the buyer's saved cart. Writes nothing when the cart held none
 *  of them. The CALLER makes this happen once per order (it runs on the pending to paid flip), because
 *  taking the same quantity out twice would eat a line the buyer added afterwards. */
export async function takePaidOutOfStoredCart(
  profileId: string,
  paid: readonly { productId: string; variantId: string | null; qty: number }[],
): Promise<void> {
  const cart = await loadCart(profileId)
  const next = takeOutPaid(cart, paid)
  if (!sameCart(cart, next)) await saveCart(profileId, next)
}
