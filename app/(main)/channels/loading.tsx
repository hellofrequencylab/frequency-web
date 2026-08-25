import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for the Channels index (PAGE-FRAMEWORK §5). See the note in
// app/(main)/circles/loading.tsx: the retired `px-4 py-8 max-w-2xl mx-auto` shell double-padded
// inside the app shell and painted a narrow column, while page.tsx opens on the full-width
// MarketHero band. The skeleton now matches the destination.
function ChannelCardSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-card border border-border bg-surface px-4 py-3">
      <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3.5 w-14 rounded-pill" />
        </div>
        <Skeleton className="h-3 w-56" />
        <div className="flex gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  )
}

export default function ChannelsLoading() {
  return (
    <div>
      <Skeleton className="min-h-[15rem] w-full rounded-3xl sm:min-h-[24rem]" />
      <div className="mb-5 mt-4 border-b border-border sm:mb-6" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <ChannelCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
