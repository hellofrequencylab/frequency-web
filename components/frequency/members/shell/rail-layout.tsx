'use client'

// THE RAIL GRID (Members.dc.html; README §Layout, "Rail resize and collapse").
//
//   <L> minmax(0,1fr) <R>, gap 56, padding 44/40/160. The 2026-10-14 export made each rail
//   INDEPENDENT: its own width (default 248, 220-320), its own collapse state and its own scroll (the
//   proportional scroll sync is gone; each scroll area contains its own overscroll). A collapsed rail
//   is the 76px micro rail. Each rail has a 12px handle on its inner edge: a round chevron that
//   toggles collapse, then a hairline you drag to resize (below 150px collapses, double-click
//   toggles). The member's choice persists as { l, r, lc, rc } (`fq-feed-rails-v2`, read through from
//   the old shared-width `fq-feed-rails` { w, lc, rc }); `null` means "auto by viewport", which CSS
//   resolves (members-shell.css) so the first paint is right before this island hydrates. Every
//   micro item shows a fixed tooltip beside the rail, hidden on scroll.
//
// The rail CONTENT is server-rendered and passed in; this island owns only the geometry. Which rails a
// route gets is the shell's existing decision (railFor / leftRailFor / chrome overrides), unchanged.

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  railFor,
  leftRailFor,
  mergeChrome,
  isFullViewportEditor,
  isFullWidthEditor,
  type ChromeOverrides,
} from '@/lib/layout/page-chrome'
import { PageAdminProvider } from '@/components/layout/page-admin-context'
import { EntityLayoutMount } from '@/components/entity-blocks/profile-layout-context'
import { AdminBar, type AdminBarState } from '@/components/layout/admin-bar/admin-bar'
import type { AppOverrides } from '@/lib/apps/overrides'
import type { Capability } from '@/lib/core/capabilities'
import type { WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/staff'
import type { CommunityRole } from '@/components/sidebar/right-sidebar'
import { isConsoleRoute } from '@/lib/nav/console-route'

export interface RailFaces {
  full: React.ReactNode
  micro: React.ReactNode
  tab: React.ReactNode
}

const KEY = 'fq-feed-rails-v2'
const OLD_KEY = 'fq-feed-rails'
const MICRO = 76
const MIN_W = 220
const MAX_W = 320
const DEFAULT_W = 248

type Side = 'L' | 'R'
type Tip = { text: string; sub: string; side: Side; y: number; x: number } | null

// The member's rail choice, one store for the page: read once from localStorage (the prototype's
// key), `null` everywhere meaning "auto". The server snapshot is the auto state, so the first paint
// matches the CSS defaults and a stored choice applies on hydration.
type Rails = { l: number | null; r: number | null; lc: boolean | null; rc: boolean | null }
const AUTO: Rails = { l: null, r: null, lc: null, rc: null }
let rails: Rails | null = null
const railSubs = new Set<() => void>()
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(MIN_W, Math.min(MAX_W, v)) : null)
const bool = (v: unknown) => (typeof v === 'boolean' ? v : null)
function readRails(): Rails {
  try {
    // The prototype's own migration: a v1 shared width `w` seeds both rails.
    const s = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY) || 'null') as Record<string, unknown> | null
    if (!s) return AUTO
    // Both rails load at the left rail's width (owner, 2026-10-13: "the same width on both sides when it
    // loads"); a right-rail drag holds for the visit and the next load mirrors the left again.
    const l = num(s.l ?? s.w)
    return { l, r: l ?? num(s.r ?? s.w), lc: bool(s.lc), rc: bool(s.rc) }
  } catch {
    return AUTO
  }
}
function railsSnapshot(): Rails {
  if (!rails) rails = readRails()
  return rails
}
function serverRails(): Rails {
  return AUTO
}
function subscribeRails(f: () => void) {
  railSubs.add(f)
  return () => {
    railSubs.delete(f)
  }
}
function setRails(next: Rails) {
  rails = next
  railSubs.forEach((f) => f())
}

