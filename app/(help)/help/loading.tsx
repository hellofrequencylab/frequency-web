import { Skeleton } from '@/components/ui/skeleton'

// Loading skeleton for the Help Center home. Mirrors the header + the
// two-column grid of category cards.
function CategoryCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-5">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-2 h-4 w-56 max-w-full" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-44 max-w-full" />
        ))}
      </div>
    </div>
  )
}

export default function HelpLoading() {
  return (
    <div>
      <div className="mb-10 space-y-3">
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-6 w-full max-w-xl" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <CategoryCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
