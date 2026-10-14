'use client'

// The members kit root. The design's pages carry `body[data-area]` to tell shell.js which header
// section to light; under the installed kit that attribute lives on this element, derived from the
// route on every navigation (the layout itself does not re-render between pages, so it cannot).

import { usePathname } from 'next/navigation'
import { areaFor } from './nav'
import { isConsoleRoute } from '@/lib/nav/console-route'

export function MembersKitRoot({ profileHref, children }: { profileHref: string; children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const area = areaFor(pathname, profileHref)
  // A console route keeps this root (the layout cannot swap it on a client move) but hides the member
  // header and rails (members-shell.css `[data-console]`), so the console's own chrome stands alone.
  return (
    <div data-kit="members" data-area={area} data-theme="commons" data-energy="flow" data-console={isConsoleRoute(pathname) ? '' : undefined}>
      {children}
    </div>
  )
}
