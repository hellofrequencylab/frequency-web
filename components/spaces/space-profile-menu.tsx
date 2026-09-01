'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SURFACE_PANELS, isPanelId } from '@/components/spaces/workspace/surface-panels'
import type { SpaceProfileTab } from '@/components/spaces/space-profile-tabs'

// THE PERSISTENT SPACE MENU. Rendered as a direct child of the profile page root (DetailTemplate's
// `stickyNav` slot), so the menu bar pins under the global header and stays in view for the whole scroll.
//
// The page + anchor tabs are Links (soft-nav; active via usePathname). The operator's "Manage" is a
// soft-nav to `?panel=manage`, which swaps ONLY the profile body (the App Router layout does not
// re-render on a query change) — so the hero + menu stay put and the body becomes the Manage dashboard.
// It is NOT a dropdown/fold-out anymore, and there is no separate CRM item (the CRM lives inside the
// Manage dashboard's Community area now). Only an owner sees the Manage item.
export function SpaceProfileMenu({
  tabs,
  canManage = false,
}: {
  tabs: SpaceProfileTab[]
  /** Whether the viewer manages this Space — gates the "Manage" item. */
  canManage?: boolean
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // When a `?panel=<id>` workspace surface is open, the operator is on that surface even though the
  // pathname is still the index — so Home drops its active styling and a small affordance names the
  // surface. Owner-gated (a visitor's stray `?panel` is ignored).
  const rawPanel = searchParams.get('panel') ?? undefined
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
      'whitespace-nowrap rounded-control px-3 py-1.5 text-body-sm font-medium transition-colors tap-target',
      active ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-surface-elevated hover:text-text',
    )

  return (
    <>
      {/* The menu bar: pinned under the global header. A rule UNDER it (below the menu line), and none
          above it, over an opaque canvas backdrop so content scrolls cleanly beneath. */}
      {/* ── THE BAR SCROLLS, AND NOW IT LOOKS LIKE IT DOES ────────────────────────────────────
          The tabs are `whitespace-nowrap` with no width, so they overflow into the `overflow-x-auto`
          scroller rather than wrapping or clipping — that part was always right. What was missing was
          any SIGN of it. Mobile browsers hide the scrollbar at rest, so on a 360px phone a Space with
          seven tabs (Home/Book/Events/Practices/Calendar/Circles/Reviews ≈ 536px) put roughly 210px of
          its own navigation past the right edge with nothing to suggest it was reachable.
          The fix is the gutter bleed: `-mx-4 px-4` (and the `sm:` pair) widens the scroller to the full
          content column, so the last visible pill is cut by the VIEWPORT edge rather than stopping short
          inside dead padding. A pill sliced mid-glyph at the screen edge is the cue; ending cleanly a
          gutter early is what read as "that is the last tab". From `lg` the row always fits, so the
          bleed is dropped (`lg:mx-0 lg:px-0`) and nothing about the desktop bar changes.
          The native scrollbar is deliberately NOT hidden — on desktop it is the only affordance there
          is, and suppressing it to look tidier would remove the very signal this note is about.
          `overscroll-x-contain` stops a horizontal fling from turning into a browser back-swipe. */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 border-b border-border bg-canvas shadow-[0_8px_10px_2px_var(--color-canvas)]">
        <nav className="-mx-4 flex items-center gap-1 overflow-x-auto overscroll-x-contain px-4 py-3 sm:-mx-6 sm:px-6 sm:py-2.5 lg:mx-0 lg:px-0">
          {tabs.map((tab) => {
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
          {/* `shrink-0`: the owner's console entry is the one item here that must never be the thing
              that gives way. `ml-auto` still right-aligns it when the row FITS; when it overflows there
              is no free space to distribute, so it simply follows the last tab inside the scroller —
              correct, and now reachable because the bar reads as scrollable. */}
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
