import { Store, Tag, Gift, Hand, Search } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { listListings, LISTING_KINDS, type ListingKind } from '@/lib/marketplace'
import { UnderlineTabs } from '@/components/admin/underline-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { NewListingButton } from '@/components/studio/market/new-listing-button'
import { MarketGrid, type GridListing } from '@/components/market/market-grid'
import { MarketHero } from '@/components/marketplace/market-hero'
import { MarketSearchProvider, MarketSearchBar } from '@/components/marketplace/market-search'
import { MarketplaceColumnsProvider, MarketplaceColumns } from '@/components/marketplace/column-selector'
import { MarketplaceBar } from '@/components/marketplace/marketplace-bar'
import { MarketplaceGuide } from '@/components/marketplace/marketplace-guide'
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

export default async function ClassifiedsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams
  const activeKind = LISTING_KINDS.some((k) => k.key === kind) ? (kind as ListingKind) : null

  const { description, ctaLabel, ctaHref } = await resolvePageContent('/classifieds', CONTENT_FALLBACK)
  // One unfiltered read powers the stats; the grid filters to the active kind in-process. The hero
  // search bar filters the grid instantly on the client (MarketGrid reads the shared query).
  const [profileId, allListings] = await Promise.all([getMyProfileId(), listListings({})])
  const kindCount = (k: string) => allListings.filter((l) => l.kind === k).length
  const listings = allListings.filter((l) => (activeKind ? l.kind === activeKind : true))

  const grid: GridListing[] = listings.map((l) => ({
    id: l.id,
    title: l.title,
    kind: l.kind,
    description: l.description,
    neighborhood: l.neighborhood,
    city: l.city,
    images: l.images ?? [],
    latitude: l.latitude,
    longitude: l.longitude,
    author: l.author ? { display_name: l.author.display_name } : null,
  }))

  return (
    <MarketSearchProvider>
    <div className="space-y-6">
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

      {/* One compact bar under the hero: the area picker + this surface's headline stats (C1). */}
      <MarketplaceBar
        active="all"
        stats={[
          { label: 'Listings', value: allListings.length, icon: Tag },
          { label: 'Free', value: kindCount('free'), icon: Gift },
          { label: 'To lend', value: kindCount('lend'), icon: Hand },
          { label: 'Looking for', value: kindCount('request'), icon: Search },
        ]}
      />

      <MarketplaceHiddenBanner area="market" />

      <MarketplaceColumnsProvider>
        <MarketGrid
          listings={grid}
          filters={
            <UnderlineTabs
              activeHref={activeKind ? `/classifieds?kind=${activeKind}` : '/classifieds'}
              tabs={[
                { href: '/classifieds', label: 'All' },
                ...LISTING_KINDS.map((k) => ({ href: `/classifieds?kind=${k.key}`, label: k.label })),
              ]}
            />
          }
          columns={<MarketplaceColumns />}
          emptyState={
            <EmptyState
              icon={Store}
              title={activeKind ? 'Nothing here yet' : 'Classifieds is just getting started'}
              description={profileId ? 'Post the first listing. Offer something, give it away, or ask for what you need.' : 'Sign in to post and respond to listings.'}
            />
          }
        />
      </MarketplaceColumnsProvider>

      <MarketplaceGuide />
    </div>
    </MarketSearchProvider>
  )
}
