import { Skeleton } from '@/components/ui/skeleton'

// Route-load fallback for the cooperative leaderboard: the shared-goal band first,
// the standing band, then the control row + the stacked individual board, and the
// consistency layer (daily streak + weekly rhythms) beneath it.

function BoardRowSkeleton() {
  return (
    <div className="flex min-h-[3.25rem] items-center gap-3 rounded-2xl bg-surface-elevated/40 px-3 py-2">
      <Skeleton className="h-4 w-4 shrink-0" />
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-4 w-12 shrink-0" />
    </div>
  )
}

export default function LeaderboardLoading() {
  return (
    <div>
      {/* Page heading */}
      <div className="mb-6 space-y-1.5">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="space-y-6">
        {/* Collective goal band */}
        <Skeleton className="h-44 w-full rounded-3xl" />
        {/* Standing band */}
        <Skeleton className="h-48 w-full rounded-3xl" />

        {/* Controls + board */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-10 w-44 rounded-xl" />
            <Skeleton className="h-10 w-48 rounded-xl" />
          </div>
          <div className="space-y-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <BoardRowSkeleton key={i} />
            ))}
          </div>
        </div>

        {/* Consistency layer: daily practice streak hero + weekly rhythms */}
        <div className="space-y-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-56 w-full rounded-3xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <div className="space-y-4 pt-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
