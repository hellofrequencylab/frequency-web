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
      'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
      active ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-surface-elevated hover:text-text',
    )

  return (
    <>
      {/* The menu bar: pinned under the global header. A rule UNDER it (below the menu line), and none
          above it, over an opaque canvas backdrop so content scrolls cleanly beneath. */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 border-b border-border bg-canvas shadow-[0_8px_10px_2px_var(--color-canvas)]">
        <nav className="flex items-center gap-1 overflow-x-auto py-3 sm:py-2.5">
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
          {canManage && indexHref && (
            <span className="ml-auto flex items-center gap-1 border-l border-border pl-2">
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
        <div className="flex items-center gap-2 py-2 text-sm">
          <span className="text-muted">You are editing</span>
          <span
            aria-current="page"
            className="inline-flex items-center rounded-lg bg-primary-bg px-2.5 py-1 font-medium text-primary-strong"
          >
            {openPanelLabel}
          </span>
        </div>
      )}
    </>
  )
}
