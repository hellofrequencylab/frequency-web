import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { type SiteLinkMap } from '@/lib/sites/house-theme'
import { InlineText } from '@/components/sites/inline-text'
import { FreeHumanGlyph, hasFreeHumanGlyph } from '@/components/sites/free-human-glyph'
import { FreeHumanBookingForm } from '@/components/sites/free-human-booking-form'
import { freeHumanAvg } from '@/lib/sites/free-human-photos'
import { freeHumanDayLine, freeHumanKind, freeHumanStamp, freeHumanUpcoming, type FreeHumanEventRow } from '@/lib/sites/free-human-events'
import {
  FREE_HUMAN_BOOKS, FREE_HUMAN_EVENTS, FREE_HUMAN_HERO, FREE_HUMAN_LINEAGE, FREE_HUMAN_LYRIC, FREE_HUMAN_SEASONS, FREE_HUMAN_SPEAKING, FREE_HUMAN_WORKSHOPS,
} from '@/lib/sites/free-human-home'
import { LINK_HINT, VOICE_HINT, area, arr, block, cls, hrefOf, image, img, rel, str, text, type Common, type Props } from './midnight'
import type { ComponentConfig } from '@/lib/page-editor/types'

// ── The Free Human block family (Free Human Movement design system, "Website", 2026-10) ──────────────────────
// Every section of the design's Home is one registered block here, in the design's markup: the hero, the four seasons, the
// lyric band, workshops, events, books, speaking and lineage. Each carries four ground fields (ground, edge, texture, wander)
// so an owner can re-pace a page without leaving the theme. Server Components, but for the booking form. Live blocks read the
// Space's own events from `puck.metadata.space` and fall back to the rows the owner wrote. Every look is the Free Human skin's
// (components/sites/free-human-blocks-css.ts), tokens only.

// ── Grounds ──────────────────────────────────────────────────────────────────────────────────

const GROUND_CLASS: Record<string, string> = {
  paper: '',
  day: 'fh-lazure fh-limewash fh-grain',
  gold: 'fh-paper-gold fh-g-gold',
  night: 'fh-sanctuary fh-grain',
  sunset: 'fh-paper-gold fh-g-sunset',
  sky: 'fh-sky',
}
const EDGE_CLASS: Record<string, string> = { flow: 'fh-flow', 'flow-top': 'fh-flow-t', 'flow-bottom': 'fh-flow-b' }
const TEXTURES = ['plant', 'earth', 'water', 'fire', 'wind']
const DARK = new Set(['night', 'sky'])

/** The drifting layer: a few orbs, petals and motes, placed by hand so a render never differs from the last. */
const WANDER: { kind: 'orb' | 'petal' | 'mote'; x: string; y: string; s: string; d: string; delay: string; c?: string; k?: string }[] = [
  { kind: 'orb', x: '-6%', y: '4%', s: '420px', d: '32s', delay: '0s', c: 'color-mix(in srgb, var(--fh-saffron-300) 40%, transparent)' },
  { kind: 'orb', x: '70%', y: '52%', s: '380px', d: '38s', delay: '-9s', c: 'color-mix(in srgb, var(--fh-rose-200) 45%, transparent)' },
  { kind: 'petal', x: '82%', y: '8%', s: '14px', d: '26s', delay: '-4s' },
  { kind: 'petal', x: '58%', y: '2%', s: '10px', d: '31s', delay: '-14s' },
  { kind: 'mote', x: '14%', y: '38%', s: '5px', d: '22s', delay: '-3s' },
  { kind: 'mote', x: '46%', y: '70%', s: '4px', d: '27s', delay: '-11s', k: 'b' },
  { kind: 'mote', x: '88%', y: '34%', s: '6px', d: '24s', delay: '-7s', k: 'c' },
]

function Wander({ orbs }: { orbs: boolean }) {
  return (
    <div className="fh-wander" aria-hidden="true">
      {WANDER.filter((w) => orbs || w.kind !== 'orb').map((w, i) => (
        <span key={i} className={cls(`fh-${w.kind}`, w.k)} style={{ ['--x' as string]: w.x, ['--y' as string]: w.y, ['--s' as string]: w.s, ['--d' as string]: w.d, ['--delay' as string]: w.delay, ...(w.c ? { ['--c' as string]: w.c } : {}) }} />
      ))}
    </div>
  )
}

