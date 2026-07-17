import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading skeleton for the Frequency Store. The page awaits the full catalog before
// first paint; this renders instantly during that await (hero + a product grid) so the store never
// opens on a blank screen. Mirrors the hero-led ProductCard grid layout.
function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  )
}

export default function StoreLoading() {
  return (
    <div>
      <Skeleton className="h-48 w-full rounded-none sm:h-60" />
      <div className="mx-auto max-w-6xl px-4 py-6">
        <Skeleton className="mb-6 h-10 w-full max-w-md rounded-xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
