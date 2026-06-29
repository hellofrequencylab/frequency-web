import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for the People directory (PAGE-FRAMEWORK §5): the index header
// over a responsive grid of person-card skeletons, so the page paints its real shape
// instead of flashing blank while the module-driven body streams (no layout shift).
function PersonCardSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full max-w-xs" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  )
}

export default function PeopleLoading() {
  return (
    <div>
      <div className="mb-4 space-y-2 sm:mb-5">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="mb-5 border-b border-border sm:mb-6" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <PersonCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
