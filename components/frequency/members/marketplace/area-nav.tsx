'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// THE PINNED MARKETPLACE NAV (LIVE-1027). One bar for every commerce area (Classifieds, Housing,
// Market, Store, paid Events) that the layouts of those subtrees mount above their pages. It sticks
// under the app header, reads the active door from the URL so a soft navigation re-highlights it
// without a server round trip, and leaves the page body to swap beneath it (each route's own
// loading.tsx fills the space below the bar, never the bar itself). Doors arrive as props from the
// server (FqMarketAreas) so the operator's hidden areas stay hidden.

export interface FqAreaDoor {
  key: string
  href: string
  label: string
}

const isActive = (path: string, href: string) => {
  const base = href.split('?')[0]
  return path === base || path.startsWith(`${base}/`)
}

export function FqMarketNav({ doors }: { doors: FqAreaDoor[] }) {
  const path = usePathname() ?? ''
  return (
    <nav className="tabs fqm-tabs fqm-pin-nav" aria-label="Marketplace">
      {doors.map((d) => {
        const on = isActive(path, d.href)
        return (
          <Link key={d.key} href={d.href} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined}>
            {d.label}
          </Link>
        )
      })}
    </nav>
  )
}
