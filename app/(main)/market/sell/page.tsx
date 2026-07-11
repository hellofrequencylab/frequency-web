import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Store, ArrowUpRight, Tag } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { getCallerProfile } from '@/lib/auth'
import { isPaid } from '@/lib/core/entitlement'
import { SellForm } from './sell-form'

// List a product in the Market (ADR-596). The seller ladder: free members trade in
// Classifieds, PAID members list products here (limited: one product at a time, no
// storefront), and Business Spaces get the full Shop. Creating a product lists it to browse
// right away; getting PAID needs a connected payout account + billing on.

export const metadata = { title: 'List a product' }

export default async function MarketSellPage() {
  const profile = await getCallerProfile()
  if (!profile) redirect('/sign-in?next=/market/sell')

  // Free members trade in Classifieds; SELLING in the Market is a paid-member feature. The
  // member editor is deliberately thin, and selling is the first rung of the upgrade ladder.
  // Gate on the REAL (never beta-overridden) tier, per the creation-gate convention (auth.ts, ADR-414):
  // a genuinely free member still meets the "upgrade to sell" wall during beta, so the funnel fires.
  if (!isPaid(profile.realMembershipTier)) {
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
      <SellForm />

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
