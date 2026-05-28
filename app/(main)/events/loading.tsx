import { Skeleton } from '@/components/ui/skeleton'

function EventCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
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
            <Skeleton className="h-3 w-20 rounded-full" />
            <Skeleton className="h-3 w-16 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-8 w-16 rounded-lg shrink-0" />
      </div>
    </div>
  )
}

export default function EventsLoading() {
  return (
    <div className="px-4 py-8 max-w-2xl mx-auto">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <EventCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
