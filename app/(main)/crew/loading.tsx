import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for the Quest hub — dimension-matched to the real page so
// the first paint never shifts when the server component streams in. It mirrors the
// DashboardTemplate header, then the hero (Season Map + next step + primary action,
// the same h-64 / h-24 / h-12 stack QuestHero's own HeroSkeleton uses), then the
// two-column tasks / explore layout below.
export default function CrewLoading() {
  return (
    <div className="py-6">
      {/* Header — title + description band. */}
      <Skeleton className="mb-2 h-8 w-44" />
      <Skeleton className="mb-6 h-4 w-80 max-w-full" />

      {/* Hero: Season Map, one next step, one primary action. Matches HeroSkeleton. */}
      <div className="space-y-4">
        <Skeleton className="h-64 rounded-3xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-12 rounded-2xl" />
      </div>

      {/* Secondary: tasks (left) + explore / leaderboard (right). */}
      <div className="mt-6 flex flex-col items-start gap-6 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-4 w-16" />
          <div className="space-y-1.5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-start gap-3 rounded-2xl bg-surface-elevated/60 px-4 py-3">
                <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="mb-2 h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-8 shrink-0" />
              </div>
            ))}
          </div>
        </div>

        <div className="w-full shrink-0 space-y-3 lg:w-72">
          <Skeleton className="h-4 w-20" />
          <div className="grid grid-cols-2 gap-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
