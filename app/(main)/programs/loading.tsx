import { Skeleton } from '@/components/ui/skeleton'

// Loading skeleton for the Programs index. Mirrors the IndexTemplate header +
// the program card list so the page doesn't pop in.
function ProgramRowSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-elevated p-4">
      <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-full max-w-md" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  )
}

export default function ProgramsLoading() {
  return (
    <div>
      <div className="mb-6 space-y-2 border-b border-border pb-5">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="max-w-2xl space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <ProgramRowSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
