import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for the Journal (PAGE-FRAMEWORK §5): the header over a single
// column of captured-moment skeletons grouped by day, so the page paints its shape while
// the entries stream in (no layout shift).
export default function JournalLoading() {
  return (
    <div>
      <div className="mb-4 space-y-2 sm:mb-5">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="mb-5 border-b border-border sm:mb-6" />
      <div className="max-w-2xl space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <Skeleton className="mb-3 h-3 w-24" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  )
}
