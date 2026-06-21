'use client'

import { PUBLIC_MEGA_NAV } from '@/lib/site'
import { MegaMenu } from '@/components/layout/mega-menu'

// ── Unified primary navigation ────────────────────────────────────────────────
// One nav for every header so the splash and the community feel like one place.
// The flat tabs + thin Discover dropdown are gone: the public pages now live in a
// couple of grouped MEGA panels (lib/site PUBLIC_MEGA_NAV), so the header has fewer
// triggers (no overflow) and each opens a multi-column panel with descriptions.
// Desktop only; the in-app mobile drawer + the marketing Join CTA cover phones.

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
  const menus = PUBLIC_MEGA_NAV.filter((m) => showDiscover || m.label !== 'Discover')

  return (
    <nav className={`hidden md:flex items-center gap-0.5 ${className}`} aria-label="Primary">
      {menus.map((m) => (
        <MegaMenu
          key={m.label}
          label={m.label}
          sections={m.sections}
          featured={m.featured}
          variant={variant}
        />
      ))}
    </nav>
  )
}
