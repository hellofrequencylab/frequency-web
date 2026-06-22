'use client'

import { MegaBar } from '@/components/layout/mega-menu'
import { defaultMenu } from '@/lib/menus/defaults'
import type { MenuAccess, MenuSettings, ResolvedMenu } from '@/lib/menus/types'

// ── Unified primary navigation ────────────────────────────────────────────────
// One nav for every header so the splash and the community feel like one place.
// The public pages live in a couple of grouped MEGA panels rendered by the shared
// MegaBar, which slides a row down from under the header. The panels are the
// DB-backed menus (lib/menus): `public_discover` + `public_explore`, each one a
// trigger. The marketing/site headers have no side rails, so they keep the default
// 'viewport' span; the in-app shell passes panelAlign='content' (+ rightRail) so the
// panel lands in the page content column between the rails. Desktop only; the in-app
// mobile drawer + the marketing Join CTA cover phones.
//
// DATA + FALLBACK: the server layout fetches the ResolvedMenus + the viewer's role +
// the interaction timings and passes them in. If a menu prop is missing (an old caller,
// or a fetch that never ran), we fall back to the code defaults (defaultMenu) so the
// header NEVER breaks.

type Variant = 'light' | 'dark'

export function PrimaryNav({
  variant = 'light',
  className = '',
  showDiscover = true,
  panelAlign = 'viewport',
  rightRail = false,
  discoverMenu,
  exploreMenu,
  viewerRole = 'visitor',
  timings,
}: {
  variant?: Variant
  className?: string
  /** Hide the "Discover" mega in the app shell, where the left rail already owns
   *  discovery and this nav is just full-site browsing. */
  showDiscover?: boolean
  /** Forwarded to MegaBar. 'content' aligns the panel to the shell's content column. */
  panelAlign?: 'viewport' | 'content'
  /** Forwarded to MegaBar (only with panelAlign='content'): reserve the right rail width. */
  rightRail?: boolean
  /** The resolved `public_discover` menu (server-fetched). Falls back to the code default. */
  discoverMenu?: ResolvedMenu
  /** The resolved `public_explore` menu (server-fetched). Falls back to the code default. */
  exploreMenu?: ResolvedMenu
  /** The viewer collapsed to a single MenuAccess token; drives per-item mode. */
  viewerRole?: MenuAccess
  /** Mega-menu interaction timings from the global Menu Manager settings. */
  timings?: MenuSettings
}) {
  const discover = discoverMenu ?? defaultMenu('public_discover')
  const explore = exploreMenu ?? defaultMenu('public_explore')
  const menus: ResolvedMenu[] = showDiscover ? [discover, explore] : [explore]

  return (
    <MegaBar
      menus={menus}
      triggerLevel="menu"
      viewerRole={viewerRole}
      variant={variant}
      ariaLabel="Primary"
      className={`hidden md:block ${className}`}
      panelAlign={panelAlign}
      rightRail={rightRail}
      timings={timings}
    />
  )
}