export function Ground({ p, name, pad, vis, children }: { p: Props; name: string; pad?: string; vis?: string; children: ReactNode }) {
  const ground = str(p.ground) in GROUND_CLASS ? str(p.ground) : 'day'
  const texture = TEXTURES.includes(str(p.texture)) ? str(p.texture) : ''
  return (
    <section className={cls('fh-sec', `fh-${name}`, GROUND_CLASS[ground], EDGE_CLASS[str(p.edge)], pad, vis)} data-ground={ground}>
      {texture && <div className={cls('fh-ground-tex', `fh-tex-${texture}${DARK.has(ground) ? '-light' : ''}`)} data-tex={texture} aria-hidden="true" />}
      {p.wander !== false && <Wander orbs={ground !== 'paper'} />}
      {children}
    </section>
  )
}

const groundFields = {
  ground: { type: 'select', label: 'Ground', options: [{ label: 'Paper', value: 'paper' }, { label: 'Day', value: 'day' }, { label: 'Gold', value: 'gold' }, { label: 'Night', value: 'night' }, { label: 'Sunset', value: 'sunset' }, { label: 'Sky', value: 'sky' }] },
  edge: { type: 'select', label: 'Edge', options: [{ label: 'Flat', value: 'flat' }, { label: 'Flows into the next', value: 'flow' }, { label: 'Flows in from above', value: 'flow-top' }, { label: 'Flows out below', value: 'flow-bottom' }] },
  texture: { type: 'select', label: 'Texture', options: [{ label: 'None', value: 'none' }, ...TEXTURES.map((v) => ({ label: v[0].toUpperCase() + v.slice(1), value: v }))] },
  wander: { type: 'radio', label: 'Drifting petals and light', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] },
} as const

const head = { eyebrow: text('Small label'), title: area('Heading', VOICE_HINT) }
const shapeField = { type: 'select', label: 'Frame', options: [{ label: 'Arch', value: 'arch' }, { label: 'Egg', value: 'egg' }, { label: 'Circle', value: 'circle' }, { label: 'Pebble', value: 'pebble' }, { label: 'Soft', value: 'soft' }] } as const
const glyphField = { type: 'text', label: 'Mark', hint: 'A Free Human mark name, like bloom or full-moon.' } as const

// ── Pieces ──────────────────────────────────────────────────────────────────────────────────

function Btn({ label, href, kind = 'primary', metadata, arrow = false, resolved = false }: { label: string; href: string; kind?: 'primary' | 'gilt' | 'secondary' | 'ghost' | 'deep'; metadata?: Props; arrow?: boolean; resolved?: boolean }) {
  // `resolved`: the href is already a served path (a live event's own page), not a `~/` link to map.
  const to = label ? (resolved ? href || null : hrefOf(href, metadata)) : null
  if (!to) return null
  return (
    <a className={cls('hs-btn', `hs-btn-${kind}`)} href={to} {...rel(to)}>
      <span>{label}</span>
      {arrow && <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />}
    </a>
  )
}

/** A photo in a shape. The loading colour is the photo's own average when it is from the library. */
function Frame({ src, alt = '', shape, pos, className, gilt = 'light', children }: { src: string | null; alt?: string; shape: string; pos?: string; className?: string; gilt?: 'light' | 'dark' | false; children?: ReactNode }) {
  const avg = src ? freeHumanAvg(src) : null
  return (
    <figure className={cls('fh-frame', gilt === 'light' && 'fh-gilt', gilt === 'dark' && 'fh-gilt-dark', className)} data-shape={shape} style={avg ? { background: avg } : undefined}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
        <img src={src} alt={alt} loading="lazy" style={pos ? { objectPosition: pos } : undefined} />
      )}
      {children}
    </figure>
  )
}

