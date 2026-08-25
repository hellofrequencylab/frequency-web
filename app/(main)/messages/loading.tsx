import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for Messages (PAGE-FRAMEWORK §5). See the note in
// app/(main)/search/loading.tsx: the retired `px-4 py-8 max-w-2xl mx-auto` shell double-padded
// inside the app shell and painted a column narrower than the IndexTemplate page.tsx renders.
// The skeleton now paints the template's own shape: the PageHeading title block, its divider
// rule, then the conversation rows at the column's own width.
function ConversationRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-card border border-border bg-surface">
      <Skeleton className="w-10 h-10 rounded-pill shrink-0" />
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
    <div>
      <div className="mb-4 space-y-2 sm:mb-5">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="mb-5 border-b border-border sm:mb-6" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <ConversationRowSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
