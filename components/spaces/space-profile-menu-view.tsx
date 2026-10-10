import Link from 'next/link'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SURFACE_PANELS, isPanelId } from '@/components/spaces/workspace/surface-panels'
import type { SpaceProfileTab } from '@/components/spaces/space-profile-tabs'
import { SpaceMenuDropdown } from '@/components/spaces/space-menu-dropdown'

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
// ── ONE SCROLL RAIL, MANAGE PINNED (LIVE-744, owner ruling 2026-10-06) ───────────────────────────
//
// LIVE-529 folded the tail of this row into a "More" <details> to bound it. The owner reversed that:
// a fold hid destinations behind a popup that, being a native <details>, had no light dismiss and
// stayed hanging open over the page. So the row is a single horizontal rail again, holding EVERY
// tab, and the two things that made the old scroller bad are answered directly:
//   · the hidden scrollbar is answered by `admin-subnav-scroll` (app/globals.css), the same faded
//     edge the admin sub-nav uses, so a pill cut at the edge visibly fades instead of stopping dead;
//   · the owner's Manage entry sits OUTSIDE the rail, pinned at the right, so it never scrolls away
//     with the tabs.
export function SpaceProfileMenuView({
  tabs,
  canManage = false,
  pathname,
  panel,
  homeHref,
}: {
  tabs: SpaceProfileTab[]
  /** The Space's index (`/spaces/<slug>`), for Home's active state and the Manage pin. */
  homeHref?: string
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

  // Home is found by its menu key: a saved menu (lib/spaces/site-menu.ts) may move or drop it, and the
  // Manage pin below hangs off the Space's index either way.
  const indexHref = homeHref ?? tabs.find((t) => t.key === 'home')?.href ?? tabs[0]?.href
  const isActive = (tab: SpaceProfileTab): boolean => {
    if (tab.href.includes('#')) return false
    if (tab.href === indexHref) return pathname === tab.href && openPanelLabel == null
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`)
  }

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
      'shrink-0 whitespace-nowrap rounded-control px-3 py-1.5 text-body-sm font-medium transition-colors tap-target',
      active ? 'bg-primary-bg text-text' : 'text-muted hover:bg-surface-elevated hover:text-text',
    )

  return (
    <>
      {/* The menu bar: pinned under the global header. A rule UNDER it (below the menu line), and none
          above it, over an opaque canvas backdrop so content scrolls cleanly beneath. */}
      {/* ── THE RAIL AND THE PIN ─────────────────────────────────────────────────────────────────
          The <nav> is a plain flex row with two children: the RAIL (`flex-1 min-w-0`, the only box
          that scrolls) and the Manage pin (`shrink-0`, outside the rail). `min-w-0` is what lets the
          rail be narrower than its content, so it scrolls instead of pushing Manage off the edge.
          The gutter bleed (`-mx-4` on the nav, `px-4` inside the rail, and the `sm:` pair) widens the
          rail to the full content column so a pill is cut by the screen edge, under the faded mask,
          rather than stopping short inside dead padding. The rail keeps its inner padding at `lg`
          too, so the fade never eats the first pill's label.

          🔴 `shrink-0` on the pills is load-bearing, and the reason is not the obvious one. A nowrap
          flex child is normally floored at its min-content width, but `tap-target` (app/globals.css)
          sets `min-inline-size: var(--tap-min)`, which REPLACES `min-width: auto`, so without
          `shrink-0` the pills collapse to --tap-min and the labels overlap ("CalendarCircles").
          `space-chrome-geometry.test.ts` holds the coupling.
          `overscroll-x-contain` stops a horizontal fling from turning into a browser back-swipe. */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 border-b border-border bg-canvas shadow-[0_8px_10px_2px_var(--color-canvas)]">
        <nav aria-label="Space menu" className="-mx-4 flex items-center sm:-mx-6 lg:-mx-4">
          <div
            data-space-menu-rail
            className="admin-subnav-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain px-4 py-3 sm:px-6 sm:py-2.5 lg:px-4"
          >
            {tabs.map((tab) => {
              if (tab.mega) return <SpaceMenuDropdown key={`mega:${tab.label}`} tab={tab} itemClassName={itemClasses(false)} />
              if (tab.external) {
                return (
                  <a key={tab.href} href={tab.href} target="_blank" rel="noopener noreferrer" className={itemClasses(false)}>
                    {tab.label}
                  </a>
                )
              }
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
          </div>

          {/* The owner's console entry, PINNED: outside the rail, so it never scrolls with the tabs. */}
          {canManage && indexHref && (
            <span className="flex shrink-0 items-center gap-1 border-l border-border pl-2 pr-4 sm:pr-6 lg:pr-4">
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
