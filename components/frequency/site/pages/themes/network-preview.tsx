'use client'

// The client side of /themes/network (LIVE-1790): everything on the Theme Feature Page of the Network design system
// that follows the profile you pick. One provider holds the picked profile (and the full preview), and the pieces
// read it: the four surfaces in the hero, the preview stage, Inside the kit, Make it yours, the gallery and the
// Start band. The pictures are renders of the kit's own surfaces (public/themes/network-kit/shots). The frames are
// the design system's: a browser bar for the website and the Space, the iPhone 390 by 844 with a 370 by 824 screen,
// and the email card. Server markup shows the first profile, so the page reads without script. Tokens only; styles
// are in network-feature.css.
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  NETWORK_ACCENTS,
  NETWORK_BLOCKS,
  NETWORK_CORNERS,
  NETWORK_DISPLAY_FACES,
  NETWORK_EMAILS,
  NETWORK_KITS,
  NETWORK_MAIL_TYPES,
  NETWORK_PAGES,
  NETWORK_SURFACES,
  NETWORK_TOOLS,
  networkKit,
  networkShot,
  networkStartHref,
  type NetworkKit,
  type NetworkMailType,
  type NetworkSurface,
} from '@/lib/themes/network-feature-data'
import './network-feature.css'

export type NetworkSurfaceStatus = 'ready' | 'soon'
type Status = Record<NetworkSurface, NetworkSurfaceStatus>

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}
const pad = (n: number) => String(n).padStart(2, '0')

/* The picked profile and the full preview are one small shared store, so each piece below is its own island and the
   sections around them stay plain server markup (a provider around the page would hold back hydration of all of it). */
type Preview = { view: NetworkSurface; mail: NetworkMailType } | null
const store: { kit: string; pv: Preview; subs: Set<() => void> } = { kit: NETWORK_KITS[0].id, pv: null, subs: new Set() }
const emit = () => store.subs.forEach((f) => f())
const subscribe = (f: () => void) => {
  store.subs.add(f)
  return () => {
    store.subs.delete(f)
  }
}
const setKit = (id: string) => {
  if (store.kit === id) return
  store.kit = id
  emit()
}
const setPv = (pv: Preview) => {
  store.pv = pv
  emit()
}
const openPreview = (view: NetworkSurface, mail: NetworkMailType = 'note') => setPv({ view, mail })
const stepKit = (d: number) => {
  const i = NETWORK_KITS.findIndex((k) => k.id === store.kit)
  setKit(NETWORK_KITS[(i + d + NETWORK_KITS.length) % NETWORK_KITS.length].id)
}
const FIRST_KIT = NETWORK_KITS[0].id
function useKit(): { kit: NetworkKit; setKit: (id: string) => void; open: typeof openPreview } {
  const id = useSyncExternalStore(subscribe, () => store.kit, () => FIRST_KIT)
  return { kit: networkKit(id), setKit, open: openPreview }
}

/* ── Frames ─────────────────────────────────────────────────────────────────────────────────────────────────── */

/** The design system's iPhone: bezel, status bar with the island and the home bar around a 370 by 824 screen. */
export function NetworkPhone({ src, alt, sizes, priority = false, tone = 'light' }: { src: string; alt: string; sizes: string; priority?: boolean; tone?: 'light' | 'dark' }) {
  return (
    <span className="nf-ios">
      <span className="nf-ios-body">
        <span className="nf-ios-scr">
          <Image src={src} alt={alt} width={740} height={1648} sizes={sizes} priority={priority} />
          <span className={`nf-sb${tone === 'dark' ? ' dk' : ''}`} aria-hidden="true">
            <span>9:41</span>
            <span className="nf-isl" />
            <span className="nf-sbi">
              <i />
              <i />
              <i />
            </span>
          </span>
          <span className={`nf-hi${tone === 'dark' ? ' dk' : ''}`} aria-hidden="true" />
        </span>
      </span>
    </span>
  )
}

