import { Skeleton } from '@/components/ui/skeleton'

function LeaderboardRowSkeleton({ rank }: { rank: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      {/* Rank number */}
      <span className="w-6 shrink-0 text-center">
        <Skeleton className="h-4 w-4 mx-auto" />
      </span>
      {/* Avatar */}
      <Skeleton className="w-9 h-9 rounded-full shrink-0" />
      {/* Name + handle */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
      {/* Rank badge */}
      <Skeleton className="h-5 w-16 rounded-full shrink-0" />
      {/* Score */}
      <Skeleton className="h-4 w-12 shrink-0" />
    </div>
  )
}

export default function LeaderboardLoading() {
  return (
    <div className="px-4 py-8 max-w-2xl mx-auto">
      {/* Page heading */}
      <div className="mb-4 space-y-1.5">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-4 w-52" />
      </div>

      {/* Scope tabs */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>

      {/* Leaderboard rows */}
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <LeaderboardRowSkeleton key={i} rank={i + 1} />
        ))}
      </div>
    </div>
  )
}