function Mark({ name, size = 24 }: { name: string; size?: number }) {
  return hasFreeHumanGlyph(name) ? <FreeHumanGlyph name={name} size={size} /> : null
}

function Heading({ p, center, split, action }: { p: Props; center?: boolean; split?: boolean; action?: ReactNode }) {
  if (!str(p.eyebrow) && !str(p.title) && !str(p.aside) && !str(p.lead)) return null
  return (
    <div className={cls('fh-head', center && 'fh-head--center', split && 'fh-head--split')}>
      <div className="fh-head-copy">
        {str(p.eyebrow) && <span className="fh-eyebrow">{str(p.eyebrow)}</span>}
        {str(p.title) && <h2 className="fh-sec-title"><InlineText text={str(p.title)} /></h2>}
        {str(p.lead) && <p className="fh-lead">{str(p.lead)}</p>}
      </div>
      {str(p.aside) && <p className="fh-aside">{str(p.aside)}</p>}
      {action}
    </div>
  )
}

// ── Hero ─────────────────────────────────────────────────────────────────────────────────────

function Hero({ p, metadata, pad, vis }: Common) {
  const main = img(p.image)
  const style = str(p.primaryStyle) === 'gilt' ? 'gilt' : 'primary'
  return (
    <Ground p={p} name="hero" pad={pad} vis={vis}>
      <div className="fh-row">
        <div className="fh-hero-copy">
          {str(p.badge) && <span className="fh-badge" data-tone="saffron"><span className="fh-badge-dot" aria-hidden="true" />{str(p.badge)}</span>}
          <h1 className="fh-hero-title"><InlineText text={str(p.title)} /></h1>
          {str(p.lead) && <p className="fh-hero-lead">{str(p.lead)}</p>}
          <div className="fh-actions">
            <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} kind={style} metadata={metadata} arrow />
            <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind="ghost" metadata={metadata} />
          </div>
        </div>
        <div className="fh-hero-art">
          {p.rays !== false && <div className="fh-rays fh-turn" aria-hidden="true" />}
          <div className="fh-halo fh-breathe" aria-hidden="true" />
          <Frame src={main} alt={str(p.alt)} shape="arch" pos={str(p.pos)} className="fh-hero-main" />
          <Frame src={img(p.eggImage)} alt="" shape="egg" pos="center 40%" gilt={false} className="fh-hero-egg" />
          <Frame src={img(p.sunImage)} alt="" shape="circle" gilt={false} className="fh-hero-sun fh-sway" />
          <Frame src={img(p.pebbleImage)} alt="" shape="pebble" gilt={false} className="fh-hero-pebble" />
        </div>
      </div>
    </Ground>
  )
}

// ── Seasons ──────────────────────────────────────────────────────────────────────────────────

function Seasons({ p, metadata, pad, vis }: Common) {
  const items = arr(p.seasons)
  const badges = Array.isArray(p.badges) ? (p.badges as unknown[]).map(str).filter(Boolean) : []
  return (
    <Ground p={p} name="seasons" pad={pad} vis={vis}>
      <div className="fh-row">
        <Heading p={p} center />
        <div className="fh-seasons-grid">
          {items.map((s, i) => {
            const to = hrefOf(str(s.href), metadata)
            const Tag = to ? 'a' : 'div'
            return (
              <Tag key={i} className="fh-season" data-season={str(s.season)} {...(to ? { href: to, ...rel(to) } : {})}>
                <Frame src={img(s.image)} alt={str(s.alt)} shape="arch" pos={str(s.pos)} />
                <span className="fh-seal"><Mark name={str(s.glyph)} size={26} /></span>
                <span className="fh-season-tag">{(str(s.season) === 'fall' ? 'autumn' : str(s.season)).toUpperCase()}</span>
                <span className="fh-season-name">{str(s.name)}</span>
                <p>{str(s.body)}</p>
              </Tag>
            )
          })}
        </div>
        <div className="fh-seasons-foot">
          <Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} metadata={metadata} arrow />
          {badges.map((b) => <span key={b} className="fh-badge" data-tone="sage">{b}</span>)}
        </div>
      </div>
    </Ground>
  )
}

