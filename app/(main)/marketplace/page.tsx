import { Suspense } from 'react'
import Link from 'next/link'
import { ShoppingBag, Plus } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { getMyProfileId } from '@/lib/auth'
import { listListings } from '@/lib/listings'
import { ListingCard } from '@/components/marketplace/listing-card'

// The Marketplace HUB (faceted). Index template + a facet toolbar linking the areas
// (All / Housing / Makers / Shop). The "All" grid is connect-only General goods.
// Composed, not authored (PAGE-FRAMEWORK); the grid streams behind <Suspense>.

export const metadata = {
  title: 'Marketplace',
  description:
    'Buy, sell, and trade with the people in your community. Find housing, local makers, and the Frequency shop.',
}

const FACETS = [
  { href: '/marketplace', label: 'All' },
  { href: '/marketplace/housing', label: 'Housing' },
  { href: '/marketplace/makers', label: 'Makers' },
  { href: '/shop', label: 'Shop' },
]

function MarketToolbar() {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Marketplace areas">
      {FACETS.map((f) => (
        <Link key={f.href} href={f.href} className={buttonClasses('ghost', 'sm')}>
          {f.label}
        </Link>
      ))}
    </nav>
  )
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-40 rounded-2xl" />
      ))}
    </div>
  )
}

async function MarketGrid({ q }: { q?: string }) {
  const listings = await listListings({ vertical: 'market', q })
  if (listings.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        variant="first-use"
        title="Nothing listed yet."
        description="Be the first to list something for your community. Post an item, lend a tool, or give something away."
      />
    )
  }
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
        {listings.map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
      </div>
    </div>
  )
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const viewerProfileId = await getMyProfileId()
  return (
    <IndexTemplate
      title="Marketplace"
      description="Buy, sell, lend, and give with the people around you. No fees, no hassle. You just connect."
      action={
        viewerProfileId ? (
          <Link href="/marketplace/new" className={buttonClasses('primary', 'md')}>
            <Plus className="h-4 w-4" aria-hidden />
            Post a listing
          </Link>
        ) : undefined
      }
      toolbar={<MarketToolbar />}
    >
      <Suspense key={q ?? ''} fallback={<GridSkeleton />}>
        <MarketGrid q={q} />
      </Suspense>
    </IndexTemplate>
  )
}
