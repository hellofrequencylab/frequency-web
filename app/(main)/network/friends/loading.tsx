import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for Friends (PAGE-FRAMEWORK §5). It mirrors what the page actually
// renders, in order, so the shape does not jump when the body arrives:
//
//   the max-w-5xl column → the Network hub tab strip → the OVERLAY HERO BAND → the admin-bar
//   rule → the body.
//
// The band is the `short` tier from lib/layout/index-hero.ts (min-h-[11rem] sm:min-h-[14rem]) and
// the same rounded-3xl geometry PageHero paints, because a skeleton that mirrors the OLD plain
// heading here would flash a 28px title block and then shove everything down by ~11rem.
export default function FriendsLoading() {
  return (
    <div className="mx-auto max-w-5xl">
      {/* Hub tab strip — Community · Friends · Contacts. */}
      <div className="mb-6 flex gap-4 border-b border-border pb-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
      </div>
      {/* The overlay hero band, short tier. */}
      <Skeleton className="mt-3 min-h-[11rem] w-full rounded-3xl sm:min-h-[14rem]" />
      {/* The header rule the admin bar draws under the band. */}
      <div className="mb-5 mt-4 border-b border-border sm:mb-6" />
      <Skeleton className="mb-6 h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 rounded-card border border-border bg-surface p-5 lift-1">
            <Skeleton className="h-12 w-12 shrink-0 rounded-pill" />
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
