'use client'

import { MegaBar } from '@/components/layout/mega-menu'
import { defaultMenu } from '@/lib/menus/defaults'
import type { MenuAccess, MenuSettings, ResolvedMenu } from '@/lib/menus/types'

// ── Header mega-menu ──────────────────────────────────────────────────────────
// One header nav for every surface (marketing, site, in-app) so the whole product
// feels like one place. The single DB-backed `header` menu (lib/menus) drives it:
// its TOP-LEVEL categories are the dropdown triggers (MegaBar triggerLevel='category'),
// and each trigger's panel renders that category's child columns. The marketing/site
// headers have no side rails, so they keep the default 'viewport' span; the in-app shell
// passes panelAlign='content' (+ rightRail) so the panel lands in the page content column.
// Desktop only; the in-app mobile drawer + the marketing Join CTA cover phones.
//
// DATA + FALLBACK: the server layout fetches the ResolvedMenu + the viewer's role + the
// interaction timings and passes them in. If `headerMenu` is missing, we fall back to the
// code default (defaultMenu('header')) so the header NEVER breaks.

type Variant = 'light' | 'dark'

export function PrimaryNav({
  variant = 'light',
  className = '',
  panelAlign = 'viewport',
  rightRail = false,
  headerMenu,
  viewerRole = 'visitor',
  timings,
}: {
  variant?: Variant
  className?: string
  /** Forwarded to MegaBar. 'content' aligns the panel to the shell's content column. */
  panelAlign?: 'viewport' | 'content'
  /** Forwarded to MegaBar (only with panelAlign='content'): reserve the right rail width. */
  rightRail?: boolean
  /** The resolved `header` menu (server-fetched). Falls back to the code default. */
  headerMenu?: ResolvedMenu
  /** The viewer collapsed to a single MenuAccess token; drives per-item mode. */
  viewerRole?: MenuAccess
  /** Mega-menu interaction timings from the global Menu Manager settings. */
  timings?: MenuSettings
}) {
  const header = headerMenu ?? defaultMenu('header')

  return (
    <MegaBar
      menus={[header]}
      triggerLevel="category"
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