// ── Lyric ────────────────────────────────────────────────────────────────────────────────────

function Lyric({ p, pad, vis }: Common) {
  const feelings = arr(p.feelings)
  return (
    <Ground p={p} name="lyric-band" pad={pad} vis={vis}>
      <div className="fh-row">
        <div className="fh-lyric-sun" aria-hidden="true"><div className="fh-rays fh-turn" /><div className="fh-halo fh-breathe" /></div>
        <p className="fh-lyric-line"><InlineText text={str(p.line)} /></p>
        {feelings.length > 0 && (
          <ul className="fh-feelings">
            {feelings.map((f, i) => (
              <li key={i} className="fh-feeling"><span className="fh-feeling-seal"><Mark name={str(f.glyph)} size={24} /></span><span className="fh-feeling-label">{str(f.label)}</span></li>
            ))}
          </ul>
        )}
        {str(p.note) && <p className="fh-lyric-note">{str(p.note)}</p>}
        <div className="fh-wave-band" aria-hidden="true" />
      </div>
    </Ground>
  )
}

// ── Workshops ────────────────────────────────────────────────────────────────────────────────

const eventHref = (e: FreeHumanEventRow, metadata: Props | undefined) => {
  if (!e.slug) return null
  const origin = (metadata?.links as SiteLinkMap | undefined)?.origin
  return origin ? `${origin}/events/${e.slug}` : `/events/${e.slug}`
}

const where = (e: FreeHumanEventRow) => [e.location, e.priceLabel].map((x) => (x ?? '').trim()).filter(Boolean).join(' · ')

function Workshops({ p, metadata, now, pad, vis }: Common) {
  const rows = arr(p.rows)
  const count = Math.max(1, Math.min(6, Number(p.count) || 3))
  const tag = str(p.tag).toLowerCase()
  const space = metadata?.space as { events?: unknown; series?: unknown } | undefined
  const live = freeHumanUpcoming(space, now ?? new Date()).filter((e) => (tag ? freeHumanKind(e.title).id === tag : true)).slice(0, count)
  const cards = live.length
    ? live.map((e, i) => ({ when: [freeHumanDayLine(e.startsAt), where(e)].filter(Boolean).join(' · '), title: e.title, body: (e.description ?? '').trim(), image: e.coverUrl ?? str(rows[i]?.image), pos: str(rows[i]?.pos) || 'center', shape: str(rows[i]?.shape) || 'arch', href: eventHref(e, metadata) ?? '', resolved: true }))
    : rows.slice(0, count).map((r) => ({ when: [str(r.when), str(r.mode)].filter(Boolean).join(' · '), title: str(r.title), body: str(r.body), image: str(r.image), pos: str(r.pos), shape: str(r.shape) || 'arch', href: str(r.href), resolved: false }))
  return (
    <Ground p={p} name="workshops" pad={pad} vis={vis}>
      <div className="fh-row">
        <Heading p={p} split />
        <div className="fh-workshop-grid">
          {cards.map((c, i) => (
            <article key={i} className="fh-workshop">
              <Frame src={img(c.image)} alt="" shape={c.shape} pos={c.pos} />
              {c.when && <span className="fh-workshop-when">{c.when}</span>}
              <h3 className="fh-workshop-title"><InlineText text={c.title} /></h3>
              {c.body && <p>{c.body}</p>}
              <Btn label={str(p.buttonLabel)} href={c.href} kind="ghost" metadata={metadata} resolved={c.resolved} arrow />
            </article>
          ))}
        </div>
      </div>
    </Ground>
  )
}

// ── Events ───────────────────────────────────────────────────────────────────────────────────

