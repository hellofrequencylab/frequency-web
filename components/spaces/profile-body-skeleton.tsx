import { Skeleton } from '@/components/ui/skeleton'

// The profile TAB-BODY loading skeleton (ENTITY-SPACES-BUILD §A.5, PAGE-FRAMEWORK §5.4). The tab
// pages render their modules via <PageModules>, whose per-module Suspense fallback is `null` (other
// callers rely on that, so it stays) — meaning a slow tab would paint to BLANK below the hero. This
// route-level skeleton (mounted by each tab's loading.tsx) fixes that WITHOUT touching the shared
// PageModules: when a tab's body is resolving, it shows card-shaped placeholders at the directory's
// GridSkeleton fidelity, so tab navigation paints progressively instead of flashing empty.
//
// Dimension-matched to a real tab body: a SectionHeader line, then a 2-up EntityCard grid (the
// rhythm every tab uses), so the streamed content lands with minimal shift. Server-friendly (no hooks).
export function ProfileBodySkeleton() {
  return (
    <div className="space-y-6 py-2" aria-hidden>
      <ProfileSectionSkeleton />
      <ProfileSectionSkeleton cards={2} />
    </div>
  )
}

// One section: a short title bar + a responsive card grid (matches the EntityCard grids the tabs
// render). `cards` controls how many placeholder cards (default 4 for a fuller first section).
function ProfileSectionSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-8 rounded-full" />
      </div>
      <div className="grid gap-4 @lg:grid-cols-2">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
