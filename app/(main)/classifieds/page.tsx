import { Store, Tag, Gift, Hand, Search } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { listListings, LISTING_KINDS, type ListingKind } from '@/lib/marketplace'
import { UnderlineTabs } from '@/components/admin/underline-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { NewListingButton } from '@/components/studio/market/new-listing-button'
import { MarketGrid, type GridListing } from '@/components/market/market-grid'
import { MarketHero } from '@/components/marketplace/market-hero'
import { MarketSearchBar } from '@/components/marketplace/market-search-bar'
import { MarketplaceFacets } from '@/components/marketplace/facet-nav'
import { MarketplaceHiddenBanner } from '@/components/marketplace/hidden-banner'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'

// Classifieds (ADR-596) — the peer trade board (offer / free / lend / request), connect-only, no fees.
// Hero-led (the site PhotoHero grammar) + a stats band. Operator-editable header content (ADR-180).

const CONTENT_FALLBACK = {
  title: 'Classifieds',
  description: 'Swap, give, lend, and find things with people near you. No fees, no in-app payment, just neighbors helping out. Arrange the handoff offline.',
}

export function generateMetadata() {
  return pageContentMetadata('/classifieds', {
    title: 'Classifieds',
    description: 'Swap, give, lend, and find things with people near you. No fees, just neighbors.',
  })
}
export const dynamic = 'force-dynamic'

const HERO_IMAGE = 'https://picsum.photos/seed/frequency-classifieds/1600/600'

export default async function ClassifiedsPage({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string }> }) {
  const { kind, q } = await searchParams
  const activeKind = LISTING_KINDS.some((k) => k.key === kind) ? (kind as ListingKind) : null
  const query = (q ?? '').trim().toLowerCase()

  const { description, ctaLabel, ctaHref } = await resolvePageContent('/classifieds', CONTENT_FALLBACK)
  // One unfiltered read powers the stats; the grid filters to the active kind + the search query in-process.
  const [profileId, allListings] = await Promise.all([getMyProfileId(), listListings({})])
  const kindCount = (k: string) => allListings.filter((l) => l.kind === k).length
  const listings = allListings
    .filter((l) => (activeKind ? l.kind === activeKind : true))
    .filter((l) =>
      query ? `${l.title} ${l.description ?? ''}`.toLowerCase().includes(query) : true,
    )

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
    <div className="space-y-8">
      <MarketHero
        image={HERO_IMAGE}
        eyebrow="Classifieds"
        title="Swap, share, and find it local"
        subtitle={description}
        search={<MarketSearchBar placeholder="Search listings" />}
        action={
          profileId || (ctaLabel && ctaHref) ? (
            <>
              {profileId && <NewListingButton />}
              {ctaLabel && ctaHref && (
                <a
                  href={ctaHref}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
                >
                  {ctaLabel}
                </a>
              )}
            </>
          ) : undefined
        }
      />

      <MarketplaceHiddenBanner area="market" />

      <div className="space-y-6">
        <MarketplaceFacets active="all" />

        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
          <StatCard size="sm" label="Listings" value={allListings.length} icon={Tag} />
          <StatCard size="sm" label="Free" value={kindCount('free')} icon={Gift} />
          <StatCard size="sm" label="To lend" value={kindCount('lend')} icon={Hand} />
          <StatCard size="sm" label="Looking for" value={kindCount('request')} icon={Search} />
        </div>

        <UnderlineTabs
          activeHref={activeKind ? `/classifieds?kind=${activeKind}` : '/classifieds'}
          tabs={[
            { href: '/classifieds', label: 'All' },
            ...LISTING_KINDS.map((k) => ({ href: `/classifieds?kind=${k.key}`, label: k.label })),
          ]}
        />

        {grid.length === 0 ? (
          <EmptyState
            icon={Store}
            title={activeKind ? 'Nothing here yet' : 'Classifieds is just getting started'}
            description={profileId ? 'Post the first listing. Offer something, give it away, or ask for what you need.' : 'Sign in to post and respond to listings.'}
          />
        ) : (
          <MarketGrid listings={grid} />
        )}
      </div>
    </div>
  )
}
