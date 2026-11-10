// THE CART MODEL (DEF-ETSY P5, docs/ETSY-GRADE-PLAN.md). PURE: a cart is a list of (product, variant, qty)
// and every operation returns a new list. It holds no price, no seller and no total, because a price saved
// in a cart goes stale and a seller saved in a cart can disagree with the product row. Prices and sellers
// are read fresh from the product rows at checkout, where ./funds-flow already decides how a cart of one or
// many sellers is paid. So this module never touches money and cannot change what a buyer is charged.
//
// RULES (each is a test):
//   • One line per product + variant. Adding the same item again raises its quantity.
//   • A quantity is a whole number from 1 to MAX_QTY_PER_LINE; setting it to 0 or less removes the line.
//   • A cart holds at most MAX_LINES lines; an add past that is refused, never silently dropped.
//   • A guest cart merges into a signed-in cart by summing matching lines (clamped), signed-in lines first.
//   • Pruning drops lines whose item is gone or sold out and clamps the rest to the stock on hand, and says
//     what it changed so the buyer is told rather than surprised at checkout.
//   • A cart read back from storage is untrusted: anything malformed is dropped, not repaired into a line.

export const MAX_QTY_PER_LINE = 99
export const MAX_LINES = 50

interface CartLine {
  productId: string
  /** null for a product with no variants. */
  variantId: string | null
  qty: number
}

export type Cart = CartLine[]

export const lineKey = (l: Pick<CartLine, 'productId' | 'variantId'>) => `${l.productId}:${l.variantId ?? ''}`

const clampQty = (n: number) => Math.min(MAX_QTY_PER_LINE, Math.max(0, Math.floor(n)))

export function addLine(cart: Cart, add: CartLine): { cart: Cart; refused?: 'cart-full' | 'invalid-qty' } {
  if (!Number.isFinite(add.qty) || add.qty < 1) return { cart, refused: 'invalid-qty' }
  const k = lineKey(add)
  const at = cart.findIndex((l) => lineKey(l) === k)
  if (at >= 0) {
    return { cart: cart.map((l, i) => (i === at ? { ...l, qty: clampQty(l.qty + add.qty) } : l)) }
  }
  if (cart.length >= MAX_LINES) return { cart, refused: 'cart-full' }
  return { cart: [...cart, { productId: add.productId, variantId: add.variantId, qty: clampQty(add.qty) }] }
}

export function setQty(cart: Cart, key: string, qty: number): Cart {
  const q = clampQty(qty)
  return q < 1 ? cart.filter((l) => lineKey(l) !== key) : cart.map((l) => (lineKey(l) === key ? { ...l, qty: q } : l))
}

export const removeLine = (cart: Cart, key: string): Cart => cart.filter((l) => lineKey(l) !== key)

/** Merge a guest cart into a signed-in cart. Signed-in lines keep their order; new guest lines follow. */
export function mergeCarts(member: Cart, guest: Cart): Cart {
  let out = member
  for (const g of guest) {
    const r = addLine(out, g)
    out = r.cart
  }
  return out
}

/** What is on sale right now, keyed by `lineKey`. `stock` null means untracked (no limit). */
type CartAvailability = Map<string, { stock: number | null }>

interface PruneReport {
  removed: string[]
  reduced: { key: string; from: number; to: number }[]
}

export function pruneCart(cart: Cart, available: CartAvailability): { cart: Cart; report: PruneReport } {
  const report: PruneReport = { removed: [], reduced: [] }
  const out: Cart = []
  for (const l of cart) {
    const k = lineKey(l)
    const a = available.get(k)
    if (!a || (a.stock !== null && a.stock < 1)) {
      report.removed.push(k)
      continue
    }
    const to = a.stock === null ? l.qty : Math.min(l.qty, a.stock)
    if (to < l.qty) report.reduced.push({ key: k, from: l.qty, to })
    out.push({ ...l, qty: to })
  }
  return { cart: out, report }
}

/** Read a cart back from storage. Anything that is not a well-formed line is dropped. */
export function parseCart(raw: unknown): Cart {
  if (!Array.isArray(raw)) return []
  let out: Cart = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const { productId, variantId, qty } = r as Record<string, unknown>
    if (typeof productId !== 'string' || productId.length === 0) continue
    if (variantId !== null && variantId !== undefined && typeof variantId !== 'string') continue
    if (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 1) continue
    out = addLine(out, { productId, variantId: (variantId as string | null | undefined) ?? null, qty }).cart
  }
  return out
}
