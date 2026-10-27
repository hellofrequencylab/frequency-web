import { FqSpaceLoading } from '@/components/frequency/members/space/space-loading'

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
// 🔴 RADIUS: this file used to be unable to reach the role tokens, and that was the second half of
// the same bug. A loading.tsx renders inside the layout SHARING ITS FOLDER, and the AccentScope that
// establishes [data-space-theme] used to live one level down in (profile)/layout.tsx — so this
// skeleton had no themed ancestor: `rounded-card` resolved to the VIEWER's skin/generation, which
// retune --radius-card from 15px to 42px, and the skeleton drew a 42px chip in front of a 2px one.
// The scope moved UP to the sibling [slug]/layout.tsx (LIVE-196, ADR-1192), so this file IS inside it
// now and the role tokens would resolve to the Space's shape. The markup below is deliberately
// unchanged: --radius-cover reads the same inside and outside the scope, the cover and the chip both
// use it (matching BrandAnchor, which is also cover-shaped), and everything else here is shape-free —
// so the skeleton still cannot drift from the hero it mirrors.
export default function SpaceDetailLoading() {
  return <FqSpaceLoading />
}