/** A browser frame (1440 by 900) around a website or Space picture. */
export function NetworkBrowser({ src, alt, url, width, height, sizes, priority = false }: { src: string; alt: string; url: string; width: number; height: number; sizes: string; priority?: boolean }) {
  return (
    <div className="nf-dv">
      <div className="nf-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <u>{url}</u>
      </div>
      <div className="nf-scr">
        <Image src={src} alt={alt} width={width} height={height} sizes={sizes} priority={priority} />
      </div>
    </div>
  )
}

/** The email card: the template cropped at 600 by 760 with a fade into the page. */
export function NetworkMail({ src, alt, sizes }: { src: string; alt: string; sizes: string }) {
  return (
    <div className="nf-ml">
      <Image src={src} alt={alt} width={600} height={1446} sizes={sizes} />
    </div>
  )
}

const URL_BAR: Record<'site' | 'space', string> = { site: 'yournetwork.org', space: 'frequency.com/spaces/yournetwork' }

/** One surface of one profile, in its frame. */
function Frame({ surface, kit, mail = 'note', sizes, priority = false }: { surface: NetworkSurface; kit: NetworkKit; mail?: NetworkMailType; sizes: string; priority?: boolean }) {
  const def = NETWORK_SURFACES.find((s) => s.id === surface)!
  const src = networkShot(kit.id, def.shot, mail)
  const alt = `Network, ${kit.name}: ${def.label.toLowerCase()}`
  if (surface === 'spotlight') return <NetworkPhone src={src} alt={alt} sizes={sizes} priority={priority} />
  if (surface === 'email') return <NetworkMail src={src} alt={alt} sizes={sizes} />
  return <NetworkBrowser src={src} alt={alt} url={URL_BAR[surface === 'space' ? 'space' : 'site']} width={def.width} height={def.height} sizes={sizes} priority={priority} />
}

function StatusPill({ s }: { s: NetworkSurfaceStatus }) {
  return <small className={`nf-st ${s}`}>{s === 'ready' ? 'Ready' : 'On the way'}</small>
}

/* ── The full preview ──────────────────────────────────────────────────────────────────────────────────────── */

