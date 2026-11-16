import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ShoppingBag, ShoppingCart } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { CartSellers } from '@/components/marketplace/cart-sellers'
import { getMyProfileId } from '@/lib/auth'
import { CartCheckout } from '@/components/marketplace/cart-checkout'
import { cartCheckoutEnabled } from '@/lib/commerce/cart-checkout-flag'
import { resolveIndexHero } from '@/lib/layout/index-hero'
import { cartEnabled } from '@/lib/commerce/cart-flag'
import { loadCartView } from '@/lib/commerce/cart-load'
import { sellerNames } from '@/lib/commerce/orders'

// Your cart (DEF-ETSY P5). Dark until COMMERCE_CART_ENABLED is set: the page answers 404, like any route that
// does not exist yet. It lists the saved lines with today's price read fresh from the product rows, says plainly
// what is no longer for sale, lays the lines out by seller and says what checkout will do, and changes only the saved lines. Paying for it sits behind its own switch, COMMERCE_CART_CHECKOUT_ENABLED.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your cart' }

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)

export default async function CartPage() {
  if (!cartEnabled()) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/cart')

  const hero = await resolveIndexHero('/cart')
  const view = await loadCartView(profileId)
  // Names are decoration: sellerNames answers an empty map on a failed read and each seller falls back to a plain label.
  const names = await sellerNames(view.checkout.sellers)
  const dropped = view.removed.length
  const reduced = view.reduced.length

  return (
    <IndexTemplate {...hero} title="Your cart" description="Saved from the Market. Prices are checked again when you pay.">
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
          <CartSellers view={view} names={names} />
          <div className="rounded-card border border-border bg-surface p-4">
            {view.totals.map((t) => (
              <div key={t.currency} className="flex items-center justify-between">
                <span className="text-body-sm font-semibold text-text">Subtotal</span>
                <span className="text-body-sm font-semibold text-text">{money(t.cents, t.currency)}</span>
              </div>
            ))}
            <p className="mt-2 text-body-sm text-subtle">Shipping and fees are added when you pay.</p>
            {cartCheckoutEnabled() && !view.checkout.blocked ? (
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
