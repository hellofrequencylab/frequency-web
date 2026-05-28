import { Skeleton } from '@/components/ui/skeleton'

export default function CrewLoading() {
  return (
    <div className="px-4 py-8 max-w-2xl mx-auto">
      <Skeleton className="h-7 w-44 mb-2" />
      <Skeleton className="h-4 w-64 mb-6" />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-white p-3">
            <Skeleton className="h-8 w-8 rounded-lg mb-2" />
            <Skeleton className="h-7 w-12 mb-1" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Tier progress */}
      <Skeleton className="h-28 w-full rounded-xl mb-8" />

      {/* Tasks */}
      <Skeleton className="h-4 w-16 mb-3" />
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-white px-4 py-3">
            <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-4 w-40 mb-2" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-8 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
