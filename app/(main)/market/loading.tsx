import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading skeleton for the Marketplace. The page awaits several reads (listings, hero,
// facets) before first paint; this renders instantly during those awaits (hero + a listing grid) so
// the marketplace never opens on a blank screen. Mirrors the hero-led listing-card grid.
function ListingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex items-center justify-between pt-1">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
    </div>
  )
}

export default function MarketLoading() {
  return (
    <div>
      <Skeleton className="h-48 w-full rounded-none sm:h-60" />
      <div className="mx-auto max-w-6xl px-4 py-6">
        <Skeleton className="mb-6 h-10 w-full max-w-md rounded-xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
