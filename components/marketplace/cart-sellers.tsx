import Link from 'next/link'
import { CartLineControls } from '@/components/marketplace/cart-line-controls'
import type { CartBlock } from '@/lib/commerce/cart-plan'
import type { CartView, CartViewLine } from '@/lib/commerce/cart-view'

// The saved cart, laid out by who sells what (DEF-ETSY P5 slice 6, /cart). Each seller's lines sit under
// that seller's name with a subtotal, and the buyer is told before paying what checkout will do: that
// several sellers are paid in one go, that an address is asked for on the secure payment page, or that
// this cart cannot be paid as it stands and what to take out. Display only: the plan it reads
// (lib/commerce/cart-plan.ts) asks the same seams the checkout door asks, and the door still decides.

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)

/** The one sentence for a cart the door would refuse, said before the buyer presses anything. */
const CART_BLOCK_COPY: Record<CartBlock, string> = {
  mixed_currency:
    'These items are priced in different currencies, and a cart pays in one. Remove the items in one currency, check out, then come back for the rest.',
  store_with_others:
    'Frequency Store items check out on their own. Remove the Store items or the others, check out, then come back for the rest.',
  contact_only:
    'One seller here takes contact only. Open their listing to message them, and remove it from your cart to check out the rest.',
}

/** The name a seller is shown under: the Store, the looked-up name, or a plain fallback. */
function cartSellerName(
  seller: { kind: string; profileId: string | null; spaceId: string | null },
  names: ReadonlyMap<string, string>,
): string {
  if (seller.kind === 'platform') return 'Frequency Store'
  const name = names.get(seller.kind === 'space' ? `space:${seller.spaceId}` : `profile:${seller.profileId}`)
  return name ?? (seller.kind === 'space' ? 'A Space shop' : 'A member')
}

function Line({ l }: { l: CartViewLine }) {
  return (
    <li data-cart-line={l.key} className="flex flex-wrap items-start justify-between gap-4 rounded-card border border-border bg-surface p-4 lift-1">
      <div className="flex min-w-0 items-start gap-3">
        {l.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- storage URL already resolved by the catalog
          <img src={l.image} alt="" className="h-16 w-16 shrink-0 rounded-card object-cover" />
        ) : null}
        <div className="min-w-0">
          <Link href={`/market/${l.productId}`} className="text-body font-semibold text-text hover:underline">
            {l.title}
          </Link>
          {l.variantName ? <p className="text-body-sm text-muted">{l.variantName}</p> : null}
          <p className="text-body-sm text-subtle">{money(l.unitCents, l.currency)} each</p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <span className="text-body font-semibold text-text">{money(l.lineCents, l.currency)}</span>
        <CartLineControls lineKey={l.key} qty={l.qty} max={l.max} title={l.title} />
      </div>
    </li>
  )
}

export function CartSellers({ view, names }: { view: CartView; names: ReadonlyMap<string, string> }) {
  const byKey = new Map(view.lines.map((l) => [l.key, l]))
  const { sellers, blocked, needsShipping } = view.checkout
  const many = sellers.length > 1
  return (
    <div className="space-y-4">
      {blocked ? (
        <p role="status" data-cart-blocked={blocked} className="rounded-card border border-border bg-surface-elevated px-4 py-3 text-body-sm text-warning">
          {CART_BLOCK_COPY[blocked]}
        </p>
      ) : many ? (
        <p role="status" data-cart-sellers={sellers.length} className="rounded-card border border-border bg-surface-elevated px-4 py-3 text-body-sm text-muted">
          {sellers.length} sellers are in this cart. You pay once, and each seller sends their own items.
        </p>
      ) : null}
      {sellers.map((s) => (
        <section key={s.key} data-cart-seller={s.key} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-body-sm font-semibold text-text">Sold by {cartSellerName(s, names)}</h2>
            {many ? (
              <span className="text-body-sm text-muted">{s.totals.map((t) => money(t.cents, t.currency)).join(' + ')}</span>
            ) : null}
          </div>
          {s.contactOnly ? (
            <p className="text-body-sm text-subtle">Contact only. Message this seller to arrange payment and pickup.</p>
          ) : null}
          <ul className="space-y-3">
            {s.lineKeys.map((k) => {
              const l = byKey.get(k)
              return l ? <Line key={k} l={l} /> : null
            })}
          </ul>
        </section>
      ))}
      {needsShipping && !blocked ? (
        <p data-cart-shipping className="text-body-sm text-subtle">
          Something here ships. You enter your address on the secure payment page.
        </p>
      ) : null}
    </div>
  )
}
