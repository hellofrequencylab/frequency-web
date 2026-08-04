import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for a member PROFILE (PAGE-FRAMEWORK §5).
//
// This file exists because `/people` itself is now only a redirect into the Network hub
// (ADR-172), so the segment's own `loading.tsx` — a directory GRID of person cards — was the
// nearest one Next.js found for `/people/<handle>` too. Opening a profile flashed a six-card
// directory skeleton and then reflowed into a Detail page: the wrong shape, and a layout shift
// on every profile open. A detail route gets a detail-shaped skeleton.
//
// Mirrors the destination in `page.tsx`: a PageHero cover band (identity variant, whose default
// tier is `standard` = min-h-[15rem] sm:min-h-[20rem] in lib/layout/header-sizes.ts), the compact
// stats/bio band under it, then DetailTemplate's 2/3 content + 1/3 info-column body.
export default function PersonDetailLoading() {
  return (
    <div>
      {/* Cover band: avatar + name + @handle overlaid, matching PageHero's `standard` min-height
          so the real hero lands at the same height this paints. */}
      <div className="relative min-h-[15rem] overflow-hidden rounded-2xl bg-surface-elevated sm:min-h-[20rem]">
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-5 sm:p-6">
          <Skeleton className="h-16 w-16 shrink-0 rounded-pill sm:h-20 sm:w-20" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
      </div>

      {/* Context band: the one compact stats line (region · joined · circles · chips), then bio. */}
      <div className="min-w-0 space-y-2 pt-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      {/* Header hairline */}
      <div className="mt-4 border-t border-border" />

      {/* BODY — 2/3 content beside the 1/3 tiled info column (matches page.tsx). */}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="order-2 min-w-0 space-y-6 xl:order-1 xl:col-span-2">
          {/* Tab row */}
          <div className="flex gap-4 border-b border-border pb-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-16" />
            ))}
          </div>
          {/* Timeline cards */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-pill" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ))}
        </div>
        {/* Info column: Standing, Frequency Signature, Achievements */}
        <aside className="order-1 min-w-0 space-y-4 self-start xl:order-2 xl:col-span-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </aside>
      </div>
    </div>
  )
}
