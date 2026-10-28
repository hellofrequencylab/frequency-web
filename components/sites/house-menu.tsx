'use client'

import { Fragment, useState } from 'react'
import { Menu, X } from 'lucide-react'

// The house website's phone menu (components/sites/house-chrome.tsx): a round button under 940px that opens
// a frosted panel of the same links. A client island only so tapping a link closes the panel, which a plain
// <details> cannot do. The links themselves are the server's, passed in as data.

export function HouseMenu({ label, links, cta, foot }: { label: string; links: { href: string; label: string; className?: string; group?: string; current?: boolean }[]; cta?: { href: string; label: string }; foot?: { label: string; href?: string }[] }) {
  const [open, setOpen] = useState(false)
  if (links.length === 0) return null
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
        <span className="hs-menu-label sr-only">{open ? 'Close' : 'Menu'}</span>
      </button>
      {open && (
        <nav id="hs-menu-panel" aria-label={label} className="hs-menu-panel">
          {links.map((l, i) => (
            <Fragment key={l.href}>
              {l.group && l.group !== links[i - 1]?.group && <span data-menu-group="">{l.group}</span>}
              <a href={l.href} className={l.className} aria-current={l.current ? 'page' : undefined} data-grouped={l.group ? '' : undefined} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            </Fragment>
          ))}
          {cta && <a href={cta.href} data-cta="" onClick={() => setOpen(false)}>{cta.label}</a>}
          {foot && foot.length > 0 && (
            <div data-menu-foot="">
              {foot.map((f) => (f.href ? <a key={f.label} href={f.href} onClick={() => setOpen(false)}>{f.label}</a> : <span key={f.label}>{f.label}</span>))}
            </div>
          )}
        </nav>
      )}
    </div>
  )
}
