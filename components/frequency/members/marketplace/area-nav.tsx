'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'

// THE UNIFIED MARKETPLACE HEADER (LIVE-1027, LIVE-1037). One header for every commerce area
// (Classifieds, Housing, Market, Store, paid Events): the title, then the area menu as a pinned
// feature row (name plus one line on what the area is for), then a friendly closable tip for the
// area you are in. It is mounted once by the Marketplace route group layout, reads the active
// door from the URL so a soft navigation re-highlights it, and leaves the page body to slide in
// beneath it. Doors arrive as props from the server (FqMarketAreas) so hidden areas stay hidden.

export interface FqAreaDoor {
  key: string
  href: string
  label: string
  blurb: string
  tip: string
}

const isActive = (path: string, href: string) => {
  const base = href.split('?')[0]
  return path === base || path.startsWith(`${base}/`)
}

const TIP_KEY = 'fq-market-tips-closed'

function readClosed(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(TIP_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function AreaTip({ door }: { door: FqAreaDoor }) {
  const [closed, setClosed] = useState<string[] | null>(null)
  useEffect(() => {
    const id = requestAnimationFrame(() => setClosed(readClosed()))
    return () => cancelAnimationFrame(id)
  }, [])
  if (closed === null || closed.includes(door.key)) return null
  const close = () => {
    const next = [...closed, door.key]
    setClosed(next)
    try {
      window.localStorage.setItem(TIP_KEY, JSON.stringify(next))
    } catch {
      /* storage blocked: the tip just returns next visit */
    }
  }
  return (
    <aside className="panel row fqm-area-tip" aria-label={`About ${door.label}`}>
      <span className="t2 grow">
        <strong className="t1">{door.label}.</strong> {door.tip}
      </span>
      <button type="button" className="btn sm" onClick={close}>
        Got it
      </button>
    </aside>
  )
}

export function FqMarketHeader({ doors }: { doors: FqAreaDoor[] }) {
  const path = usePathname() ?? ''
  const active = doors.find((d) => isActive(path, d.href))
  return (
    <>
      <div className="fqm-uhead-title">
        <span className="k">Community</span>
        <h1 className="h1">
          Marketplace <span className="serif">near you.</span>
        </h1>
      </div>
      <nav className="fqm-pin-nav fqm-feature-nav" aria-label="Marketplace">
        {doors.map((d) => {
          const on = d.key === active?.key
          return (
            <Link key={d.key} href={d.href} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined}>
              <span className="t1">{d.label}</span>
              <span className="t2">{d.blurb}</span>
            </Link>
          )
        })}
      </nav>
      {active && <AreaTip door={active} />}
    </>
  )
}

// Keyed by area so crossing areas remounts only this wrapper and replays the slide-in; the
// header above never remounts. Reduced-motion viewers get no animation (CSS).
export function FqMarketSlide({ children }: { children: ReactNode }) {
  const path = usePathname() ?? ''
  const area = path.split('/')[1] ?? ''
  return (
    <div key={area} className="fqm-slide">
      {children}
    </div>
  )
}
