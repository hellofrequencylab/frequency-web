import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for the Library index (PAGE-FRAMEWORK §5). Mirrors the
// IndexTemplate header + the type-filter tab row, then the three-up card grid, so
// the page paints its real shape immediately instead of flashing blank while the
// ranked library streams (no layout shift).
function LibraryCardSkeleton() {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-4 w-8" />
      </div>
      <Skeleton className="mt-3 h-5 w-44" />
      <Skeleton className="mt-2 h-4 w-full max-w-xs" />
      <div className="mt-3 flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="mt-6 flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-7 w-16 rounded-lg" />
      </div>
    </div>
  )
}

export default function LibraryLoading() {
  return (
    <div>
      {/* Header band (PageHeading: title + description + rule) */}
      <div className="mb-4 space-y-2 sm:mb-5">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="mb-5 border-b border-border sm:mb-6" />

      {/* Type-filter tab row */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <div className="-mb-px flex gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-20 rounded-t-lg" />
          ))}
        </div>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <LibraryCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
