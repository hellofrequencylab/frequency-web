import { Skeleton } from '@/components/ui/skeleton'

function PostSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex gap-3">
        <Skeleton className="w-9 h-9 rounded-full shrink-0" />
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3.5 w-12 rounded-full" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
          <div className="flex gap-3 pt-1">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-10" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FeedLoading() {
  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-3">
      {/* Composer placeholder */}
      <Skeleton className="h-20 w-full rounded-xl" />
      {/* Posts */}
      {Array.from({ length: 5 }).map((_, i) => (
        <PostSkeleton key={i} />
      ))}
    </div>
  )
}
