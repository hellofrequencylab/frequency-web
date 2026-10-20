import { SITE_DESIGN } from '@/lib/theme/design'
import { FqIndexLoading } from '@/components/frequency/members/community-states'
import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for Housing (LIVE-1032). The page awaits its listings before first paint and had
// no boundary of its own, so the wait fell through to whatever the parent painted. Under Frequency it wears
// the kit skeleton every other marketplace area uses; DAWN gets a heading, the search row and a card grid.
export default function HousingLoading() {
  if (SITE_DESIGN === 'frequency') return <FqIndexLoading label="Loading Housing" shape="items" />
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading Housing">
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-72 max-w-full" />
      </div>
      <Skeleton className="h-10 w-full max-w-md rounded-control" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-card" />
        ))}
      </div>
    </div>
  )
}
