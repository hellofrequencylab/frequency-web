import Link from 'next/link'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SURFACE_PANELS, isPanelId } from '@/components/spaces/workspace/surface-panels'
import {
  SPACE_MENU_VISIBLE_BUDGET,
  condenseSpaceProfileNav,
  keepActiveVisible,
} from '@/lib/spaces/profile-nav-condense'
import type { SpaceProfileTab } from '@/components/spaces/space-profile-tabs'

// THE SPACE MENU'S MARKUP, WITH NO HOOKS (LIVE-522).
//
// Split out of space-profile-menu.tsx because that component reads the router query, and a client
// component that does so on a STATICALLY PRERENDERED page bails that subtree out to client
// rendering. Next refuses the export outright: the build died on
//
//   useSearchParams() should be wrapped in a suspense boundary at page "/spaces/[slug]"
//
// the first time the signed-out Space page mounted the menu.
//
// A <Suspense> wrapper is the documented remedy and it is the WRONG one here. The share URL exists to
// be crawled; a bailed-out subtree is not in the prerendered HTML, so the fix that makes the build
// pass would have quietly taken the Space's own navigation out of the page that search engines read.
//
// Neither hook was carrying its weight on that page anyway. The query hook reads the owner's
// `?panel=` workspace, which is owner-gated and dead for a visitor, and the path hook computes the
// active pill, which on the canonical Space URL is always Home. Both become props, this file holds
// the markup, and the client wrapper next door supplies them from the hooks where a viewer exists.
//
// No 'use client' on purpose: imported by a server page it renders on the server, imported by the
// client wrapper it joins that bundle. There is no second copy of the markup either way.
// `lib/spaces/profile-nav.public.test.ts` asserts both halves of that, by name.
//
// ── THE MENU IS CONDENSED, NOT SCROLLED (LIVE-529) ────────────────────────────────────────────────
//
// The row used to be a flat scroller holding EVERY tab, and the note further down measures what that
// cost: ~210px of a Space's own navigation past the right edge of a 360px phone, behind a horizontal
// drag with no visible scrollbar to suggest it. Two of the sources feeding the list are unbounded
// (Home section anchors, the operator's custom pages), so the overflow could only grow.
//
// So the bar now shows a BUDGETED set and folds the tail into one "More" disclosure. The budget and
// the ranking are in lib/spaces/profile-nav-condense.ts, shared by this file's two callers so the
// public chrome and the member surfaces fold identically.
//
// 🔴 A NATIVE <details>, AND THAT IS NOT A STYLE PREFERENCE. This file cannot hold client state:
// it has no 'use client' (see above) and a server page imports it directly, so a `useState` here
// would fail that page at render. `<details>` is the one disclosure that needs NO JavaScript — the
// summary is focusable and toggles on Enter and Space natively, it reports its own expanded state to
// assistive tech, and every href inside it is in the prerendered HTML whether it is open or shut, so
// the fold costs the share URL no crawlable links. components/ui/underline-tabs.tsx solves the same
// problem the same way; this follows it rather than inventing a second vocabulary.
export function SpaceProfileMenuView({
  tabs,
  canManage = false,
  pathname,
  panel,
}: {
  tabs: SpaceProfileTab[]
  /** Whether the viewer manages this Space — gates the "Manage" item. */
  canManage?: boolean
  /** The current path. A PROP, not a router hook: see the header note. */
  pathname: string
  /** The open `?panel=<id>`, when there is one. A PROP, not a router hook. */
  panel?: string
}) {

  // When a `?panel=<id>` workspace surface is open, the operator is on that surface even though the
  // pathname is still the index — so Home drops its active styling and a small affordance names the
  // surface. Owner-gated (a visitor's stray `?panel` is ignored).
  const rawPanel = panel
  // The Manage panel is the full in-place console (its own tab bar names where you are), so it does NOT get
  // the "You are editing X" affordance — that cue is only for the narrower single-surface panels.
  const openPanelLabel =
    canManage && isPanelId(rawPanel) && rawPanel !== 'manage' ? SURFACE_PANELS[rawPanel].label : null
  const manageActive = canManage && rawPanel === 'manage'

  const indexHref = tabs[0]?.href
  const isActive = (tab: SpaceProfileTab): boolean => {
    if (tab.href.includes('#')) return false
    if (tab.href === indexHref) return pathname === tab.href && openPanelLabel == null
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`)
  }

  // The bar, and the tail behind "More". `keepActiveVisible` then guarantees the row the viewer is
  // standing on is never the folded one, so the menu never stops answering "where am I".
  const { primary, overflow } = keepActiveVisible(
    condenseSpaceProfileNav(tabs, SPACE_MENU_VISIBLE_BUDGET),
    isActive,
  )

  const itemClasses = (active: boolean) =>
    cn(
      // rounded-control (was rounded-lg): tab pills are CONTROLS, so they take the role token. The
      // [data-space-theme] pin resolves it to 14px for EVERY Space — a theme no longer re-tunes
      // shape (2026-09-01), so the sentence that used to sit here about `playful` pilling them is
      // retired along with the override.
      //
      // 🔴 `tap-target` is the fix for a defect this row had from the start: its height was PADDING
      // ALONE. `--tap-min` is a viewer generation axis spanning 26px → 56px, and every <Button> in
      // the tab body below and every control in the hero above rises with it — these pills did not,
      // sitting between them at a flat ~31px. Two costs, and the second is the serious one:
      //   · the bar visibly disagreed with the chrome on both sides of it;
      //   · the presets that raise the floor exist FOR pointer accuracy (spacious 48px, the kids
      //     bands 46-56px), and the primary navigation of a Space profile was opting out of exactly
      //     the accommodation those viewers selected.
      // Padding stays as the resting size; min-block-size only ever raises.
      //
      // 🔴 `max-w-[11rem] truncate` is the other half of the LIVE-529 bound, and it is load-bearing
      // ONLY because the scroller is gone in the folded branch (see the nav note below). A label
      // here can be arbitrarily long — a custom page's label and the Shop tab's word are free text
      // an operator types — and with no scroller behind it, one 400px label would bleed past the
      // viewport with nothing to drag. Capping the PILL bounds the row without touching the fold:
      // the destination is still one tap away and still carries its full name in the DOM. rem, not
      // px, so it rides the viewer's type scale (and stays clear of the raw-px-arbitrary ratchet).
      'shrink-0 whitespace-nowrap rounded-control px-3 py-1.5 text-body-sm font-medium transition-colors tap-target max-w-[11rem] truncate',
      active ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-surface-elevated hover:text-text',
    )

  return (
    <>
      {/* The menu bar: pinned under the global header. A rule UNDER it (below the menu line), and none
          above it, over an opaque canvas backdrop so content scrolls cleanly beneath.
          It is also the CONTAINING BLOCK for the "More" panel: `sticky` is a positioned value, so an
          absolutely positioned descendant resolves against this box. That is deliberate — anchoring
          the panel to the BAR rather than to the chip keeps it on screen wherever the chip lands,
          including when the chip wraps to a second line at the left edge. */}
      {/* ── WHY THE BAR HAS TWO CLASS STRINGS, AND WHY ONE OF THEM IS STILL A SCROLLER ─────────
          🔴 A DISCLOSURE AND A HORIZONTAL SCROLLER CANNOT SHARE A BOX. `overflow-x: auto` forces
          `overflow-y` to compute to `auto` too (CSS Overflow §3 — only `visible` pairs with
          `visible`), so a ~44px-tall scroller CLIPS its own absolutely-positioned panel, and on a
          phone there is no visible scrollbar to hint that the rest of it is down there.
          components/ui/underline-tabs.tsx hit this first and answered it the same way: the strip
          stops scrolling when it carries a menu, and wraps instead.
          So the FOLDED branch wraps, and the unfolded branch keeps the scroller and the gutter bleed
          exactly as they were, because a menu inside its budget has nothing to fold and nothing to
          clip. Whole class strings either side, because Tailwind scans source text.

          WHAT THE SCROLLER BRANCH IS STILL FOR, since the budget means it rarely overflows: it is the
          honest fallback for a row that is inside the budget and still too wide — four long labels, a
          raised `--tap-min`, the owner's Manage item alongside. It is no longer the PRIMARY answer to
          overflow, which is what it was (badly) being used as.

          🔴 `shrink-0` on the pills is load-bearing in BOTH branches, and the reason is not the
          obvious one. The obvious reading says it is redundant: a flex child defaults to
          `flex-shrink: 1`, but it also gets `min-width: auto`, which floors it at its MIN-CONTENT
          width, and `whitespace-nowrap` makes min-content the full label — so a nowrap pill is
          normally self-protecting. What defeats that is `tap-target` (app/globals.css), which sets
          BOTH axes:
            min-block-size: var(--tap-min);  min-inline-size: var(--tap-min);
          That explicit `min-inline-size` REPLACES `min-width: auto`, so the min-content floor is
          gone and the pill may shrink all the way to `--tap-min`. The utility was added for VERTICAL
          rhythm; the horizontal floor came along silently and took the protection with it. Measured
          at the default generation (--tap-min 32px), 390px wide, seven tabs: the pills collapsed
          from 65-98px to a uniform 56px, six of the seven labels overflowed their own box, the worst
          by 30px, and they rendered as "CalendarCircles" / "DiscussReviews". In the WRAP branch the
          same missing floor would squeeze a line instead of wrapping it, which is the same defect
          with a different shape. `space-chrome-geometry.test.ts` holds the coupling.

          AND THE NUMBER THAT MADE THIS ROW EXIST. Mobile browsers hide the scrollbar at rest, so on a
          360px phone a Space with seven tabs
          (Home/Book/Events/Practices/Calendar/Circles/Reviews ≈ 536px against a 328px content
          column) put roughly 210px of its own navigation past the right edge with nothing to suggest
          it was reachable. The gutter bleed (`-mx-4 px-4`, and the `sm:` pair) was the mitigation: it
          widens the scroller to the full content column so the last visible pill is cut by the
          VIEWPORT edge rather than stopping short inside dead padding, and a pill sliced mid-glyph at
          the screen edge is at least a cue. It was never the fix — 210px is 210px whether or not the
          edge hints at it, and the two unbounded sources meant it grew. The fix is the budget.
          From `lg` the row always fits, so the bleed is dropped (`lg:mx-0 lg:px-0`).
          `overscroll-x-contain` stops a horizontal fling from turning into a browser back-swipe. */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 border-b border-border bg-canvas shadow-[0_8px_10px_2px_var(--color-canvas)]">
        <nav
          aria-label="Space menu"
          className={
            overflow.length > 0
              ? '-mx-4 flex flex-wrap items-center gap-1 px-4 py-3 sm:-mx-6 sm:px-6 sm:py-2.5 lg:mx-0 lg:px-0'
              : '-mx-4 flex items-center gap-1 overflow-x-auto overscroll-x-contain px-4 py-3 sm:-mx-6 sm:px-6 sm:py-2.5 lg:mx-0 lg:px-0'
          }
        >
          {primary.map((tab) => {
            const active = isActive(tab)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={itemClasses(active)}
              >
                {tab.label}
              </Link>
            )
          })}

          {/* THE TAIL. One disclosure, every folded destination a real <Link> inside it.
              `key={pathname}` is what closes it again after a soft navigation: without it React keeps
              the same <details> DOM node across the route change and the panel stays hanging open
              over the page you just opened. Remounting on the path is a one-prop fix that needs no
              effect and no state.
              The accessible name is "More in this Space" — the visible word plus an sr-only tail, so
              the name stands on its own out of context while the label a sighted viewer reads stays
              one short word (WCAG 2.5.3 holds: the visible label is a prefix of the accessible name). */}
          {overflow.length > 0 && (
            <details key={pathname} className="group shrink-0">
              <summary
                className={cn(
                  itemClasses(overflow.some(isActive)),
                  'inline-flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden',
                )}
              >
                More
                <span className="sr-only"> in this Space</span>
                <ChevronDown
                  className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <div className="absolute right-0 top-full z-30 mt-1 max-h-[70vh] min-w-[11rem] overflow-y-auto rounded-card border border-border bg-surface p-1 lift-3">
                {overflow.map((tab) => {
                  const active = isActive(tab)
                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'block truncate rounded-control-nested px-3 py-1.5 text-body-sm transition-colors tap-target',
                        active
                          ? 'bg-primary-bg font-semibold text-primary-strong'
                          : 'text-muted hover:bg-surface-elevated hover:text-text',
                      )}
                    >
                      {tab.label}
                    </Link>
                  )
                })}
              </div>
            </details>
          )}

          {/* `shrink-0`: the owner's console entry is the one item here that must never be the thing
              that gives way. `ml-auto` still right-aligns it when the row FITS; when it wraps it
              simply follows the "More" chip, which is correct and reachable. */}
          {canManage && indexHref && (
            <span className="ml-auto flex shrink-0 items-center gap-1 border-l border-border pl-2">
              <Link
                href={`${indexHref}?panel=manage`}
                aria-current={manageActive ? 'page' : undefined}
                className={cn(itemClasses(manageActive), 'inline-flex items-center gap-1.5')}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                Manage
              </Link>
            </span>
          )}
        </nav>
      </div>

      {/* When a `?panel=<id>` workspace surface is open, name it right under the menu so the current
          surface stays legible (Home no longer reads active). aria-current marks it as the location. */}
      {openPanelLabel && (
        <div className="flex items-center gap-2 py-2 text-body-sm">
          <span className="text-muted">You are editing</span>
          <span
            aria-current="page"
            className="inline-flex items-center rounded-pill bg-primary-bg px-2.5 py-1 font-medium text-primary-strong"
          >
            {openPanelLabel}
          </span>
        </div>
      )}
    </>
  )
}
