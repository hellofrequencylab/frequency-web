import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for the Practices index (PAGE-FRAMEWORK §5). Mirrors the
// IndexTemplate header + the search / sort toolbar, then a card grid standing in
// for the module-driven library, so the page paints its real shape immediately
// instead of flashing blank while the modules stream (no layout shift).
function PracticeCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-4 w-10" />
      </div>
      <Skeleton className="mt-3 h-5 w-40" />
      <Skeleton className="mt-2 h-4 w-full max-w-xs" />
      <div className="mt-4 flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  )
}

export default function PracticesLoading() {
  return (
    <div>
      {/* Header band (PageHeading: title + description + admin-bar rule) */}
      <div className="mb-4 space-y-2 sm:mb-5">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="mb-5 border-b border-border sm:mb-6" />

      {/* Search + sort toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 w-full rounded-lg sm:max-w-xs" />
        <div className="flex flex-wrap items-center gap-1.5">
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-16 rounded-full" />
        </div>
      </div>

      {/* Library card grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <PracticeCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
