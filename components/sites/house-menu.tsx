'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'

// The house website's phone menu (components/sites/house-chrome.tsx): a round button under 940px that opens
// a frosted panel of the same links. A client island only so tapping a link closes the panel, which a plain
// <details> cannot do. The links themselves are the server's, passed in as data.

export function HouseMenu({
  label,
  links,
  admin = null,
}: {
  label: string
  links: { href: string; label: string }[]
  /** The labelled Frequency management link a skinned website ends its menu with (site-chrome.tsx). */
  admin?: { href: string; label: string } | null
}) {
  const [open, setOpen] = useState(false)
  if (links.length === 0 && !admin) return null
  return (
    <div className="hs-menu">
      <button
        type="button"
        className="hs-menu-button"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls="hs-menu-panel"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
      </button>
      {open && (
        <nav id="hs-menu-panel" aria-label={label} className="hs-menu-panel">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          {admin && (
            <a href={admin.href} className="hs-nav-admin" onClick={() => setOpen(false)}>
              {admin.label}
            </a>
          )}
        </nav>
      )}
    </div>
  )
}
