import { Skeleton } from '@/components/ui/skeleton'
import { ProfileBodySkeleton } from '@/components/spaces/profile-body-skeleton'
import { COVER_HEIGHT_DEFAULT, coverHeightClass } from '@/lib/layout/cover-height'

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
// ── WHAT THIS SKELETON IS SHAPED LIKE, AND WHY IT CHANGED (2026-09-01) ────────────────────────
// It drew the HEADER-size cover — a short h-40/sm:h-52 band with the brand chip hanging half off
// its bottom-left and a pt-14 identity row cleared beneath it — and described that as "the
// default". That stopped being true at ADR-526: `readCoverSize()` was reduced to `return 'hero'`
// unconditionally, so the shape this file mirrored became unreachable while the file kept
// mirroring it. Every soft navigation into every Space therefore painted a 170px band and then
// snapped to a 306px hero with the identity INSIDE the photo — a 136px jump on a phone, the
// avatar teleporting ~85px, a whole pt-14 band evaporating, and a mobile action row appearing
// from nowhere. It was the most-seen layout shift in the product and nothing measured it.
// It now mirrors the HERO: the cover at the default `standard` height, the identity overlaid at
// its bottom-left, and the phone action row. Heights come from the SAME ladder the layout uses
// (lib/layout/cover-height.ts) rather than from copied literals, so the two cannot drift again.
//
// 🔴 RADIUS: THIS FILE CANNOT USE THE ROLE TOKENS, and that is the second half of the same bug.
// A loading.tsx renders inside the layout SHARING ITS FOLDER, and the AccentScope that establishes
// [data-space-theme] lives one level down in (profile)/layout.tsx — so this skeleton has no themed
// ancestor. `rounded-card` here does not resolve to the SPACE's shape; it resolves to the VIEWER's
// skin/generation, which retune --radius-card from 15px to 42px. The skeleton was drawing a 42px
// chip in front of a 2px one. --radius-cover has no skin/generation override at all, so it is the
// one radius that reads the same inside and outside the scope: the cover and the chip both use it
// (matching BrandAnchor, which is also cover-shaped now), and everything else here is shape-free.
export default function SpaceDetailLoading() {
  return (
    <div>
      {/* The HERO cover at the default height, with the identity overlaid on its bottom edge —
          the shape (profile)/layout.tsx actually renders. `coverHeightClass(COVER_HEIGHT_DEFAULT)`
          is the layout's own call, not a copy of its output, so a change to the ladder moves both. */}
      <div className={`relative w-full overflow-hidden rounded-[var(--radius-cover,1.5rem)] bg-surface-elevated ${coverHeightClass(COVER_HEIGHT_DEFAULT)}`}>
        {/* Same p-6 sm:p-8 inset as the real overlay, so the chip lands on the same pixel. */}
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
          <div className="flex items-end gap-4">
            <Skeleton className="h-20 w-20 shrink-0 rounded-[var(--radius-cover,1.5rem)] border-4 border-surface lg:h-28 lg:w-28" />
            <div className="min-w-0 flex-1 space-y-2 pb-1">
              <Skeleton className="h-7 w-48 max-w-full" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
          </div>
        </div>
      </div>

      {/* The phone action row (sm:hidden), mirroring the real mobileActionBand: a flexible CTA and
          two 40px glyph buttons. Desktop shows nothing here — its actions are on the cover above. */}
      <div className="mt-4 flex items-center gap-2 sm:hidden">
        <Skeleton className="h-10 min-w-0 flex-1 rounded-control" />
        <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
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
