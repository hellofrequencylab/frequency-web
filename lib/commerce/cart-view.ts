// What /cart shows for a saved cart (DEF-ETSY P5). PURE: the page reads the products and variants, this decides
// what is on sale right now, prices each line from the live rows, and adds the totals up per currency. The saved
// cart still holds no price, so nothing here is ever written back and nothing here is what a buyer is charged:
// checkout reads the same rows again.

import { effectiveVariantPriceCents, effectiveVariantStock } from './types'
import type { CommerceProduct, CommerceVariant } from './types'
import { lineKey, pruneCart, type Cart } from './cart'

interface CartViewLine {
  key: string
  productId: string
  variantId: string | null
  title: string
  variantName: string | null
  image: string | null
  qty: number
  /** The most the buyer can raise this line to; null when stock is not tracked. */
  max: number | null
  unitCents: number
  lineCents: number
  currency: string
}

interface CartView {
  lines: CartViewLine[]
  /** What the saved cart held that is no longer on sale, by line key, for a plain-words notice. */
  removed: string[]
  reduced: { key: string; from: number; to: number }[]
  totals: { currency: string; cents: number }[]
}

const ON_SALE: ReadonlySet<string> = new Set(['active'])

export function buildCartView(
  cart: Cart,
  products: ReadonlyMap<string, CommerceProduct>,
  variants: ReadonlyMap<string, CommerceVariant>,
): CartView {
  const available = new Map<string, { stock: number | null }>()
  for (const l of cart) {
    const p = products.get(l.productId)
    if (!p || !ON_SALE.has(p.status)) continue
    if (l.variantId) {
      const v = variants.get(l.variantId)
      if (!v || v.productId !== p.id || !v.active) continue
      available.set(lineKey(l), { stock: effectiveVariantStock(v) })
    } else {
      available.set(lineKey(l), { stock: p.stock })
    }
  }
  const { cart: pruned, report } = pruneCart(cart, available)
  const lines: CartViewLine[] = pruned.map((l) => {
    const p = products.get(l.productId)!
    const v = l.variantId ? variants.get(l.variantId) ?? null : null
    const unitCents = v ? effectiveVariantPriceCents(p, v) : p.priceCents
    return {
      key: lineKey(l),
      productId: l.productId,
      variantId: l.variantId,
      title: p.title,
      variantName: v?.name ?? null,
      image: p.images[0] ?? null,
      qty: l.qty,
      max: available.get(lineKey(l))?.stock ?? null,
      unitCents,
      lineCents: unitCents * l.qty,
      currency: p.currency,
    }
  })
  const byCurrency = new Map<string, number>()
  for (const l of lines) byCurrency.set(l.currency, (byCurrency.get(l.currency) ?? 0) + l.lineCents)
  return { lines, removed: report.removed, reduced: report.reduced, totals: [...byCurrency].map(([currency, cents]) => ({ currency, cents })) }
}
