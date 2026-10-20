import { Skeleton } from '@/components/ui/skeleton'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FqIndexLoading } from '@/components/frequency/members/community-states'
import { GridSkeleton } from '@/components/spaces/directory-view'

// The Business Spaces directory's loading screen (SCAN-405, LIVE-1018). The Frequency page awaits the
// discovery read before it paints, so the route needs its own boundary: a heading bar, the find row, then
// the same dimension-matched card grid the page streams into. Neutral on purpose: no photo band, so
// nothing flashes where the header will land.

export default function SpacesDirectoryLoading() {
  // Under Frequency the wait wears the kit skeleton every other index uses (LIVE-1032).
  if (SITE_DESIGN === 'frequency') return <FqIndexLoading label="Loading Spaces" shape="circles" />
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading Spaces">
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-10 w-full rounded-control" />
      <GridSkeleton />
    </div>
  )
}
