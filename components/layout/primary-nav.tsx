'use client'

import { PUBLIC_MEGA_NAV } from '@/lib/site'
import { MegaBar } from '@/components/layout/mega-menu'

// ── Unified primary navigation ────────────────────────────────────────────────
// One nav for every header so the splash and the community feel like one place.
// The public pages live in a couple of grouped MEGA panels (lib/site PUBLIC_MEGA_NAV)
// rendered by the shared MegaBar, which slides a row down from under the header. The
// marketing/site headers have no side rails, so they keep the default 'viewport' span;
// the in-app shell passes panelAlign='content' (+ rightRail) so the panel lands in the
// page content column between the rails. Desktop only; the in-app mobile drawer + the
// marketing Join CTA cover phones.

type Variant = 'light' | 'dark'

export function PrimaryNav({
  variant = 'light',
  className = '',
  showDiscover = true,
  panelAlign = 'viewport',
  rightRail = false,
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
}) {
  const entries = PUBLIC_MEGA_NAV.filter((m) => showDiscover || m.label !== 'Discover')

  return (
    <MegaBar
      entries={entries}
      variant={variant}
      ariaLabel="Primary"
      className={`hidden md:block ${className}`}
      panelAlign={panelAlign}
      rightRail={rightRail}
    />
  )
}
