import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for the Events index (PAGE-FRAMEWORK §5). See the note in
// app/(main)/circles/loading.tsx: the retired `px-4 py-8 max-w-2xl mx-auto` shell double-padded
// inside the app shell and painted a narrow column, while EventsSurface opens on the full-width
// MarketHero band. The skeleton now matches the destination.
function EventCardSkeleton() {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex gap-4">
        {/* Date block */}
        <div className="shrink-0 w-12 flex flex-col items-center gap-1">
          <Skeleton className="h-3 w-8 rounded" />
          <Skeleton className="h-6 w-8 rounded" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-36" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-3 w-20 rounded-pill" />
            <Skeleton className="h-3 w-16 rounded-pill" />
          </div>
        </div>
        <Skeleton className="h-8 w-16 rounded-lg shrink-0" />
      </div>
    </div>
  )
}

export default function EventsLoading() {
  return (
    <div>
      <Skeleton className="min-h-[15rem] w-full rounded-3xl sm:min-h-[24rem]" />
      <div className="mb-5 mt-4 border-b border-border sm:mb-6" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <EventCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
