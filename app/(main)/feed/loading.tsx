import '@/app/themes/frequency/members-a.css'
import { Skeleton } from '@/components/ui/skeleton'
import { SITE_DESIGN } from '@/lib/theme/design'

function PostSkeleton() {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex gap-3">
        <Skeleton className="w-9 h-9 rounded-pill shrink-0" />
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3.5 w-12 rounded-pill" />
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

/** The Frequency Feed's loading face: the centre column's own shapes (greeting, the four standing
 *  numbers, the glass panel, the Up next card, three posts between hairlines), quiet and still, so the
 *  real column lands in the same places. The shell's rails are already painted by the layout. */
function FrequencyFeedLoading() {
  return (
    <div className="fa-col fa-loading" aria-busy="true" aria-label="Loading your feed">
      <span className="fa-sk" style={{ width: 220, height: 14 }} />
      <span className="fa-sk" style={{ width: '62%', height: 44, marginTop: 14 }} />
      <span className="fa-sk" style={{ width: '44%', height: 16, marginTop: 14 }} />
      <div className="fa-stats">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="fa-sk" style={{ width: 96, height: 56 }} />
        ))}
      </div>
      <span className="fa-sk fa-sk-panel" style={{ height: 180, marginTop: 22 }} />
      <span className="fa-sk fa-sk-panel" style={{ height: 300, marginTop: 44 }} />
      {[0, 1, 2].map((i) => (
        <div key={i} className="fa-post">
          <span className="fa-sk" style={{ width: 200, height: 14 }} />
          <span className="fa-sk" style={{ width: '100%', height: 14 }} />
          <span className="fa-sk" style={{ width: '70%', height: 14 }} />
        </div>
      ))}
    </div>
  )
}

export default function FeedLoading() {
  if (SITE_DESIGN === 'frequency') return <FrequencyFeedLoading />
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
