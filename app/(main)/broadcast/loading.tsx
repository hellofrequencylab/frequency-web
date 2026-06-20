import { Skeleton } from '@/components/ui/skeleton'
import { SectionHeader } from '@/components/ui/section-header'

// Route-level loading UI for the Broadcast / Community dashboard (PAGE-FRAMEWORK
// §5). Mirrors the StreamTemplate header + the highlight hero, the at-a-glance
// line, and the two-column body (broadcasts left, happenings rail right), so the
// dashboard paints its real shape immediately while the aggregates stream (no
// layout shift).
function DispatchCardSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <Skeleton className="h-10 w-10 shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
    </div>
  )
}

export default function BroadcastLoading() {
  return (
    <div>
      {/* Header band (PageHeading: title + description + rule) */}
      <div className="mb-4 space-y-2 sm:mb-5">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="mb-5 border-b border-border sm:mb-6" />

      {/* Highlight hero */}
      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-border bg-surface p-5">
        <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
      </div>

      {/* At-a-glance line */}
      <Skeleton className="mb-6 h-4 w-full max-w-lg" />

      {/* Two-column body */}
      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <SectionHeader title="Latest broadcasts" />
          <div className="grid grid-cols-1 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <DispatchCardSkeleton key={i} />
            ))}
          </div>
        </div>

        <div className="w-full shrink-0 space-y-4 lg:w-72">
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  )
}