function Events({ p, metadata, now, pad, vis }: Common) {
  const count = Math.max(1, Math.min(8, Number(p.count) || 4))
  const space = metadata?.space as { events?: unknown; series?: unknown } | undefined
  const live = freeHumanUpcoming(space, now ?? new Date()).slice(0, count)
  const written = arr(p.rows).slice(0, count).map((r) => ({ stamp: null as { day: string; month: string } | null, glyph: str(r.glyph) || 'gathering', title: str(r.title), meta: str(r.meta), href: str(r.href), resolved: false, featured: r.featured === true }))
  const rows = live.length
    ? live.map((e, i) => ({ stamp: freeHumanStamp(e.startsAt), glyph: freeHumanKind(e.title).glyph, title: e.title, meta: [freeHumanKind(e.title).label, where(e)].filter(Boolean).join(' · '), href: eventHref(e, metadata) ?? '', resolved: true, featured: i === 0 }))
    : written
  const empty = !rows.length && Boolean(space)
  return (
    <Ground p={p} name="events" pad={pad} vis={vis}>
      <div className="fh-row">
        <div className="fh-events-art">
          <div className="fh-halo fh-breathe" aria-hidden="true" />
          <Frame src={img(p.image)} alt={str(p.alt)} shape="arch" pos={str(p.pos)} gilt="dark" className="fh-flicker" />
        </div>
        <div className="fh-events-copy">
          {str(p.eyebrow) && <span className="fh-eyebrow">{str(p.eyebrow)}</span>}
          {str(p.title) && <h2 className="fh-sec-title"><InlineText text={str(p.title)} /></h2>}
          {empty && <p className="fh-events-empty">{str(p.empty)}</p>}
          {rows.map((r, i) => (
            <div key={i} className="fh-event" data-featured={r.featured || undefined}>
              <div className="fh-event-stamp">
                {r.stamp ? <><span className="fh-event-day">{r.stamp.day}</span><span className="fh-event-month">{r.stamp.month}</span></> : <span className="fh-event-mark"><Mark name={r.glyph} size={34} /></span>}
              </div>
              <div>
                <div className="fh-event-title"><Mark name={r.glyph} size={22} /><span>{r.title}</span></div>
                {r.meta && <div className="fh-event-meta">{r.meta}</div>}
              </div>
              <Btn label={str(p.buttonLabel)} href={r.href} kind={r.featured ? 'gilt' : 'secondary'} metadata={metadata} resolved={r.resolved} />
            </div>
          ))}
          {str(p.calendarLabel) && hrefOf(str(p.calendarHref), metadata) && (
            <a className="fh-events-more" href={hrefOf(str(p.calendarHref), metadata)!}>{str(p.calendarLabel)}<ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" /></a>
          )}
        </div>
      </div>
    </Ground>
  )
}

// ── Books ────────────────────────────────────────────────────────────────────────────────────

