import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Store, ArrowUpRight, Tag } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { getCallerProfile } from '@/lib/auth'
import { isPaid } from '@/lib/core/entitlement'
import { createMakerProductAction } from '../../marketplace/commerce-actions'

// List a product in the Market (ADR-593). The seller ladder: free members trade in
// Classifieds, PAID members list products here (limited: one product at a time, no
// storefront), and Business Spaces get the full Shop. Creating a product lists it to browse
// right away; getting PAID needs a connected payout account + billing on.

export const metadata = { title: 'List a product' }

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'
const LABEL = 'mb-1 block text-sm font-medium text-text'

export default async function MarketSellPage() {
  const profile = await getCallerProfile()
  if (!profile) redirect('/sign-in?next=/market/sell')

  // Free members trade in Classifieds; SELLING in the Market is a paid-member feature. The
  // member editor is deliberately thin, and selling is the first rung of the upgrade ladder.
  if (!isPaid(profile.membershipTier)) {
    return (
      <FocusTemplate
        title="Selling is a paid feature"
        description="Free members can trade, give, and lend in Classifieds. To sell a product in the Market, upgrade your membership."
        back={{ href: '/market', label: 'Market' }}
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-primary/30 bg-primary-bg/10 p-5">
            <div className="mb-2 flex items-center gap-2">
              <Store className="h-5 w-5 text-primary-strong" aria-hidden />
              <h2 className="text-base font-bold text-text">Upgrade to sell</h2>
            </div>
            <p className="mb-4 text-sm text-muted">
              A paid membership lets you list products in the Market and take payment straight to
              your account. The platform fee stays low.
            </p>
            <Link href="/upgrade" className={buttonClasses('primary', 'md')}>
              See membership
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="mb-2 flex items-center gap-2">
              <Tag className="h-5 w-5 text-muted" aria-hidden />
              <h2 className="text-base font-bold text-text">Free to post in Classifieds</h2>
            </div>
            <p className="mb-4 text-sm text-muted">
              Swap, give away, lend, or ask for something with people nearby. No fee, no checkout.
            </p>
            <Link href="/classifieds" className={buttonClasses('secondary', 'md')}>
              Go to Classifieds
            </Link>
          </div>
        </div>
      </FocusTemplate>
    )
  }

  return (
    <FocusTemplate
      title="List a product"
      description="List a product and it shows up in the Market right away. Set up payouts to start taking orders."
      back={{ href: '/market', label: 'Market' }}
    >
      <form action={createMakerProductAction} className="space-y-6">
        <div>
          <label htmlFor="title" className={LABEL}>
            What are you selling?
          </label>
          <input id="title" name="title" required maxLength={200} className={FIELD} placeholder="e.g. Hand-thrown ceramic mug" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="price" className={LABEL}>
              Price (USD)
            </label>
            <input id="price" name="price" type="number" min="0" step="0.01" inputMode="decimal" required className={FIELD} placeholder="e.g. 28" />
          </div>
          <div>
            <label htmlFor="category" className={LABEL}>
              Category (optional)
            </label>
            <input id="category" name="category" maxLength={60} className={FIELD} placeholder="e.g. Ceramics" />
          </div>
        </div>
        <div>
          <label htmlFor="description" className={LABEL}>
            Details
          </label>
          <textarea
            id="description"
            name="description"
            rows={5}
            maxLength={2000}
            className={FIELD}
            placeholder="Materials, size, how it's made, shipping or pickup."
          />
        </div>
        <p className="text-xs text-subtle">
          Payouts run on Stripe Connect, so the money goes straight to you. Set up a payout account
          before your first sale; the platform fee stays low.
        </p>
        <div className="flex justify-end">
          <button type="submit" className={buttonClasses('primary', 'md')}>
            List it
          </button>
        </div>
      </form>

      {/* Upgrade path: the member editor is thin on purpose. A Business Space unlocks the full Shop. */}
      <div className="mt-8 rounded-2xl border border-primary/30 bg-primary-bg/10 p-5">
        <div className="mb-2 flex items-center gap-2">
          <Store className="h-5 w-5 text-primary-strong" aria-hidden />
          <h2 className="text-base font-bold text-text">Want a full shop?</h2>
        </div>
        <p className="mb-4 text-sm text-muted">
          A Business Space gets a real storefront: products, bookable services, tickets, collections,
          and a lower fee. This member listing is the quick way to sell one thing.
        </p>
        <Link href="/spaces/new" className={buttonClasses('secondary', 'md')}>
          Start a Business Space
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </FocusTemplate>
  )
}