export function NetworkPreviewHost() {
  const pv = useSyncExternalStore(subscribe, () => store.pv, () => null)
  const { kit } = useKit()
  useEffect(() => {
    if (!pv) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPv(null)
      if (e.key === 'ArrowLeft') stepKit(-1)
      if (e.key === 'ArrowRight') stepKit(1)
    }
    window.addEventListener('keydown', key)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', key)
    }
  }, [pv])
  if (!pv) return null
  return (
    <div className="nf-pvx" role="dialog" aria-modal="true" aria-label="Live preview">
      <div className="nf-pvx-top">
        <div className="nf-seg" role="group" aria-label="Surface">
          {NETWORK_SURFACES.map((s) => (
            <button key={s.id} type="button" aria-pressed={s.id === pv.view} onClick={() => setPv({ ...pv, view: s.id })}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="nf-kp">
          <button type="button" aria-label="Previous profile" onClick={() => stepKit(-1)}>
            ‹
          </button>
          <span style={vars({ '--c': kit.hex })}>
            <i />
            {kit.name}
            <small>
              {NETWORK_KITS.findIndex((k) => k.id === kit.id) + 1} / {NETWORK_KITS.length}
            </small>
          </span>
          <button type="button" aria-label="Next profile" onClick={() => stepKit(1)}>
            ›
          </button>
        </div>
        <button type="button" className="nf-x" aria-label="Close preview" onClick={() => setPv(null)}>
          ×
        </button>
      </div>
      <div className="nf-pvx-body" style={vars({ '--c': kit.hex })}>
        <div className="nf-pvx-fit" data-surface={pv.view}>
          <Frame surface={pv.view} kit={kit} mail={pv.mail} sizes="(max-width: 900px) 92vw, 960px" />
        </div>
      </div>
    </div>
  )
}

/* ── Hero: the four surfaces of the picked profile, flowing down one line ───────────────────────────────────── */

const PLACES: { n: string; name: string; qual?: string; surface: NetworkSurface; body: string; lives: string; wears: string; changes: string; button: string }[] = [
  {
    n: '01 · Day one',
    name: 'Spotlight',
    qual: 'Link Page',
    surface: 'spotlight',
    body: 'Your link-in-bio page. The same hero, ways in and next meetup your website opens with.',
    lives: 'Its own Spotlight link',
    wears: 'The full theme',
    changes: 'Your bio link gets an RSVP on the first tap.',
    button: 'Preview Spotlight',
  },
  {
    n: '02 · On the network',
    name: 'Space',
    qual: 'Profile',
    surface: 'space',
    body: 'Your page on Frequency, where people looking for their people find you. Frequency keeps its frame; the page wears your fonts, your accent and your offers.',
    lives: 'frequency.com/spaces/yournetwork',
    wears: 'Frequency, with your fonts and accent',
    changes: 'You are found by people already looking.',
    button: 'Preview Space',
  },
  {
    n: '03 · Your own domain',
    name: 'Website',
    surface: 'site',
    body: 'Meetups, membership, chapters, programs and a shop as you need them. Built from the same blocks, so nothing is written twice.',
    lives: 'yournetwork.org',
    wears: 'The full theme',
    changes: 'A complete site, without starting again.',
    button: 'Preview website',
  },
  {
    n: '04 · In the inbox',
    name: 'Email',
    qual: 'Template',
    surface: 'email',
    body: 'Four templates that wear your mark, face and accent: the newsletter, a welcome, the next few meetups and an RSVP receipt. Dates, tiers and names fill in from the same profile.',
    lives: 'Your subscribers’ inbox',
    wears: 'The theme, in tables that survive email clients',
    changes: 'Your list hears from you, and it looks like you.',
    button: 'Preview email',
  },
]

export function NetworkHeroFlow({ status }: { status: Status }) {
  const { kit, open } = useKit()
  const [mail, setMail] = useState<NetworkMailType>('note')
  const cascade = useRef<HTMLDivElement>(null)
  const path = useRef<SVGPathElement>(null)
  const glow = useRef<SVGPathElement>(null)

  // The line that joins the four frames: from the foot of one to the top of the next, drawn from where they sit.
  useEffect(() => {
    const c = cascade.current
    if (!c) return
    const draw = () => {
      const cr = c.getBoundingClientRect()
      const pts = [...c.querySelectorAll<HTMLElement>('.nf-cz-dev > *')].map((d) => {
        const r = d.getBoundingClientRect()
        return { x: r.left - cr.left + r.width / 2, t: r.top - cr.top, b: r.bottom - cr.top }
      })
      let p = ''
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]
        const z = pts[i + 1]
        const my = (a.b + z.t) / 2
        p += `${i ? ' ' : `M${a.x} ${a.b - 40}`} L${a.x} ${a.b} C${a.x} ${my} ${z.x} ${my} ${z.x} ${z.t}${i < pts.length - 2 ? ` M${z.x} ${z.b}` : ''}`
      }
      path.current?.setAttribute('d', p)
      glow.current?.setAttribute('d', p)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(c)
    window.addEventListener('resize', draw)
    window.addEventListener('load', draw)
    const t = window.setTimeout(draw, 400)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', draw)
      window.removeEventListener('load', draw)
      window.clearTimeout(t)
    }
  }, [])

  return (
    <div className="nf-flow" id="hz-stage" style={vars({ '--c': kit.hex })}>
      <div className="nf-cascade" ref={cascade}>
        <svg className="nf-line" aria-hidden="true">
          <defs>
            <linearGradient id="nf-czg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--fq-x-aqua-neon)" />
              <stop offset=".5" stopColor="var(--fq-x-magenta-neon)" />
              <stop offset="1" stopColor="var(--fq-x-sun-neon)" />
            </linearGradient>
          </defs>
          <path ref={path} fill="none" stroke="url(#nf-czg)" strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" />
          <path ref={glow} fill="none" stroke="url(#nf-czg)" strokeWidth="10" opacity=".18" />
        </svg>
        {PLACES.map((p, i) => (
          <div className={`nf-cz ${i % 2 ? 'r' : 'l'}`} key={p.name}>
            <div className="nf-cz-dev">
              <Frame surface={p.surface} kit={kit} mail={p.surface === 'email' ? mail : 'note'} sizes="(max-width: 900px) 92vw, 640px" priority={i === 0} />
            </div>
            <div className="nf-cz-tx">
              <div className="nf-cz-top">
                <span className="jn">{p.n}</span>
                {p.qual ? <small className="nf-q">{p.qual}</small> : null}
                <StatusPill s={status[p.surface]} />
              </div>
              <h3>{p.name}</h3>
              <p>{p.body}</p>
              {p.surface === 'email' ? (
                <div className="nf-mt" role="group" aria-label="Email template">
                  {NETWORK_MAIL_TYPES.map((t) => (
                    <button key={t.id} type="button" aria-pressed={t.id === mail} onClick={() => setMail(t.id)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <ul>
                <li>
                  <b>Lives at</b>
                  {p.lives}
                </li>
                <li>
                  <b>Wears</b>
                  {p.wears}
                </li>
              </ul>
              <p className="nf-out">
                <b>What changes</b>
                {p.changes}
              </p>
              <button type="button" className="btn btn-ghost fq-iri-rim nf-pbtn" onClick={() => open(p.surface, p.surface === 'email' ? mail : 'note')}>
                {p.button}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Today: the "with a Theme Kit" card takes the picked accent ─────────────────────────────────────────────── */

export function NetworkAccent({ className, children }: { className: string; children: React.ReactNode }) {
  const { kit } = useKit()
  return (
    <div className={className} style={vars({ '--c': kit.hex })}>
      {children}
    </div>
  )
}

/* ── Theme preview: surface and profile at left, one framed picture at right ────────────────────────────────── */

function KitList({ id, label, className, role }: { id?: string; label: string; className: string; role?: string }) {
  const { kit, setKit } = useKit()
  return (
    <div className={className} id={id} role={role ?? 'group'} aria-label={label}>
      {NETWORK_KITS.map((k) => (
        <button key={k.id} type="button" aria-pressed={k.id === kit.id} onClick={() => setKit(k.id)} style={vars({ '--c': k.hex })} title={k.who}>
          <i />
          <span>{k.name}</span>
        </button>
      ))}
    </div>
  )
}

export function NetworkTry() {
  const { kit, open } = useKit()
  const [surface, setSurface] = useState<NetworkSurface>('site')
  return (
    <div className="nf-hv">
      <div className="nf-hv-l">
        <div className="nf-seg nf-hv-surf" role="group" aria-label="Surface">
          {NETWORK_SURFACES.map((s) => (
            <button key={s.id} type="button" aria-pressed={s.id === surface} onClick={() => setSurface(s.id)}>
              {s.label.replace(' template', '')}
            </button>
          ))}
        </div>
        <KitList className="nf-hv-kits" label="Pick a profile" />
      </div>
      <div className="nf-hv-r">
        <div className="nf-hv-stage" data-surface={surface} style={vars({ '--c': kit.hex })}>
          <Frame surface={surface} kit={kit} sizes="(max-width: 900px) 92vw, 640px" />
          <button type="button" className="btn btn-ghost fq-iri-rim nf-hv-open" onClick={() => open(surface)}>
            Open full preview
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Inside the kit: five views over the picked profile's data ──────────────────────────────────────────────── */

type InsView = 'pages' | 'blocks' | 'tools' | 'emails' | 'look'

function Card({ kick, state, title, text, off = false }: { kick: string; state?: string; title: React.ReactNode; text: string; off?: boolean }) {
  return (
    <div className={`nf-ic${off ? ' off' : ''}`}>
      <div className="k">
        <span>{kick}</span>
        {state ? <em>{state}</em> : null}
      </div>
      <b>{title}</b>
      <span>{text}</span>
    </div>
  )
}

const toolName = (id: string) => NETWORK_TOOLS.find((t) => t.id === id)?.name ?? id
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function NetworkInsideName() {
  const { kit } = useKit()
  return <b className="nf-ins-kit">{kit.name}</b>
}

export function NetworkInside() {
  const { kit } = useKit()
  const [view, setView] = useState<InsView>('pages')
  const on = (tool: string) => tool === 'core' || kit.tools.includes(tool)
  const nav: [InsView, number, string][] = [
    ['pages', NETWORK_PAGES.length, 'Pages'],
    ['blocks', NETWORK_BLOCKS.length, 'Home blocks'],
    ['tools', NETWORK_TOOLS.length, 'Tools'],
    ['emails', NETWORK_EMAILS.length, 'Email templates'],
    ['look', NETWORK_KITS.length, 'Looks'],
  ]
  return (
    <div className="nf-ins">
      <nav className="nf-ins-nav" aria-label="Inside the kit">
        {nav.map(([id, n, label]) => (
          <button key={id} type="button" aria-pressed={id === view} onClick={() => setView(id)}>
            <b>{n}</b>
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="nf-ins-body" style={vars({ '--c': kit.hex })}>
        {view === 'pages' ? (
          <div className="nf-ins-grid">
            {NETWORK_PAGES.map(([n, t, tool]) => (
              <Card key={n} kick={tool === 'core' ? 'Always on' : toolName(tool)} state={on(tool) ? 'In this kit' : undefined} title={n} text={t} off={!on(tool)} />
            ))}
          </div>
        ) : null}
        {view === 'blocks' ? (
          <div className="nf-ins-grid">
            {NETWORK_BLOCKS.map(([id, n, tool, stage]) => {
              const inKit = kit.blocks.includes(id)
              const lay = kit.blockLayouts[id]
              const text = tool === 'core' ? `Needs no tool.${lay ? ` Shown as ${lay} in this kit.` : ''}` : `Appears when ${toolName(tool)} is on.${lay ? ` Shown as ${lay}.` : ''}`
              return <Card key={id} kick={stage} state={inKit ? (lay ? `${lay} layout` : 'On') : undefined} title={n} text={text} off={!inKit} />
            })}
          </div>
        ) : null}
        {view === 'tools' ? (
          <div className="nf-ins-grid">
            {NETWORK_TOOLS.map((t) => (
              <Card key={t.id} kick={t.stage} state={on(t.id) ? 'Starts on' : undefined} title={t.name} text={t.blurb} off={!on(t.id)} />
            ))}
          </div>
        ) : null}
        {view === 'emails' ? (
          <div className="nf-ins-grid">
            {NETWORK_EMAILS.map(([n, w, t]) => (
              <Card key={n} kick={w} state={`Wears ${kit.name}`} title={n} text={t} />
            ))}
          </div>
        ) : null}
        {view === 'look' ? (
          <div className="nf-ins-look">
            <div className="nf-ic">
              <div className="k">
                <span>Type</span>
                <em>
                  {kit.fonts.display} · {kit.fonts.label}
                </em>
              </div>
              <div className="big">
                Aa <em>Aa</em>
              </div>
              <span>
                {kit.fonts.display} for headlines, {kit.fonts.label} for labels and body text.
              </span>
            </div>
            <div className="nf-ic">
              <div className="k">
                <span>Colour</span>
                <em>{cap(kit.mail)}</em>
              </div>
              <div className="nf-sw" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <span>Black, bone and one accent ramp, checked for contrast on both grounds.</span>
            </div>
            <div className="nf-ic">
              <div className="k">
                <span>Shape</span>
              </div>
              <b className="cp">
                {kit.look.corners} corners · {kit.look.spacing} spacing
              </b>
              <span>
                Header: {kit.look.header}. Footer: {kit.look.footer}. Set per kit, changeable per site.
              </span>
            </div>
            <div className="nf-ic">
              <div className="k">
                <span>Voice</span>
              </div>
              <b>
                {kit.hero.title} <em className="v">{kit.hero.em}</em>
              </b>
              <span>{kit.who}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ── Make it yours ──────────────────────────────────────────────────────────────────────────────────────────── */

export function NetworkCustomise() {
  const { kit } = useKit()
  const [accent, setAccent] = useState('')
  const [face, setFace] = useState<string>(NETWORK_DISPLAY_FACES[0])
  const [corners, setCorners] = useState<string>(NETWORK_CORNERS[0])
  const hex = accent || kit.hex
  return (
    <div className="nf-cus">
      <div className="nf-cus-c">
        <div className="f">
          <label id="nf-cus-acc">Accent</label>
          <div className="nf-swr" role="group" aria-labelledby="nf-cus-acc">
            <button type="button" aria-pressed={accent === ''} aria-label="Kit default" title="Kit default" className="def" onClick={() => setAccent('')} />
            {NETWORK_ACCENTS.map((a) => (
              <button key={a.id} type="button" aria-pressed={accent === a.hex} aria-label={cap(a.id)} title={cap(a.id)} style={vars({ '--c': a.hex })} onClick={() => setAccent(a.hex)} />
            ))}
          </div>
        </div>
        <div className="f">
          <label id="nf-cus-font">Display face</label>
          <div className="nf-bseg" role="group" aria-labelledby="nf-cus-font">
            {NETWORK_DISPLAY_FACES.map((n) => (
              <button key={n} type="button" aria-pressed={face === n} onClick={() => setFace(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="f">
          <label id="nf-cus-cor">Corners</label>
          <div className="nf-bseg" role="group" aria-labelledby="nf-cus-cor">
            {NETWORK_CORNERS.map((n) => (
              <button key={n} type="button" aria-pressed={corners === n} onClick={() => setCorners(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <p className="nf-cus-note">Coming soon: these choices carry into the site editor. The picture shows the kit’s own look for now.</p>
      </div>
      <div className="nf-cus-p" style={vars({ '--c': hex })}>
        <NetworkBrowser src={networkShot(kit.id, 'site')} alt={`Network, ${kit.name}: website`} url={URL_BAR.site} width={1280} height={800} sizes="(max-width: 900px) 92vw, 800px" />
      </div>
    </div>
  )
}

/* ── Thirteen kits: the full spread of one profile, a caption, a filmstrip ──────────────────────────────────── */

export function NetworkGallery() {
  const { kit, setKit, open } = useKit()
  const strip = useRef<HTMLDivElement>(null)
  const idx = NETWORK_KITS.findIndex((k) => k.id === kit.id)
  const go = (d: number) => setKit(NETWORK_KITS[(idx + d + NETWORK_KITS.length) % NETWORK_KITS.length].id)
  useEffect(() => {
    const s = strip.current
    const t = s?.querySelector<HTMLElement>('.gt[aria-pressed="true"]')
    if (s && t) s.scrollTo({ left: t.offsetLeft - s.clientWidth / 2 + t.clientWidth / 2, behavior: 'smooth' })
  }, [kit.id])
  const tools = kit.tools.map(toolName).join(' · ')
  const spread: { cls: string; surface: NetworkSurface; label: string; sub: string; src: string; w: number; h: number }[] = [
    { cls: 'web', surface: 'site', label: 'Website', sub: 'yournetwork.org · the full theme', src: networkShot(kit.id, 'site'), w: 1280, h: 800 },
    { cls: 'ph b', surface: 'space', label: 'Space', sub: 'On Frequency', src: networkShot(kit.id, 'spacephone'), w: 375, h: 900 },
    { cls: 'ph', surface: 'spotlight', label: 'Spotlight', sub: 'Link in bio', src: networkShot(kit.id, 'spot'), w: 740, h: 1648 },
    { cls: 'mail', surface: 'email', label: 'Email', sub: 'Four templates · Inbox', src: networkShot(kit.id, 'email'), w: 600, h: 1446 },
  ]
  return (
    <div className="nf-gal">
      <div className="nf-gal-main" style={vars({ '--c': kit.hex })}>
        <div className="gm-top">
          <div className="tags">
            <span className="tag2">
              <i />
              {kit.name}
              <small>
                {pad(idx + 1)} / {NETWORK_KITS.length}
              </small>
            </span>
            <span className="tag2">
              {kit.fonts.display} · {kit.fonts.label}
            </span>
          </div>
          <div className="gnav">
            <button type="button" aria-label="Previous profile" onClick={() => go(-1)}>
              ‹
            </button>
            <button type="button" aria-label="Next profile" onClick={() => go(1)}>
              ›
            </button>
          </div>
        </div>
        <div className="spread">
          {spread.map((s) => (
            <button key={s.cls} type="button" className={s.cls} aria-label={`Preview the ${s.label.toLowerCase()}`} onClick={() => open(s.surface)}>
              <span className="fr">
                <Image src={s.src} alt="" width={s.w} height={s.h} sizes="(max-width: 800px) 46vw, 600px" loading="lazy" />
              </span>
              <span className="lab">
                <b>{s.label}</b>
                <small>{s.sub}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="nf-gal-cap" style={vars({ '--c': kit.hex })}>
        <div>
          <b>
            {kit.hero.title} <em>{kit.hero.em}</em>
          </b>
          <span>{kit.who}</span>
          <div className="meta2">
            <span>{tools}</span>
            <span>·</span>
            <span>Website · Space · Spotlight · Email</span>
          </div>
        </div>
        <div className="ctas">
          <button type="button" className="btn btn-ghost fq-iri-rim" onClick={() => open('site')}>
            Live preview
          </button>
          <Link className="btn fq-iri-btn" href={networkStartHref(kit.id)}>
            Adopt this kit
          </Link>
        </div>
      </div>
      <div className="nf-gal-strip" ref={strip}>
        {NETWORK_KITS.map((k, i) => (
          <button key={k.id} type="button" className="gt" aria-pressed={k.id === kit.id} onClick={() => setKit(k.id)} style={vars({ '--c': k.hex })}>
            <Image src={networkShot(k.id, 'site')} alt="" width={1280} height={800} sizes="160px" loading="lazy" />
            <span className="gl">
              <i />
              <span>{k.name}</span>
              <small>{pad(i + 1)}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Start ──────────────────────────────────────────────────────────────────────────────────────────────────── */

export function NetworkStartKits() {
  return <KitList className="nf-start-kits" label="Choose a kit" />
}

export function NetworkStartActions() {
  const { kit, open } = useKit()
  return (
    <>
      <Link className="btn fq-iri-btn" href={networkStartHref(kit.id)}>
        Start with {kit.name}
      </Link>
      <button type="button" className="btn btn-ghost fq-iri-rim" onClick={() => open('site')}>
        Live preview
      </button>
    </>
  )
}

/** A button to Create a Space that follows the picked profile ("Start your Spotlight" in the hero). */
export function NetworkStartLink({ className, children }: { className: string; children: React.ReactNode }) {
  const { kit } = useKit()
  return (
    <Link className={className} href={networkStartHref(kit.id)}>
      {children}
    </Link>
  )
}