function Books({ p, metadata, pad, vis }: Common) {
  const books = arr(p.books)
  return (
    <Ground p={p} name="books" pad={pad} vis={vis}>
      <div className="fh-row">
        <Heading p={p} center />
        <div className="fh-book-grid">
          {books.map((b, i) => (
            <article key={i} className="fh-book">
              <div className="fh-book-stage">
                <div className="fh-cover" data-cover={str(b.cover) === 'oxblood' ? 'oxblood' : 'jade'}>
                  <span className="fh-cover-rule" aria-hidden="true" />
                  {b.rays === true && <div className="fh-rays fh-turn" aria-hidden="true" />}
                  <span className="fh-cover-author">AUDREY UMA WILDER</span>
                  <Frame src={img(b.image)} alt="" shape="arch" pos={str(b.pos)} gilt={false} />
                  <span className="fh-cover-name">
                    <span className="fh-cover-title"><InlineText text={str(b.title)} /></span>
                    {str(b.subtitle) && <span className="fh-cover-sub">{str(b.subtitle)}</span>}
                  </span>
                </div>
              </div>
              {str(b.status) && <span className="fh-badge" data-tone={str(b.status) === 'New' ? 'gilt' : 'saffron'}>{str(b.status)}</span>}
              <h3 className="fh-book-title"><InlineText text={str(b.title)} /></h3>
              {str(b.subtitle) && <span className="fh-book-sub">{str(b.subtitle)}</span>}
              {str(b.body) && <p>{str(b.body)}</p>}
              <div className="fh-actions">
                <Btn label={str(b.primaryLabel)} href={str(b.primaryHref)} kind={str(b.primaryStyle) === 'gilt' ? 'gilt' : 'primary'} metadata={metadata} />
                <Btn label={str(b.secondaryLabel)} href={str(b.secondaryHref)} kind="ghost" metadata={metadata} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </Ground>
  )
}

// ── Speaking ─────────────────────────────────────────────────────────────────────────────────

function Speaking({ p, metadata, pad, vis }: Common) {
  const topics = arr(p.topics)
  const slug = (metadata?.links as SiteLinkMap | undefined)?.slug ?? null
  const kinds = Array.isArray(p.kinds) ? (p.kinds as unknown[]).map(str).filter(Boolean) : []
  return (
    <Ground p={p} name="speaking" pad={pad} vis={vis}>
      <div className="fh-row">
        <div className="fh-speak-art">
          <div className="fh-halo fh-breathe" aria-hidden="true" />
          <Frame src={img(p.image)} alt={str(p.alt)} shape="arch" pos={str(p.pos)} />
          <Frame src={img(p.accentImage)} alt="" shape="circle" pos={str(p.accentPos)} gilt={false} className="fh-speak-round" />
        </div>
        <div className="fh-speak-copy">
          {str(p.eyebrow) && <span className="fh-eyebrow">{str(p.eyebrow)}</span>}
          <h2 className="fh-speak-name"><InlineText text={str(p.title)} /></h2>
          {str(p.body) && <p className="fh-speak-body">{str(p.body)}</p>}
          {topics.length > 0 && (
            <ul className="fh-topics">
              {topics.map((t, i) => <li key={i} className="fh-topic"><Mark name={str(t.glyph)} size={16} />{str(t.label)}</li>)}
            </ul>
          )}
          {str(p.formTitle) && <h3 className="fh-speak-form-title"><InlineText text={str(p.formTitle)} /></h3>}
          <FreeHumanBookingForm slug={slug} kinds={kinds} submitLabel={str(p.buttonLabel) || 'Send'} note={str(p.note)} successMessage={str(p.successMessage) || 'Thank you. Your request is in.'} />
        </div>
      </div>
    </Ground>
  )
}

// ── Lineage ──────────────────────────────────────────────────────────────────────────────────

function Lineage({ p, pad, vis }: Common) {
  const photos = arr(p.photos)
  return (
    <Ground p={p} name="lineage" pad={pad} vis={vis}>
      <div className="fh-row">
        <Heading p={p} split />
        <div className="fh-lineage-grid">
          {photos.map((ph, i) => <Frame key={i} src={img(ph.image)} alt={str(ph.alt)} shape="arch" pos={str(ph.pos)} />)}
        </div>
      </div>
    </Ground>
  )
}

// ── Registry ─────────────────────────────────────────────────────────────────────────────────

const row = (fields: Record<string, unknown>) => ({ type: 'array', label: 'Rows', arrayFields: fields, getItemSummary: (it: Props) => str(it.title) || str(it.name) || str(it.label) || 'Row' }) as const
const links = (n: string) => ({ [`${n}Label`]: text('Button'), [`${n}Href`]: text('Button: where it goes', LINK_HINT) })

export const freeHumanBlocks: Record<string, ComponentConfig> = {
  FreeHumanHero: block('Free Human hero', {
    ...groundFields, badge: text('Badge'), title: area('Heading', VOICE_HINT), lead: area('Line under the heading'),
    ...links('primary'), primaryStyle: { type: 'select', label: 'Button colour', options: [{ label: 'Madder', value: 'madder' }, { label: 'Gilt', value: 'gilt' }] },
    ...links('secondary'), image, alt: text('Photo description'), pos: text('Photo focus', 'Like center 20%.'),
    eggImage: { ...image, label: 'Egg photo' }, sunImage: { ...image, label: 'Round photo' }, pebbleImage: { ...image, label: 'Pebble photo' },
    rays: { type: 'radio', label: 'Turning rays', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] },
  }, FREE_HUMAN_HERO, Hero),
  FreeHumanSeasons: block('Free Human seasons', {
    ...groundFields, ...head, lead: area('Line under the heading'),
    seasons: row({ season: { type: 'select', label: 'Season', options: ['winter', 'spring', 'summer', 'fall'].map((v) => ({ label: v, value: v })) }, name: text('Name'), glyph: glyphField, texture: text('Texture'), body: area('Line'), image, alt: text('Photo description'), pos: text('Photo focus'), href: text('Link', LINK_HINT) }),
    ...links('button'), badges: { type: 'array', label: 'Badges', arrayFields: {}, getItemSummary: (it: unknown) => String(it) },
  }, FREE_HUMAN_SEASONS, Seasons),
  FreeHumanLyric: block('Free Human lyric band', {
    ...groundFields, line: area('The line', VOICE_HINT),
    feelings: row({ glyph: glyphField, label: text('Word') }), note: text('Line under the words'),
  }, FREE_HUMAN_LYRIC, Lyric),
  FreeHumanWorkshops: block('Free Human workshops (live)', {
    ...groundFields, ...head, aside: area('Line beside the heading'),
    tag: text('Show events of this kind', 'workshop, retreat, moon, turn, program, book or circle. Empty shows every kind.'),
    count: { type: 'number', label: 'How many', min: 1, max: 6 }, buttonLabel: text('Button'),
    rows: row({ when: text('Date line'), mode: text('Online or in person'), title: area('Title', VOICE_HINT), body: area('Line'), image, pos: text('Photo focus'), shape: shapeField, href: text('Link', LINK_HINT) }),
  }, FREE_HUMAN_WORKSHOPS, Workshops),
  FreeHumanEvents: block('Free Human events (live)', {
    ...groundFields, ...head, image, alt: text('Photo description'), pos: text('Photo focus'),
    count: { type: 'number', label: 'How many', min: 1, max: 8 }, empty: text('When nothing is open'), buttonLabel: text('Button'),
    rows: row({ glyph: glyphField, title: text('Title'), meta: text('Line under'), href: text('Link', LINK_HINT), featured: { type: 'radio', label: 'Featured', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] } }),
    calendarLabel: text('Calendar link'), calendarHref: text('Calendar link: where it goes', LINK_HINT),
  }, FREE_HUMAN_EVENTS, Events),
  FreeHumanBooks: block('Free Human books', {
    ...groundFields, ...head,
    books: row({ title: text('Title', VOICE_HINT), subtitle: text('Subtitle'), body: area('Line'), status: text('Badge'), cover: { type: 'select', label: 'Cover', options: [{ label: 'Jade', value: 'jade' }, { label: 'Oxblood', value: 'oxblood' }] }, image, pos: text('Photo focus'), rays: { type: 'radio', label: 'Rays on the cover', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] }, ...links('primary'), primaryStyle: { type: 'select', label: 'Button colour', options: [{ label: 'Madder', value: 'madder' }, { label: 'Gilt', value: 'gilt' }] }, ...links('secondary') }),
  }, FREE_HUMAN_BOOKS, Books),
  FreeHumanSpeaking: block('Free Human speaking and booking', {
    ...groundFields, eyebrow: text('Small label'), title: text('Name', VOICE_HINT), body: area('About'), image, alt: text('Photo description'), pos: text('Photo focus'), accentImage: { ...image, label: 'Small photo' }, accentPos: text('Small photo focus'),
    topics: row({ glyph: glyphField, label: text('Topic') }), formTitle: text('Form heading', VOICE_HINT),
    kinds: { type: 'array', label: 'Kinds of gathering', arrayFields: {}, getItemSummary: (it: unknown) => String(it) },
    buttonLabel: text('Button'), note: text('Line beside the button'), successMessage: text('After it is sent'),
  }, FREE_HUMAN_SPEAKING, Speaking),
  FreeHumanLineage: block('Free Human lineage', {
    ...groundFields, ...head, aside: area('Line beside the heading'),
    photos: row({ image, alt: text('Photo description'), pos: text('Photo focus') }),
  }, FREE_HUMAN_LINEAGE, Lineage),
}