function mode(v: boolean | null): 'auto' | 'micro' | 'full' {
  return v === null ? 'auto' : v ? 'micro' : 'full'
}

export function FqRailLayout({
  left,
  right,
  footer,
  chromeOverrides,
  admin,
  children,
}: {
  left: RailFaces
  right: RailFaces | null
  footer: React.ReactNode
  chromeOverrides?: ChromeOverrides
  admin: {
    role: CommunityRole | null
    staffRole: StaffRole | null
    webRole: WebRole
    caps: Capability[]
    appOverrides?: AppOverrides
  }
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? ''
  const cur = useSyncExternalStore(subscribeRails, railsSnapshot, serverRails)
  const { l, lc, rc } = cur
  const [drag, setDrag] = useState(false)
  const [tip, setTip] = useState<Tip>(null)
  const [settings, setSettings] = useState<AdminBarState>({ open: false, width: 288, resizing: false })
  const bodyRef = useRef<HTMLDivElement>(null)
  const endDrag = useRef<(() => void) | null>(null)

  const takeover = isFullViewportEditor(pathname)
  const edge = takeover || isFullWidthEditor(pathname) || isConsoleRoute(pathname)
  const showL = !edge && leftRailFor(pathname) === 'global'
  const showR = !edge && !!right && mergeChrome(railFor(pathname), chromeOverrides ?? {}, pathname) === 'global'
  const has = showL && showR ? 'lr' : showL ? 'l' : showR ? 'r' : 'none'
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/')

  const save = useCallback((next: Rails) => {
    setRails(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* not persisted; the choice still holds for this visit */
    }
  }, [])

  // Is a rail micro right now? An explicit choice wins; otherwise the viewport decides.
  const microNow = (side: Side) => {
    const v = side === 'L' ? lc : rc
    if (v !== null) return v
    return window.innerWidth < (side === 'L' ? 960 : 1240)
  }

  const toggle = (side: Side) => {
    const next = !microNow(side)
    save({ ...cur, [side === 'L' ? 'lc' : 'rc']: next })
  }

  const startDrag = (side: Side) => (e: React.PointerEvent) => {
    e.preventDefault()
    const x0 = e.clientX
    const wk = side === 'L' ? 'l' : 'r'
    const ck = side === 'L' ? 'lc' : 'rc'
    const w0 = cur[wk] ?? DEFAULT_W
    let live: Rails = cur
    setDrag(true)
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0
      const raw = side === 'L' ? w0 + dx : w0 - dx
      live = raw < 150 ? { ...live, [ck]: true } : { ...live, [wk]: Math.max(MIN_W, Math.min(MAX_W, Math.round(raw))), [ck]: false }
      setRails(live)
    }
    const up = () => {
      endDrag.current?.()
      setDrag(false)
      save(live)
    }
    endDrag.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      endDrag.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  useEffect(() => () => endDrag.current?.(), [])

  // The header's wordmark sits over the left rail at the rail's width (README §1 Logo): the kit sizes
  // the header's first column and the logo by --fq-rail, so the member's rail width feeds it (never
  // under 200px, so a micro rail keeps a readable wordmark).
  useEffect(() => {
    const root = bodyRef.current?.closest<HTMLElement>('[data-kit]')
    if (!root) return
    const apply = () => {
      if (!showL || window.innerWidth < 680) root.style.removeProperty('--fq-rail')
      else root.style.setProperty('--fq-rail', `${Math.max(microNow('L') ? MICRO : (l ?? DEFAULT_W), 200)}px`)
    }
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
    // microNow reads lc, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showL, l, lc])

  // A scroll hides the tooltip (README: "Hide it on mouse-leave and on scroll"). The rails no longer
  // follow the page (the 2026-10-14 export dropped the proportional scroll sync).
  useEffect(() => {
    if (!tip) return
    const hide = () => setTip(null)
    window.addEventListener('scroll', hide, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', hide, { capture: true })
  }, [tip])

  // Micro items carry data-tip / data-tip-sub; one delegated listener per rail draws the tooltip.
  const onOver = (side: Side) => (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]')
    if (!el) return
    const r = el.getBoundingClientRect()
    setTip({
      text: el.dataset.tip ?? '',
      sub: el.dataset.tipSub ?? '',
      side,
      y: r.top + r.height / 2,
      x: side === 'L' ? r.right + 12 : window.innerWidth - r.left + 12,
    })
  }
  const onOut = (e: React.MouseEvent) => {
    const to = e.relatedTarget as HTMLElement | null
    if (!to || !to.closest?.('[data-tip]')) setTip(null)
  }
  // A micro item on the right rail opens the rail (README §3 Micro: "A click expands the rail").
  const onRightClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-fqm-expand]')) {
      save({ ...cur, rc: false })
    }
  }

  const chevron = (
    <svg viewBox="0 0 12 12" aria-hidden>
      <path d="M7.5 3 4.5 6 7.5 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  const handle = (side: Side) => (
    <div className="fqm-handle">
      <button type="button" className="fqm-chev" onClick={() => toggle(side)} aria-label={side === 'L' ? 'Fold or open the left rail' : 'Fold or open the right rail'} title="Collapse or expand rail">
        {chevron}
      </button>
      <div
        className="fqm-drag"
        aria-hidden
        title="Drag to resize · double-click to collapse"
        onPointerDown={startDrag(side)}
        onDoubleClick={() => toggle(side)}
      />
    </div>
  )

  const style =
    cur.l !== null || cur.r !== null
      ? ({ ...(cur.l !== null && { '--fqm-l': `${cur.l}px` }), ...(cur.r !== null && { '--fqm-r': `${cur.r}px` }) } as React.CSSProperties)
      : undefined

  return (
    <PageAdminProvider value={{ role: admin.role, staffRole: admin.staffRole, webRole: admin.webRole, caps: new Set(admin.caps), appOverrides: admin.appOverrides }}>
      <EntityLayoutMount>
        <div
          ref={bodyRef}
          className="fqm-body"
          data-has={has}
          data-l={mode(lc)}
          data-r={mode(rc)}
          data-drag={drag ? '' : undefined}
          data-edge={edge ? '' : undefined}
          style={style}
        >
          {showL && (
            <aside className="fqm-rail fqm-rail-l" aria-label="Your shortcuts" onMouseOver={onOver('L')} onMouseOut={onOut}>
              <div className="fqm-rail-scroll">
                <div className="fqm-full">{left.full}</div>
                <div className="fqm-micro">{left.micro}</div>
              </div>
              {left.tab}
              {handle('L')}
            </aside>
          )}
          <main id="main" tabIndex={-1} className="fqm-center" data-tour-anchor="content">
            {children}
          </main>
          {showR && right && (
            <aside className="fqm-rail fqm-rail-r" aria-label="Your community" onMouseOver={onOver('R')} onMouseOut={onOut} onClick={onRightClick}>
              {handle('R')}
              <div className="fqm-rail-scroll">
                <div className="fqm-full">{right.full}</div>
                <div className="fqm-micro">{right.micro}</div>
              </div>
              {right.tab}
            </aside>
          )}
          {!isAdminRoute && !takeover && (
            <div className="fqm-adminbar" style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: settings.open ? settings.width : 0 }}>
              <AdminBar onStateChange={setSettings} />
            </div>
          )}
        </div>
      </EntityLayoutMount>
      {!edge && footer}
      {tip && (
        <div
          className="fqm-tip"
          role="tooltip"
          style={tip.side === 'L' ? { top: tip.y, left: tip.x } : { top: tip.y, right: tip.x }}
        >
          <b>{tip.text}</b>
          {tip.sub ? <small>{tip.sub}</small> : null}
        </div>
      )}
    </PageAdminProvider>
  )
}
