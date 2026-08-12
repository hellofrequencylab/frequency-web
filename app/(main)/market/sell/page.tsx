import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Store, ArrowUpRight, Tag } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { getCallerProfile } from '@/lib/auth'
import { isPaid } from '@/lib/core/entitlement'
import { ProductSpark } from './product-spark'

// List a product in the Market (ADR-596). The seller ladder: free members trade in
// Classifieds, PAID members list products here (limited: one product at a time, no
// storefront), and Business Spaces get the full Shop. Creating a product lists it to browse
// right away; getting PAID needs a connected payout account + billing on.
//
// The form is now the Product SPARK (docs/STUDIO.md §0, ADR-986): two doors, the shared drop zone,
// and the fields PRODUCT_MANIFEST declares. The Spark brings its own centered column + heading, so
// this page renders it directly; the upgrade wall below still composes FocusTemplate.

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
              <h2 className="text-body font-bold text-text">Upgrade to sell</h2>
            </div>
            <p className="mb-4 text-body-sm text-muted">
              A paid membership lets you list products in the Market and take payment straight to
              your account. The platform fee stays low.
            </p>
            <Link href="/upgrade" className={buttonClasses('primary', 'md')}>
              See membership
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="mb-2 flex items-center gap-2">
              <Tag className="h-5 w-5 text-muted" aria-hidden />
              <h2 className="text-body font-bold text-text">Free to post in Classifieds</h2>
            </div>
            <p className="mb-4 text-body-sm text-muted">
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

  // The upgrade path to a full Shop rides on the Spark's first screen (its `aside`), where a seller is
  // still deciding how to start, rather than under a half-filled form.
  return <ProductSpark />
}
