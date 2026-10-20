import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for /nearby (PAGE-FRAMEWORK §5). Mirrors the page under the map: the
// Dispatch ticker strip, the four stat tiles, the events + circles row, and the Dispatch stream, so
// the dashboard paints its real shape immediately while the aggregates stream (no layout shift).
function DispatchCardSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-4 lift-1">
      <Skeleton className="h-10 w-10 shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
    </div>
  )
}

export default function NearbyLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <Skeleton className="h-12 w-full rounded-card" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[4.5rem] w-full rounded-card" />
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[4.75rem] w-full rounded-card" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-card" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <DispatchCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
