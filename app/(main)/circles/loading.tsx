import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for the Circles index (PAGE-FRAMEWORK §5).
//
// It used to open with `px-4 py-8 max-w-2xl mx-auto` — the RETIRED page shell. The app shell's
// <main> already supplies the outer padding (px-4 sm:px-6 lg:px-8 on the content column, py-6 on
// <main>), so that wrapper double-padded, and `max-w-2xl` painted a narrow column the destination
// has not used since the index moved onto MarketHero. Opening /circles flashed a narrow left-ish
// list and then reflowed into a full-width hero. The skeleton now paints what page.tsx renders:
// the shared PageHero band (its `large` tier, lib/layout/header-sizes.ts), the divider rule under
// it, then the card list at the column's own width.
function CircleCardSkeleton() {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-14 rounded-pill" />
          </div>
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <div className="pt-1 space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-1.5 max-w-xs rounded-pill" />
          </div>
        </div>
        <Skeleton className="h-8 w-16 rounded-lg shrink-0" />
      </div>
    </div>
  )
}

export default function CirclesLoading() {
  return (
    <div>
      <Skeleton className="min-h-[15rem] w-full rounded-3xl sm:min-h-[24rem]" />
      <div className="mb-5 mt-4 border-b border-border sm:mb-6" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <CircleCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
