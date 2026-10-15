import { IndexHeader } from '@/components/templates/index-header'
// THE DISCOVER DIRECTORIES under the Frequency design: the pieces every /discover index and detail body
// shares (Circles, Journeys, Practices, Partners, Spaces, Channels). Written in the "site" kit's own
// markup (.phero, .crumbs, .sh, .g3 > .pc, .subnav, .panel), plus the few directory-only styles in
// app/themes/frequency/site-discover.css. Server components, no client JS.
//
// The reference has no directory template; these follow People.html and Spaces.html (a .phero hero, a
// labelled section head, the feature card grid) and members/Circle.html + Journey.html for detail
// anatomy (a reading column beside a side panel holding the one action).
//
// Cards here are NOT `.pop` cards: the kit holds a `.pop` at opacity 0 until the FX island reveals it,
// and a directory of two hundred Circles should be readable the moment it paints.

import '@/app/themes/active/site-discover'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { aura } from '../shared/parts'

export { photo } from '../shared/parts'

export interface Crumb {
  label: string
  href?: string
}

/** The page wrapper: pins the side colour (People aqua, Spaces sun) without adding a box. */
export function DirPage({ side, children }: { side: 'p' | 'e'; children: ReactNode }) {
  return (
    <div className="pa-page pa-discover" data-pa-side={side} data-motion-scope style={{ display: 'contents' }}>
      {children}
    </div>
  )
}

/** The directory hero: the kit's `.phero`, shorter, with the breadcrumb trail the JSON-LD names. */
export function DirHero({
  compact = false,
  crumbs,
  title,
  lede,
  image,
  facts,
  children,
}: {
  compact?: boolean
  crumbs: Crumb[]
  title: ReactNode
  lede?: ReactNode
  /** A photo URL. Absent, the hero is the plain Stage band. */
  image?: string | null
  /** One short line of facts under the lede (counts, place, cadence). */
  facts?: ReactNode
  /** The hero actions (`.btn` links). */
  children?: ReactNode
}) {
  if (compact) return <section className="fq-index-public"><div className="wrap"><IndexHeader title={title} description={lede} trail={[{ href: '/', label: 'Home' }, ...crumbs.filter((c): c is Crumb & { href: string } => !!c.href)]} action={children} secondary={facts} adminBar={false} /></div></section>
  return (
    <section className="phero dd-hero" data-energy="flow" data-screen-label="01 Hero">
      {image && <div className="bg" style={{ backgroundImage: `url('${image}')` }} />}
      <div className="fq-aura" style={aura(0.28)} />
      <div className="shade" />
      <div className="fq-grain" />
      <div className="wrap">
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={`${i}:${c.label}`} style={{ display: 'contents' }}>
              {i > 0 && <span aria-hidden="true">/</span>}
              {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
            </span>
          ))}
        </nav>
        <h1 className="h-xl">{title}</h1>
        {lede && <p>{lede}</p>}
        {facts && <p className="dd-facts">{facts}</p>}
        {children && <div className="ctas">{children}</div>}
      </div>
    </section>
  )
}

/** One fact in the hero's fact line. */
export function Fact({ icon, children }: { icon: FqIconName; children: ReactNode }) {
  return (
    <span>
      <FqIcon name={icon} />
      {children}
    </span>
  )
}

/** A directory section: the kit's labelled head (`.sh`), then the body. */
export function DirSection({
  label,
  meta,
  title,
  lede,
  id,
  children,
}: {
  label: string
  meta?: ReactNode
  title?: ReactNode
  lede?: ReactNode
  id?: string
  children: ReactNode
}) {
  return (
    <section className="sec dd-sec" id={id}>
      <div className="wrap">
        <div className="sh">
          <div className="label">
            <b>{label}</b>
            {meta}
          </div>
          {title && <h2 className="h-l">{title}</h2>}
          {lede && <p className="body-l">{lede}</p>}
        </div>
        {children}
      </div>
    </section>
  )
}

export interface Chip {
  href: string
  label: string
  on: boolean
}

/** Filter pills: the kit's `.subnav`, real links, so a filtered view stays shareable and server-side. */
export function DirChips({ label, chips }: { label: string; chips: Chip[] }) {
  return (
    <nav className="subnav dd-chips" aria-label={label}>
      {chips.map((c) => (
        <Link key={c.href} href={c.href} className={c.on ? 'on' : undefined} aria-current={c.on ? 'page' : undefined}>
          {c.label}
        </Link>
      ))}
    </nav>
  )
}

/** The card grid (the kit's `.g3`, two across on a tablet). */
export function DirGrid({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className="g3 dd-grid" aria-label={label}>
      {children}
    </ul>
  )
}

/** One card: the kit's `.pc`, the whole card one link. */
export function DirCard({
  href,
  icon,
  image,
  kicker,
  tags,
  title,
  body,
  meta,
}: {
  href: string
  icon: FqIconName
  image?: string | null
  kicker?: string | null
  tags?: (string | null | undefined | false)[]
  title: string
  body?: string | null
  meta?: (string | null | undefined | false)[]
}) {
  const t = (tags ?? []).filter(Boolean) as string[]
  const m = (meta ?? []).filter(Boolean) as string[]
  return (
    <li>
      <Link className="pc dd-card" href={href}>
        {image && (
          <span className="ph">
            {/* eslint-disable-next-line @next/next/no-img-element -- an owner-uploaded URL; the kit sizes .pc .ph img */}
            <img src={image} alt="" loading="lazy" decoding="async" />
          </span>
        )}
        <span className="row">
          <span className="ic">
            <FqIcon name={icon} />
          </span>
          {t.length > 0 && (
            <span className="tg">
              {t.map((x) => (
                <i key={x}>{x}</i>
              ))}
            </span>
          )}
        </span>
        {kicker && <span className="v">{kicker}</span>}
        <h3>{title}</h3>
        {body && <p className="dd-clamp">{body}</p>}
        {m.length > 0 && (
          <span className="dd-meta">
            {m.map((x) => (
              <span key={x}>{x}</span>
            ))}
          </span>
        )}
      </Link>
    </li>
  )
}

/** The honest empty state: what is true now, and the one useful next step. */
export function DirEmpty({ title, body, children }: { title: string; body: ReactNode; children?: ReactNode }) {
  return (
    <div className="dd-empty">
      <h3>{title}</h3>
      <p>{body}</p>
      {children && <div className="ctas">{children}</div>}
    </div>
  )
}

/** A detail page's body: the reading column beside the sticky side panel. */
export function DetailBody({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <section className="sec dd-sec">
      <div className="wrap split dd-split">
        <div className="dd-main">{main}</div>
        <aside className="stack">{side}</aside>
      </div>
    </section>
  )
}

/** The side panel holding a detail page's one action. */
export function ActionPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="panel dd-panel">
      <h2>{title}</h2>
      {children}
    </div>
  )
}

/** "1 member" / "12 members". */
export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}
