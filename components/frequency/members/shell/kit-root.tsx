'use client'

// The members kit root. The design's pages carry `body[data-area]` to tell shell.js which header
// section to light; under the installed kit that attribute lives on this element, derived from the
// route on every navigation (the layout itself does not re-render between pages, so it cannot).

import { usePathname } from 'next/navigation'
import { areaFor } from './nav'

export function MembersKitRoot({ profileHref, children }: { profileHref: string; children: React.ReactNode }) {
  const area = areaFor(usePathname() ?? '', profileHref)
  return (
    <div data-kit="members" data-area={area} data-theme="commons" data-energy="flow">
      {children}
    </div>
  )
}
