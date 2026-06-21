'use client'

import { PUBLIC_MEGA_NAV } from '@/lib/site'
import { MegaBar } from '@/components/layout/mega-menu'

// ── Unified primary navigation ────────────────────────────────────────────────
// One nav for every header so the splash and the community feel like one place.
// The public pages live in a couple of grouped MEGA panels (lib/site PUBLIC_MEGA_NAV)
// rendered by the shared MegaBar, which slides a FULL-WIDTH row down under the header
// (the panel anchors to the positioned <header>). Desktop only; the in-app mobile drawer
// + the marketing Join CTA cover phones.

type Variant = 'light' | 'dark'

export function PrimaryNav({
  variant = 'light',
  className = '',
  showDiscover = true,
}: {
  variant?: Variant
  className?: string
  /** Hide the "Discover" mega in the app shell, where the left rail already owns
   *  discovery and this nav is just full-site browsing. */
  showDiscover?: boolean
}) {
  const entries = PUBLIC_MEGA_NAV.filter((m) => showDiscover || m.label !== 'Discover')

  return (
    <MegaBar
      entries={entries}
      variant={variant}
      ariaLabel="Primary"
      className={`hidden md:block ${className}`}
    />
  )
}
