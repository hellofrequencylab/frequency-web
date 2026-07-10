import { Store } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { listListings, LISTING_KINDS, type ListingKind } from '@/lib/marketplace'
import { IndexTemplate } from '@/components/templates/index-template'
import { UnderlineTabs } from '@/components/admin/underline-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { NewListingButton } from '@/components/studio/market/new-listing-button'
import { MarketGrid, type GridListing } from '@/components/market/market-grid'
import { MarketplaceFacets } from '@/components/marketplace/facet-nav'
import { MarketplaceHiddenBanner } from '@/components/marketplace/hidden-banner'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'

// Coded defaults for the operator-editable header content (ADR-180).
const CONTENT_FALLBACK = {
  title: 'Classifieds',
  description: 'Swap, give, lend, and find things with people near you. No fees, no in-app payment, just neighbors helping out. Arrange the handoff offline.',
}

// Operator-set title/description also drive <title> + og/twitter cards (PX.2);
// the fallback strings are the page's previous static metadata, unchanged.
export function generateMetadata() {
  return pageContentMetadata('/classifieds', {
    title: 'Classifieds',
    description: 'Swap, give, lend, and find things with people near you. No fees, just neighbors.',
  })
}
export const dynamic = 'force-dynamic'

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams
  const activeKind = LISTING_KINDS.some((k) => k.key === kind) ? (kind as ListingKind) : null

  // Operator-editable page header (ADR-180) — falls back to the coded defaults.
  const { title, description, ctaLabel, ctaHref } = await resolvePageContent('/classifieds', CONTENT_FALLBACK)
  const [profileId, listings] = await Promise.all([
    getMyProfileId(),
    listListings({ kind: activeKind }),
  ])

  const grid: GridListing[] = listings.map((l) => ({
    id: l.id,
    title: l.title,
    kind: l.kind,
    price_note: l.price_note,
    description: l.description,
    neighborhood: l.neighborhood,
    city: l.city,
    images: l.images ?? [],
    latitude: l.latitude,
    longitude: l.longitude,
    author: l.author ? { display_name: l.author.display_name } : null,
  }))

  return (
    <IndexTemplate
      title={title}
      description={description}
      action={
        (profileId || (ctaLabel && ctaHref)) ? (
          <div className="flex items-center gap-2">
            {profileId && <NewListingButton />}
            {/* Operator-set CTA (PX.1) — shows only when both label + link are set. */}
            {ctaLabel && ctaHref && (
              <a
                href={ctaHref}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
              >
                {ctaLabel}
              </a>
            )}
          </div>
        ) : undefined
      }
      toolbar={
        <div className="space-y-3">
          <MarketplaceFacets active="all" />
          <UnderlineTabs
            activeHref={activeKind ? `/classifieds?kind=${activeKind}` : '/classifieds'}
            tabs={[
              { href: '/classifieds', label: 'All' },
              ...LISTING_KINDS.map((k) => ({ href: `/classifieds?kind=${k.key}`, label: k.label })),
            ]}
          />
        </div>
      }
    >
      <MarketplaceHiddenBanner area="market" />
      {grid.length === 0 ? (
        <EmptyState
          icon={Store}
          title={activeKind ? 'Nothing here yet' : 'Classifieds is just getting started'}
          description={profileId ? 'Post the first listing. Offer something, give it away, or ask for what you need.' : 'Sign in to post and respond to listings.'}
        />
      ) : (
        <MarketGrid listings={grid} />
      )}
    </IndexTemplate>
  )
}
