import { Skeleton } from '@/components/ui/skeleton'

function CircleCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-14 rounded-full" />
          </div>
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <div className="pt-1 space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-1.5 max-w-xs rounded-full" />
          </div>
        </div>
        <Skeleton className="h-8 w-16 rounded-lg shrink-0" />
      </div>
    </div>
  )
}

export default function CirclesLoading() {
  return (
    <div className="px-4 py-8 max-w-2xl mx-auto">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <CircleCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
