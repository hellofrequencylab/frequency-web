import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for the Marketplace index (PAGE-FRAMEWORK §5). Mirrors
// the IndexTemplate header + the kind-filter tab row, the "Near me" control, and
// the three-up listing grid (image card + body), so the page paints its real
// shape immediately instead of flashing blank while listings stream (no shift).
function ListingCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <Skeleton className="h-36 w-full rounded-none" />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-16 rounded-full" />
          <Skeleton className="h-4 w-12" />
        </div>
        <Skeleton className="mt-2 h-4 w-36" />
        <Skeleton className="mt-2 h-4 w-full max-w-xs" />
        <Skeleton className="mt-3 h-3 w-28" />
      </div>
    </div>
  )
}

export default function MarketLoading() {
  return (
    <div>
      {/* Header band (PageHeading: title + description + rule) */}
      <div className="mb-4 space-y-2 sm:mb-5">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="mb-5 border-b border-border sm:mb-6" />

      {/* Kind-filter tab row */}
      <div className="mb-4 -mb-px flex gap-1 border-b border-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-t-lg" />
        ))}
      </div>

      {/* Near-me control */}
      <div className="mb-4 mt-4">
        <Skeleton className="h-8 w-28 rounded-full" />
      </div>

      {/* Listing grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
