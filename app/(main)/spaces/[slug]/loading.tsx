import { Skeleton } from '@/components/ui/skeleton'
import { ProfileBodySkeleton } from '@/components/spaces/profile-body-skeleton'

// Instant loading state for ONE Space, and for every owner surface beneath it.
//
// WHY IT SITS AT [slug] AND NOT INSIDE (profile). A loading.tsx renders INSIDE the layout that
// shares its folder (Next 16, loading.js "Behavior": the boundary wraps page.js and NESTED
// layout.js, never the layout in the same segment). The expensive work on this route is
// (profile)/layout.tsx — it resolves the caller, the manage grant, the tagline, the visibility,
// the follow state, the founding badge, the Space capabilities, the reviews and the profile nav
// before it renders a single node — so a file inside (profile)/ could only ever cover the tab
// body and would leave the whole header unpainted. There was no boundary anywhere between that
// layout and app/(main)/layout.tsx's {children}, so a soft navigation into a Space painted
// nothing at all until every one of those reads came back. The one existing skeleton under here,
// (profile)/book/loading.tsx, covers a tab body only and sits below the same block.
//
// This is the same placement and the same reasoning as app/(main)/circles/[slug]/loading.tsx, the
// sibling entity — read that file's note too; it also covers the owner routes (manage / crm /
// settings / marketing / loom / podcasts), which had no boundary of any kind.
//
// SpaceRootLayout ([slug]/layout.tsx) is NOT wrapped by this boundary, which is what keeps a
// missing or not-visible Space a real 404: its notFound() runs before the response starts
// streaming (loading.js "Status Codes").
//
// Radii are ROLE tokens, and the cover reuses the layout's own themable
// rounded-[var(--radius-cover,1.5rem)] rather than a literal utility — a route skeleton that
// mirrors a literal radius is what raised the literal-radius baseline on 2026-08-25, and this one
// is dimension-matched without doing that.
export default function SpaceDetailLoading() {
  return (
    <div>
      {/* The Header-size cover (h-40 sm:h-52, the default) with the brand chip hanging half off it. */}
      <div className="mb-2">
        <div className="relative w-full">
          <div className="h-40 w-full overflow-hidden rounded-[var(--radius-cover,1.5rem)] bg-surface-elevated sm:h-52" />
          <div className="absolute -bottom-10 left-5 sm:-bottom-12 sm:left-6">
            <Skeleton className="h-20 w-20 rounded-card border-4 border-surface lg:h-28 lg:w-28" />
          </div>
        </div>
      </div>

      {/* The identity band: name lockup on the left, the action cluster pushed right from sm up.
          pt-14 / sm:pt-16 clears the hanging chip, exactly as the real band does. */}
      <div className="flex flex-col gap-4 pt-14 sm:flex-row sm:items-end sm:justify-between sm:gap-x-6 sm:pt-16">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="hidden shrink-0 gap-2 sm:flex">
          <Skeleton className="h-9 w-24 rounded-control" />
          <Skeleton className="h-9 w-28 rounded-control" />
        </div>
      </div>

      {/* The sticky sub-nav strip, above its hairline. */}
      <div className="mt-4 flex gap-4 border-b border-border pb-3">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-5 w-24" />
      </div>

      {/* The body — the same skeleton the profile page's own Suspense fallback uses, so the swap
          from this boundary to that one is invisible. */}
      <div className="pt-4">
        <ProfileBodySkeleton />
      </div>
    </div>
  )
}
