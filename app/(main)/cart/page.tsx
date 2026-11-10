import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ShoppingBag, ShoppingCart } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { CartLineControls } from '@/components/marketplace/cart-line-controls'
import { getMyProfileId } from '@/lib/auth'
import { CartCheckout } from '@/components/marketplace/cart-checkout'
import { cartCheckoutEnabled } from '@/lib/commerce/cart-checkout-flag'
import { cartEnabled } from '@/lib/commerce/cart-flag'
import { loadCartView } from '@/lib/commerce/cart-load'

// Your cart (DEF-ETSY P5). Dark until COMMERCE_CART_ENABLED is set: the page answers 404, like any route that
// does not exist yet. It lists the saved lines with today's price read fresh from the product rows, says plainly
// what is no longer for sale, and changes only the saved lines. Paying for it sits behind its own switch, COMMERCE_CART_CHECKOUT_ENABLED.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your cart' }

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)

export default async function CartPage() {
  if (!cartEnabled()) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/cart')

  const view = await loadCartView(profileId)
  const dropped = view.removed.length
  const reduced = view.reduced.length

  return (
    <IndexTemplate title="Your cart" description="Saved from the Market. Prices are checked again when you pay.">
      {dropped > 0 || reduced > 0 ? (
        <div role="status" className="mb-4 rounded-card border border-border bg-surface-elevated px-4 py-3 text-body-sm text-muted">
          {dropped > 0 ? `${dropped === 1 ? 'One item is' : `${dropped} items are`} no longer for sale and left out. ` : ''}
          {reduced > 0 ? `${reduced === 1 ? 'One line was' : `${reduced} lines were`} lowered to what is in stock.` : ''}
        </div>
      ) : null}

      {view.lines.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          variant="first-use"
          title="Your cart is empty."
          description="Add something from the Market and it waits for you here."
          action={
            <Link href="/market" className={buttonClasses('primary', 'md')}>
              <ShoppingBag className="h-4 w-4" aria-hidden />
              Browse the Market
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          <ul className="space-y-3">
            {view.lines.map((l) => (
              <li key={l.key} data-cart-line={l.key} className="flex flex-wrap items-start justify-between gap-4 rounded-card border border-border bg-surface p-4 lift-1">
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
            ))}
          </ul>
          <div className="rounded-card border border-border bg-surface p-4">
            {view.totals.map((t) => (
              <div key={t.currency} className="flex items-center justify-between">
                <span className="text-body-sm font-semibold text-text">Subtotal</span>
                <span className="text-body-sm font-semibold text-text">{money(t.cents, t.currency)}</span>
              </div>
            ))}
            <p className="mt-2 text-body-sm text-subtle">Shipping and fees are added when you pay.</p>
            {cartCheckoutEnabled() ? (
              <div className="mt-4">
                <CartCheckout priceLabel={view.totals.length === 1 ? money(view.totals[0].cents, view.totals[0].currency) : undefined} />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </IndexTemplate>
  )
}
