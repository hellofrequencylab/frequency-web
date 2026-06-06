import type { Metadata } from 'next'
import Link from 'next/link'
import { Store } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { listListings, LISTING_KINDS, type ListingKind } from '@/lib/marketplace'
import { IndexTemplate } from '@/components/templates/index-template'
import { EmptyState } from '@/components/ui/empty-state'
import { NewListingButton } from '@/components/studio/market/new-listing-button'
import { MarketGrid, type GridListing } from '@/components/market/market-grid'

export const metadata: Metadata = {
  title: 'Marketplace',
  description: 'Swap, give, lend, and find things with people near you — no fees, just neighbors.',
}
export const dynamic = 'force-dynamic'

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams
  const activeKind = LISTING_KINDS.some((k) => k.key === kind) ? (kind as ListingKind) : null
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
      title="Marketplace"
      description="Swap, give, lend, and find things with people near you. No fees, no in-app payment — just neighbors helping out. Arrange the handoff offline."
      action={profileId ? <NewListingButton /> : undefined}
    >
      {/* Kind filter */}
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/market" className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${!activeKind ? 'bg-primary text-on-primary' : 'bg-surface-elevated text-muted hover:text-text'}`}>All</Link>
        {LISTING_KINDS.map((k) => (
          <Link
            key={k.key}
            href={`/market?kind=${k.key}`}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${activeKind === k.key ? 'bg-primary text-on-primary' : 'bg-surface-elevated text-muted hover:text-text'}`}
          >
            {k.label}
          </Link>
        ))}
      </div>

      {grid.length === 0 ? (
        <EmptyState
          icon={Store}
          title={activeKind ? 'Nothing here yet' : 'The marketplace is just getting started'}
          description={profileId ? 'Post the first listing — offer something, give it away, or ask for what you need.' : 'Sign in to post and respond to listings.'}
        />
      ) : (
        <MarketGrid listings={grid} />
      )}
    </IndexTemplate>
  )
}
