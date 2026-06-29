import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for Friends (PAGE-FRAMEWORK §5): the header over the impact block
// and a grid of connection-card skeletons, so the page paints its shape while the body streams.
export default function FriendsLoading() {
  return (
    <div>
      <div className="mb-4 space-y-2 sm:mb-5">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="mb-5 border-b border-border sm:mb-6" />
      <Skeleton className="mb-6 h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full max-w-xs" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
