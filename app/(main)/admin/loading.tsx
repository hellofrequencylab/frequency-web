import { Skeleton } from '@/components/ui/skeleton'

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-14" />
    </div>
  )
}

function SectionSkeleton({ cols = 4, rows = 1 }: { cols?: number; rows?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-28" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`grid gap-3 grid-cols-2 sm:grid-cols-${cols}`}>
          {Array.from({ length: cols }).map((_, j) => (
            <StatCardSkeleton key={j} />
          ))}
        </div>
      ))}
    </div>
  )
}

export default function AdminLoading() {
  return (
    <div className="px-4 py-8 max-w-5xl mx-auto space-y-8">
      {/* Page heading */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* At a glance — 4 stat cards */}
      <SectionSkeleton cols={4} />

      {/* North Star — 3 stat cards */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      </div>

      {/* Jump to — launchpad grid */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-20" />
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface p-4 space-y-2">
              <Skeleton className="h-5 w-5 rounded-md" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
