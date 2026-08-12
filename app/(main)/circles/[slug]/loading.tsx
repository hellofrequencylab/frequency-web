import { Skeleton } from '@/components/ui/skeleton'

// Instant loading state for ONE circle. Opening a circle card is an App Router navigation, and
// until this file existed the nearest boundary above it was app/(main)/circles/loading.tsx — the
// INDEX skeleton. So tapping a circle painted a list of card-shaped rows and then replaced them
// with a detail page: the wrong shape, promising the wrong thing, for the whole RSC round trip.
//
// It sits at the [slug] level, ABOVE the (circle) route group, on purpose. A loading.tsx nested in
// the same folder as a layout is rendered INSIDE that layout (Next 16, loading.js "Behavior"), so a
// file inside (circle)/ could only ever cover the tab bodies and would still leave the shell's own
// header unpainted on a cold open. This one covers the shell too, and it also serves the circle's
// owner routes (manage / crm / settings / edit), which are siblings of the group and were falling
// back to the same index skeleton.
//
// The shape mirrors what actually lands (app/(main)/circles/[slug]/(circle)/layout.tsx composing
// DetailTemplate): the 16:6 cover, the identity lockup with its action cluster pushed right, the
// badge row, then the tab strip and a body. Skeletons are dimension-matched so nothing jumps when
// the real header swaps in (PAGE-FRAMEWORK §5.4).
export default function CircleDetailLoading() {
  return (
    <div>
      {/* The standard Detail cover (16:6). */}
      <div className="mb-4 aspect-[16/6] w-full overflow-hidden rounded-card bg-surface-elevated" />

      {/* The identity lockup: title + badges + the quiet fact lines on the left, the one primary
          action on the right from sm up. */}
      <header className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-5 w-20 rounded-pill" />
              <Skeleton className="h-5 w-24 rounded-pill" />
            </div>
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-10 w-28 shrink-0 rounded-control" />
        </div>

        {/* The tab strip. */}
        <div className="mt-4 flex gap-1 border-b border-border pb-2">
          <Skeleton className="h-6 w-14" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-18" />
          <Skeleton className="h-6 w-20" />
        </div>
      </header>

      {/* The body. */}
      <div className="space-y-3 pt-4">
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-32 w-full rounded-card" />
      </div>
    </div>
  )
}
