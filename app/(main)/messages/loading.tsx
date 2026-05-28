import { Skeleton } from '@/components/ui/skeleton'

function ConversationRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-surface">
      <Skeleton className="w-10 h-10 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-56" />
      </div>
      <Skeleton className="h-3 w-10 shrink-0" />
    </div>
  )
}

export default function MessagesLoading() {
  return (
    <div className="px-4 py-8 max-w-2xl mx-auto">
      <Skeleton className="h-6 w-28 mb-6" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <ConversationRowSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
