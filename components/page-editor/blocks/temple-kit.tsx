import type { ReactNode } from 'react'
import { ArrowRight, Calendar, ChevronDown, Clock, MapPin, Users } from 'lucide-react'
import type { ComponentConfig } from '@/lib/page-editor/types'
import { layoutField, layoutDefault } from '@/lib/page-editor/layout'
import { type SiteLinkMap } from '@/lib/sites/house-theme'
import { expandSiteSeries, storedWallClock } from '@/lib/sites/site-events'
import { templeStamp, templeSpan } from '@/lib/sites/temple-events'
import { InlineText } from '@/components/sites/inline-text'
import { LINK_HINT, VOICE_HINT, area, arr, cls, hrefOf, image, img, layoutOf, rel, str, text, type Props } from './midnight'
import { TempleKitLetterForm } from '@/components/sites/temple-kit-letter-form'
import {
  TEMPLE_KIT_CTA, TEMPLE_KIT_FAQ, TEMPLE_KIT_GALLERY, TEMPLE_KIT_GATHERINGS, TEMPLE_KIT_HERO, TEMPLE_KIT_JOURNEYS, TEMPLE_KIT_LETTER,
  TEMPLE_KIT_LIVE, TEMPLE_KIT_MEMBERSHIP, TEMPLE_KIT_OFFERINGS, TEMPLE_KIT_PROOF, TEMPLE_KIT_ROOMS, TEMPLE_KIT_STEPS,
} from '@/lib/sites/temple-kit-home'

// ── The Temple Kit block family (Temple Theme Kit design system, "Web Theme", 2026-10) ────────────────────────
// Every section of the design's Home is one registered block here, in the design's markup (ui_kits/site/
// TempleBlocks.jsx): the hero with the next-gathering card, the frosted live band, gatherings, rooms, offerings and
// steps, then the gallery, journeys, proof (the one night section), membership, questions, the letter (the one clay
// banner) and the closing call. Server Components, but for the letter's own form. Live blocks read the Space's own events from `puck.metadata.space` and fall back to
// the cards the owner wrote. It is a family of its own: the older Temple family (./temple.tsx, Royal Temple) is not
// touched. Every look is the Temple Kit skin's (components/sites/temple-kit-blocks-css.ts), tokens only.

type Common = { p: Props; metadata?: Props; now?: Date; pad?: string; vis?: string }

// ── Pieces ──────────────────────────────────────────────────────────────────────────────────

type BtnKind = 'primary' | 'secondary' | 'ghost' | 'glass' | 'ink'

export function Btn({ label, href, kind = 'primary', size = 'md', metadata, arrow = false }: { label: string; href: string; kind?: BtnKind; size?: 'sm' | 'md' | 'lg'; metadata?: Props; arrow?: boolean }) {
  const to = label ? hrefOf(href, metadata) : null
  if (!to) return null
  return (
    <a className={cls('tk-btn', `tk-btn--${kind}`, `tk-btn--${size}`)} href={to} {...rel(to)}>
      <span>{label}</span>
      {arrow && <ArrowRight size={size === 'sm' ? 14 : 16} strokeWidth={1.5} aria-hidden="true" />}
    </a>
  )
}

/** A photo frame (design Pic): a radius, a ratio, the hairline frame inset 8px, a slow drift to 1.03 on hover. */
export function Pic({ src, alt = '', shape = 'media', ratio, frame = true, pos, className, children }: { src: string | null; alt?: string; shape?: 'media' | 'arch' | 'soft' | 'tall' | 'xl' | 'md'; ratio?: string; frame?: boolean; pos?: string; className?: string; children?: ReactNode }) {
  return (
    <div className={cls('tk-pic', `tk-pic--${shape}`, ratio && `tk-ratio-${ratio}`, className)}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
        <img src={src} alt={alt} loading="lazy" style={pos ? { objectPosition: pos } : undefined} />
      )}
      {frame && <span className="tk-frame" aria-hidden="true" />}
      {children}
    </div>
  )
}

/** The section head (design THead): numeral, star, eyebrow, the title with its accent phrase, an optional lead, and an action. */
export function Head({ p, metadata, center = false, light = false, action, numbered = true }: { p: Props; metadata?: Props; center?: boolean; light?: boolean; action?: ReactNode; numbered?: boolean }) {
  if (!str(p.eyebrow) && !str(p.title) && !str(p.lead)) return null
  const button = action ?? (str(p.actionLabel) ? <Btn label={str(p.actionLabel)} href={str(p.actionHref)} kind="secondary" metadata={metadata} arrow /> : null)
  return (
    <div className={cls('tk-head', center && 'tk-head--center', light && 'tk-head--light')}>
      <div className="tk-head-copy">
        {(str(p.eyebrow) || numbered) && (
          <div className="tk-eyebrow tk-head-eyebrow">
            {numbered && str(p.title) && <span className="tk-index" aria-hidden="true" />}
            {numbered && str(p.title) && str(p.eyebrow) && <span className="tk-star" aria-hidden="true">✦</span>}
            {str(p.eyebrow) && <span>{str(p.eyebrow)}</span>}
          </div>
        )}
        {str(p.title) && (
          <h2 className="tk-display tk-h2">
            <InlineText text={str(p.title)} />
          </h2>
        )}
        {str(p.lead) && <p className="tk-kicker">{str(p.lead)}</p>}
      </div>
      {button}
    </div>
  )
}

const GLYPHS: Record<string, ReactNode> = {
  circle: <circle cx="12" cy="12" r="8" />,
  ring: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /></>,
  half: <><circle cx="12" cy="12" r="8" /><path d="M12 4A8 8 0 0 1 12 20Z" fill="currentColor" stroke="none" /></>,
  arc: <><circle cx="12" cy="12" r="8" /><path d="M12 4A8 8 0 0 1 12 20A4.5 8 0 0 0 12 4Z" fill="currentColor" stroke="none" /></>,
  dot: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" /></>,
}
const LINE_ICONS = { calendar: Calendar, 'map-pin': MapPin, clock: Clock, users: Users } as const
export const TEMPLE_KIT_GLYPH_NAMES = [...Object.keys(GLYPHS), ...Object.keys(LINE_ICONS)]

/** A line icon (Lucide, 1.5 stroke) or one of the kit's plain geometric marks, drawn in currentColor. */
export function Glyph({ name, size = 17 }: { name: string; size?: number }) {
  const Line = (LINE_ICONS as Record<string, (typeof LINE_ICONS)[keyof typeof LINE_ICONS]>)[name]
  if (Line) return <Line width={size} height={size} strokeWidth={1.5} aria-hidden="true" />
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPHS[name] ?? GLYPHS.circle}
    </svg>
  )
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

// ── Live rows from the data bag ────────────────────────────────────────────────────────────────

interface EventRow {
  id: string
  slug?: string | null
  title: string
  startsAt: string
  endsAt?: string | null
  location?: string | null
  priceLabel?: string | null
  coverUrl?: string | null
  isCancelled?: boolean | null
  recurrenceType?: string | null
  recurrenceRule?: string | null
  recurrenceUntil?: string | null
  parentEventId?: string | null
}
const isRow = (e: unknown): e is EventRow => !!e && typeof (e as EventRow).id === 'string' && typeof (e as EventRow).title === 'string' && typeof (e as EventRow).startsAt === 'string'
interface SpaceBag {
  events?: unknown
  series?: unknown
  practices?: { journeys?: { id: string; slug: string; title: string; summary: string | null; adoptCount: number }[] }
  highlights?: { label: string; value: number }[]
}
const spaceOf = (metadata: Props | undefined) => (metadata?.space ?? undefined) as SpaceBag | undefined

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WINDOW_DAYS = 70
const CACHE = new WeakMap<object, EventRow[]>()

/** The Space's upcoming events (its own rows and its series, every recurring anchor expanded through the next ten
 *  weeks), cancelled ones dropped, soonest first, each start read as the stored wall clock. */
function upcoming(metadata: Props | undefined, now: Date): EventRow[] {
  const space = spaceOf(metadata)
  if (!space) return []
  let rows = CACHE.get(space)
  if (!rows) {
    const seen = new Set<string>()
    const own: EventRow[] = []
    for (const e of [...(Array.isArray(space.events) ? space.events : []), ...(Array.isArray(space.series) ? space.series : [])]) {
      if (!isRow(e) || seen.has(e.id)) continue
      seen.add(e.id)
      own.push(e)
    }
    rows = expandSiteSeries(own, { through: new Date(now.getTime() + WINDOW_DAYS * 86_400_000), from: now })
    CACHE.set(space, rows)
  }
  const today = now.toISOString().slice(0, 10)
  return rows.filter((e) => !e.isCancelled && e.startsAt.slice(0, 10) >= today).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/** "Thu 20 Nov". */
function dayLine(startsAt: string): string {
  const d = storedWallClock(startsAt)
  return d ? `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : ''
}

function eventHref(e: EventRow, metadata: Props | undefined): string | null {
  if (!e.slug) return null
  const origin = (metadata?.links as SiteLinkMap | undefined)?.origin
  return origin ? `${origin}/events/${e.slug}` : `/events/${e.slug}`
}

const lines = (v: unknown) => str(v).split('\n').map((s) => s.trim()).filter(Boolean)

// ── Hero ─────────────────────────────────────────────────────────────────────────────────

function TempleKitHeroBlock({ p, metadata, now = new Date(), pad, vis }: Common) {
  const src = img(p.image)
  const pos = /^[a-z0-9% .-]{1,30}$/i.test(str(p.pos)) ? str(p.pos) : ''
  const next = p.live !== false ? upcoming(metadata, now)[0] : undefined
  const card = next
    ? { title: next.title, line: [dayLine(next.startsAt), str(next.location)].filter(Boolean).join(' · '), image: img(next.coverUrl) ?? img(p.cardImage), href: eventHref(next, metadata) }
    : { title: str(p.cardTitle), line: [str(p.cardWhen), str(p.cardNote)].filter(Boolean).join(' · '), image: img(p.cardImage), href: hrefOf(str(p.cardHref), metadata) }
  const cardInner = card.title ? (
    <>
      <Pic src={card.image} shape="soft" frame={false} className="tk-hero-thumb" />
      <span className="tk-hero-card-text">
        <span className="tk-eyebrow tk-eyebrow--sm">{str(p.cardLabel) || 'Next gathering'}</span>
        <span className="tk-display tk-hero-card-title">{card.title}</span>
        {card.line && <span className="tk-hero-card-line">{card.line}</span>}
      </span>
    </>
  ) : null
  return (
    <section data-tk="hero" className={cls('tk-hero', pad, vis)}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
        <img className="tk-hero-photo" src={src} alt={str(p.alt)} style={pos ? { objectPosition: pos } : undefined} />
      )}
      <div className="tk-hero-veil" aria-hidden="true" />
      <div className="tk-motif tk-motif--sun tk-motif--on-ink tk-hero-sun" aria-hidden="true" />
      <div className="tk-hero-inner">
        <div className="tk-hero-copy">
          {str(p.eyebrow) && <div className="tk-eyebrow tk-eyebrow--light tk-hero-eyebrow">{str(p.eyebrow)}</div>}
          <h1 className="tk-display-hero tk-hero-title">
            <InlineText text={str(p.title)} />
          </h1>
          {str(p.lead) && <p className="tk-hero-lead">{str(p.lead)}</p>}
          {(str(p.primaryLabel) || str(p.secondaryLabel)) && (
            <div className="tk-actions">
              <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} size="lg" metadata={metadata} />
              <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind="glass" size="lg" metadata={metadata} />
            </div>
          )}
        </div>
        {cardInner && (card.href ? <a className="tk-glass tk-hero-card" href={card.href} {...rel(card.href)}>{cardInner}</a> : <div className="tk-glass tk-hero-card">{cardInner}</div>)}
      </div>
    </section>
  )
}

// ── The live band ──────────────────────────────────────────────────────────────────────────

function TempleKitLiveBlock({ p, metadata, now = new Date(), pad, vis }: Common) {
  const space = spaceOf(metadata)
  const next = upcoming(metadata, now)[0]
  const items = arr(p.items).slice(0, 4).map((it) => {
    const source = str(it.source)
    let value = str(it.value)
    if (source === 'nextEvent' && next) value = `${dayLine(next.startsAt).replace(/^\w+ /, '')} · ${next.title}`
    if (source === 'journeys' && space?.practices?.journeys?.length) value = `${space.practices.journeys.length} open`
    if (source === 'members') {
      const n = space?.highlights?.find((h) => /member/i.test(h.label))?.value
      if (n) value = `${n} members`
    }
    return { icon: str(it.icon) || 'circle', label: str(it.label), value, href: hrefOf(str(it.href), metadata) }
  }).filter((it) => it.label && it.value)
  if (!items.length) return null
  return (
    <section data-tk="live" className={cls('tk-live', pad, vis)} aria-label="Right now">
      <div className="tk-live-band">
        <div className="tk-live-inner" style={{ '--tk-live-cols': items.length } as React.CSSProperties}>
          {items.map((it, i) => {
            const inner = (
              <>
                <span className="tk-live-icon" aria-hidden="true"><Glyph name={it.icon} /></span>
                <span className="tk-live-text">
                  <span className="tk-eyebrow tk-eyebrow--sm tk-live-label">{it.label}</span>
                  <span className="tk-live-value">{it.value}</span>
                </span>
              </>
            )
            return it.href ? <a key={i} className="tk-live-item" href={it.href} {...rel(it.href)}>{inner}</a> : <div key={i} className="tk-live-item">{inner}</div>
          })}
        </div>
      </div>
    </section>
  )
}

// ── Gatherings ─────────────────────────────────────────────────────────────────────────────

interface GatherRow { month: string; day: string; when: string; time: string; title: string; place: string; price: string; seats: number | null; image: string | null; href: string | null }

function TempleKitGatheringsBlock({ p, metadata, now = new Date(), pad, vis }: Common) {
  const count = Math.max(2, Math.min(8, Number(p.count) || 4))
  const written = arr(p.rows)
  const events = upcoming(metadata, now).slice(0, count)
  const rows: GatherRow[] = (events.length
    ? events.map((e, i) => {
        const s = templeStamp(e.startsAt)
        const own = img(e.coverUrl)
        // An event with no photo of its own borrows the written row at the same place in the list.
        return { month: s?.month ?? '', day: s?.day ?? '', when: dayLine(e.startsAt), time: templeSpan(e.startsAt, e.endsAt) ?? '', title: e.title, place: str(e.location), price: str(e.priceLabel), seats: null, image: own ?? img(written[i % Math.max(1, written.length)]?.image), href: eventHref(e, metadata) }
      })
    : written.slice(0, count).map((r) => ({ month: str(r.month), day: str(r.day), when: str(r.when), time: str(r.time), title: str(r.title), place: str(r.place), price: str(r.price), seats: Number.isFinite(Number(r.seats)) && str(r.seats) ? Number(r.seats) : null, image: img(r.image), href: hrefOf(str(r.href), metadata) }))
  ).filter((r) => r.title)
  const [first, ...rest] = rows
  return (
    <section data-tk="gatherings" className={cls('tk-sec tk-gatherings tk-pattern tk-pattern--scallop tk-edge-top tk-motif tk-motif--olive', pad, vis)}>
      <div className="tk-inner">
        <Head p={p} metadata={metadata} />
        {first ? (
          <div className="tk-gather-grid">
            {(() => {
              const body = (
                <>
                  <Pic src={first.image} shape="arch" ratio="3-4" pos="center 40%" className="tk-gather-photo">
                    <span className="tk-gather-veil" aria-hidden="true" />
                    <span className="tk-gather-copy">
                      <span className="tk-eyebrow tk-eyebrow--light">{first.when}</span>
                      <span className="tk-display tk-gather-title">{first.title}</span>
                      <span className="tk-gather-meta">{[first.place, first.price].filter(Boolean).join(' · ')}</span>
                    </span>
                  </Pic>
                  {first.day && <span className="tk-seal"><span className="tk-display tk-seal-day">{first.day}</span><span className="tk-eyebrow tk-seal-month">{first.month}</span></span>}
                </>
              )
              return first.href ? <a className="tk-gather-feature" href={first.href} {...rel(first.href)}>{body}</a> : <div className="tk-gather-feature">{body}</div>
            })()}
            <div className="tk-gather-list">
              {rest.map((r, i) => {
                const inner = (
                  <>
                    <Pic src={r.image} shape="md" ratio="1-1" frame={false} className="tk-gather-thumb" />
                    <span className="tk-gather-row-main">
                      <span className="tk-eyebrow tk-eyebrow--sm">{[`${r.month} ${r.day}`.trim(), r.time].filter(Boolean).join(' · ')}</span>
                      <span className="tk-display tk-gather-row-title">{r.title}</span>
                      {r.place && <span className="tk-gather-row-place">{r.place}</span>}
                    </span>
                    <span className="tk-gather-row-end">
                      {r.price && <span className="tk-display tk-gather-row-price">{r.price}</span>}
                      {r.seats !== null && (r.seats <= 3 ? <span className="tk-badge tk-badge--accent">{r.seats} left</span> : <span className="tk-gather-row-seats">{r.seats} seats</span>)}
                    </span>
                  </>
                )
                return r.href ? <a key={i} className="tk-gather-row" href={r.href} {...rel(r.href)}>{inner}</a> : <div key={i} className="tk-gather-row">{inner}</div>
              })}
              {str(p.note) && <p className="tk-quote tk-gather-note">{str(p.note)}</p>}
            </div>
          </div>
        ) : (
          str(p.empty) && <p className="tk-empty">{str(p.empty)}</p>
        )}
      </div>
    </section>
  )
}

// ── Rooms ──────────────────────────────────────────────────────────────────────────────────

function TempleKitRoomsBlock({ p, metadata, pad, vis }: Common) {
  const rooms = arr(p.rooms).filter((r) => str(r.name))
  const action = str(p.actionLabel) ? <Btn label={str(p.actionLabel)} href={str(p.actionHref)} kind="ghost" metadata={metadata} /> : null
  return (
    <section data-tk="rooms" className={cls('tk-sec tk-pattern tk-pattern--archrow tk-edge-top', pad, vis)}>
      <div className="tk-inner">
        <Head p={p} metadata={metadata} action={action} />
        <div className="tk-rooms">
          {rooms.map((r, i) => {
            const to = hrefOf(str(r.href), metadata)
            const inner = (
              <>
                <Pic src={img(r.image)} shape="arch" ratio="4-5" />
                <span className="tk-display tk-room-name">{str(r.name)}</span>
                {str(r.capacity) && <span className="tk-room-capacity">{str(r.capacity)}</span>}
              </>
            )
            return to ? <a key={i} className="tk-room" href={to} {...rel(to)}>{inner}</a> : <div key={i} className="tk-room">{inner}</div>
          })}
        </div>
      </div>
    </section>
  )
}

// ── Offerings ───────────────────────────────────────────────────────────────────────────────

function TempleKitOfferingsBlock({ p, metadata, pad, vis }: Common) {
  const services = arr(p.services).filter((s) => str(s.title))
  return (
    <section data-tk="offerings" className={cls('tk-sec tk-wash tk-wash--stucco tk-offerings', pad, vis)}>
      <div className="tk-inner">
        <Head p={p} metadata={metadata} center />
        <div className="tk-services">
          {services.map((s, i) => {
            const to = hrefOf(str(s.href), metadata)
            return (
              <div key={i} className={cls('tk-service', i % 2 === 1 && 'tk-service--flip')}>
                <Pic src={img(s.image)} shape="xl" ratio="4-3" className="tk-service-photo" />
                <div className="tk-service-card">
                  <div className="tk-eyebrow tk-service-eyebrow">
                    {str(s.numeral) && <span className="tk-numeral">{str(s.numeral)}</span>}
                    {str(s.numeral) && <span className="tk-spark" aria-hidden="true">✦</span>}
                    {str(s.length)}
                  </div>
                  <h3 className="tk-display tk-h3">{str(s.title)}</h3>
                  {str(s.summary) && <p className="tk-service-summary">{str(s.summary)}</p>}
                  {lines(s.includes).length > 0 && (
                    <ul className="tk-includes">
                      {lines(s.includes).map((x) => <li key={x}><span className="tk-spark" aria-hidden="true">✦</span>{x}</li>)}
                    </ul>
                  )}
                  <div className="tk-service-foot">
                    <span className="tk-service-price">{str(s.price)}</span>
                    {to && <Btn label={str(p.buttonLabel) || 'Hold a date'} href={str(s.href)} size="sm" metadata={metadata} arrow />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── Steps ──────────────────────────────────────────────────────────────────────────────────

function TempleKitStepsBlock({ p, metadata, pad, vis }: Common) {
  const steps = arr(p.steps).filter((s) => str(s.title)).slice(0, 4)
  return (
    <section data-tk="steps" className={cls('tk-sec tk-steps', pad, vis)}>
      <div className="tk-inner">
        <Head p={p} metadata={metadata} center />
        <ol className="tk-steps-grid">
          {steps.map((s, i) => (
            <li key={i} className="tk-step">
              <div className="tk-step-photo">
                <Pic src={img(s.image)} shape="arch" ratio="4-5" />
                <span className="tk-display-hero tk-step-seal" aria-hidden="true">{ROMAN[i]}</span>
              </div>
              <h3 className="tk-display tk-step-title">{str(s.title)}</h3>
              {str(s.body) && <p className="tk-step-body">{str(s.body)}</p>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ── Gallery ────────────────────────────────────────────────────────────────────────────────

function TempleKitGalleryBlock({ p, pad, vis }: Common) {
  const photos = arr(p.photos).slice(0, 3)
  const shapes = ['tall', 'media', 'tall'] as const
  return (
    <section data-tk="gallery" className={cls('tk-sec tk-gallery', pad, vis)}>
      <div className="tk-inner tk-gallery-grid">
        {photos.map((ph, i) => (
          <Pic key={i} src={img(ph.image)} alt={str(ph.alt)} shape={shapes[i]} className={`tk-gallery-photo tk-gallery-photo--${i + 1}`} />
        ))}
        {(str(p.title) || str(p.eyebrow)) && (
          <div className="tk-gallery-note">
            {str(p.eyebrow) && <div className="tk-eyebrow">{str(p.eyebrow)}</div>}
            {str(p.title) && <p className="tk-quote tk-gallery-quote">{str(p.title)}</p>}
            {str(p.body) && <p className="tk-gallery-body">{str(p.body)}</p>}
          </div>
        )}
      </div>
    </section>
  )
}

// ── Journeys ───────────────────────────────────────────────────────────────────────────────

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

function TempleKitJourneysBlock({ p, metadata, pad, vis }: Common) {
  const journeys = arr(p.journeys).filter((j) => str(j.title)).slice(0, 4)
  return (
    <section data-tk="journeys" className={cls('tk-sec tk-journeys tk-motif tk-motif--left tk-motif--agave', pad, vis)}>
      <div className="tk-inner">
        <Head p={p} metadata={metadata} />
        <div className="tk-journey-grid">
          {journeys.map((j, i) => {
            const to = hrefOf(str(j.href), metadata)
            const weeks = Number(str(j.weeks))
            const tag = [weeks > 0 ? `${weeks} ${weeks === 1 ? 'week' : 'weeks'}` : '', str(j.pillar)].filter(Boolean).join(' · ')
            const inner = (
              <>
                <Pic src={img(j.image)} shape="soft" ratio="4-5">
                  {tag && <span className="tk-glass tk-journey-tag">{tag}</span>}
                </Pic>
                <span className="tk-journey-body">
                  <span className="tk-display tk-journey-title">{str(j.title)}</span>
                  {str(j.outcome) && <span className="tk-journey-outcome">{str(j.outcome)}</span>}
                  <span className="tk-journey-foot">
                    {str(j.host) && <span className="tk-journey-host"><span className="tk-avatar" aria-hidden="true">{initials(str(j.host))}</span>{str(j.host)}</span>}
                    {str(j.price) && <span className="tk-display tk-journey-price">{str(j.price)}</span>}
                  </span>
                </span>
              </>
            )
            return to ? <a key={i} className="tk-journey" href={to} {...rel(to)}>{inner}</a> : <div key={i} className="tk-journey">{inner}</div>
          })}
        </div>
      </div>
    </section>
  )
}

// ── Proof ──────────────────────────────────────────────────────────────────────────────────

/** Five small sparks, the first `n` full (design Stars). Nothing when there is no rating to show. */
function Sparks({ n }: { n: number }) {
  if (!(n > 0)) return null
  return (
    <span className="tk-sparks" role="img" aria-label={`${n} out of 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} className={i < Math.round(n) ? undefined : 'tk-spark-off'} width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 14.2 9.8 21.5 12 14.2 14.2 12 21.5 9.8 14.2 2.5 12 9.8 9.8Z" /></svg>
      ))}
    </span>
  )
}

function TempleKitProofBlock({ p, pad, vis }: Common) {
  const more = arr(p.more).filter((m) => str(m.text)).slice(0, 3)
  const by = [str(p.who), str(p.role)].filter(Boolean).join(' · ')
  return (
    <section data-tk="proof" className={cls('tk-sec tk-proof tk-wash tk-wash--grit tk-wash--grit-ink tk-motif tk-motif--fan tk-motif--on-ink', pad, vis)}>
      <div className="tk-inner tk-proof-grid">
        <Pic src={img(p.image)} alt={str(p.alt)} shape="arch" ratio="4-5" className="tk-proof-photo" />
        <div className="tk-proof-copy">
          {str(p.eyebrow) && <div className="tk-eyebrow tk-eyebrow--light">{str(p.eyebrow)}</div>}
          {str(p.quote) && <blockquote className="tk-quote tk-proof-quote">“{str(p.quote)}”</blockquote>}
          {(by || Number(p.stars) > 0) && (
            <div className="tk-proof-by">
              <Sparks n={Number(p.stars)} />
              {by && <span className="tk-eyebrow tk-proof-who">{by}</span>}
            </div>
          )}
          {more.length > 0 && (
            <div className="tk-proof-more">
              {more.map((m, i) => (
                <figure key={i} className="tk-proof-small">
                  <blockquote>“{str(m.text)}”</blockquote>
                  <figcaption className="tk-eyebrow tk-eyebrow--light tk-eyebrow--sm">{[str(m.who), str(m.on)].filter(Boolean).join(' · ')}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ── Membership ─────────────────────────────────────────────────────────────────────────────

function TempleKitMembershipBlock({ p, metadata, pad, vis }: Common) {
  const tiers = arr(p.tiers).filter((t) => str(t.name)).slice(0, 4)
  return (
    <section data-tk="membership" className={cls('tk-sec tk-pattern tk-pattern--star tk-membership', pad, vis)}>
      <div className="tk-inner">
        <Head p={p} metadata={metadata} center />
        <div className="tk-tiers">
          {tiers.map((t, i) => {
            const featured = t.featured === true
            const to = hrefOf(str(t.href), metadata)
            return (
              <div key={i} className={cls('tk-tier', featured && 'tk-tier--featured')}>
                <span className="tk-tier-frame" aria-hidden="true" />
                <div className="tk-tier-top">
                  <span className="tk-eyebrow tk-tier-eyebrow">{str(t.eyebrow)}</span>
                  {str(t.badge) && <span className="tk-badge tk-tier-badge">{str(t.badge)}</span>}
                </div>
                <h3 className="tk-display tk-tier-name">{str(t.name)}</h3>
                <div className="tk-tier-price"><span className="tk-display tk-tier-amount">{str(t.price)}</span>{str(t.unit) && <span className="tk-tier-unit">{str(t.unit)}</span>}</div>
                {str(t.summary) && <p className="tk-tier-summary">{str(t.summary)}</p>}
                {lines(t.perks).length > 0 && (
                  <ul className="tk-tier-perks">
                    {lines(t.perks).map((x) => <li key={x}><span className="tk-tier-spark" aria-hidden="true">✦</span>{x}</li>)}
                  </ul>
                )}
                {to && str(t.button) && (
                  <a className={cls('tk-btn tk-btn--md tk-tier-button', featured ? 'tk-btn--light' : 'tk-btn--primary')} href={to} {...rel(to)}><span>{str(t.button)}</span></a>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── Questions ──────────────────────────────────────────────────────────────────────────────

function TempleKitFaqBlock({ p, metadata, pad, vis }: Common) {
  const items = arr(p.items).filter((x) => str(x.q) && str(x.a))
  return (
    <section data-tk="faq" className={cls('tk-sec tk-wash tk-wash--linen tk-faq', pad, vis)}>
      <div className="tk-inner tk-faq-grid">
        <div className="tk-faq-aside">
          <Head p={{ ...p, lead: '' }} metadata={metadata} />
          <Pic src={img(p.image)} alt={str(p.alt)} shape="arch" ratio="4-5" className="tk-faq-photo" />
        </div>
        <div className="tk-faq-card">
          {items.map((x, i) => (
            // One open at a time: the browser closes a sibling that shares the name.
            <details key={i} className="tk-faq-item" open={i === 0} {...{ name: 'tk-faq' }}>
              <summary className="tk-faq-q">
                <span>{str(x.q)}</span>
                <ChevronDown className="tk-faq-chev" size={16} strokeWidth={1.5} aria-hidden="true" />
              </summary>
              <p className="tk-faq-a">{str(x.a)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Letter ─────────────────────────────────────────────────────────────────────────────────

function TempleKitLetterBlock({ p, metadata, pad, vis }: Common) {
  const slug = (metadata?.links as SiteLinkMap | undefined)?.slug ?? null
  return (
    <section data-tk="letter" className={cls('tk-sec tk-letter-sec', pad, vis)}>
      <div className="tk-inner tk-ltr-band tk-wash tk-wash--grit tk-motif tk-motif--rays tk-motif--on-ink">
        <div className="tk-ltr-copy">
          {str(p.eyebrow) && <div className="tk-eyebrow tk-ltr-eyebrow">{str(p.eyebrow)}</div>}
          {str(p.title) && <h2 className="tk-display tk-h2 tk-ltr-title"><InlineText text={str(p.title)} /></h2>}
          {str(p.body) && <p className="tk-ltr-body">{str(p.body)}</p>}
          <TempleKitLetterForm banner slug={slug} label="Your email" placeholder={str(p.placeholder) || 'you@email.com'} buttonLabel={str(p.buttonLabel) || 'Keep me posted'} successMessage={str(p.successMessage) || 'Thank you. You are on the list for the next letter.'} />
        </div>
        <div className="tk-ltr-photo"><Pic src={img(p.image)} alt={str(p.alt)} shape="xl" /></div>
      </div>
    </section>
  )
}

// ── Closing call ───────────────────────────────────────────────────────────────────────────

function TempleKitCtaBlock({ p, metadata, pad, vis }: Common) {
  const src = img(p.image)
  return (
    <section data-tk="cta" className={cls('tk-cta', pad, vis)}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
        <img className="tk-cta-photo" src={src} alt={str(p.alt)} loading="lazy" />
      )}
      <div className="tk-cta-veil" aria-hidden="true" />
      <div className="tk-cta-fade" aria-hidden="true" />
      <div className="tk-cta-inner">
        <span className="tk-cta-star" aria-hidden="true">✦</span>
        <h2 className="tk-display-hero tk-cta-title"><InlineText text={str(p.title)} /></h2>
        {(str(p.primaryLabel) || str(p.secondaryLabel)) && (
          <div className="tk-actions tk-cta-actions">
            <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} size="lg" metadata={metadata} />
            <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind="glass" size="lg" metadata={metadata} />
          </div>
        )}
      </div>
    </section>
  )
}

// ── Registry ───────────────────────────────────────────────────────────────────────────────

const head = { eyebrow: text('Small label', 'The short line beside the numeral.'), title: area('Heading', VOICE_HINT), lead: area('Line under the heading') }
const action = { actionLabel: text('Button beside the heading'), actionHref: text('Button beside the heading: where it goes', LINK_HINT) }
const glyph = { type: 'select', label: 'Mark', options: TEMPLE_KIT_GLYPH_NAMES.map((v) => ({ label: v, value: v })) } as const

function block<P extends Props>(label: string, fields: Record<string, unknown>, defaults: P, Comp: (args: Common) => ReactNode): ComponentConfig {
  return {
    label,
    fields: { ...fields, layout: layoutField },
    defaultProps: { ...defaults, layout: layoutDefault },
    render: (props: Props & { puck?: { metadata?: Props } }) => {
      const { pad, vis } = layoutOf(props.layout)
      return <Comp p={props} metadata={props.puck?.metadata} pad={pad} vis={vis} />
    },
  } as unknown as ComponentConfig
}

export const templeKitComponents: Record<string, ComponentConfig> = {
  TempleKitHero: block('Temple hero with the next gathering', {
    eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), lead: area('Intro'),
    primaryLabel: text('Main button'), primaryHref: text('Main button link', LINK_HINT), secondaryLabel: text('Second button'), secondaryHref: text('Second button link', LINK_HINT),
    image, alt: text('Photo description', 'For screen readers.'),
    pos: text('Photo crop', 'Where the photo is held when it is cropped, like center 55%.'),
    live: { type: 'radio', label: "Show the Space's next event in the card", options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] },
    cardLabel: text('Card label'), cardTitle: text('Card title (when no event is coming)'), cardWhen: text('Card date'), cardNote: text('Card note'), cardImage: { ...image, label: 'Card photo' }, cardHref: text('Card link', LINK_HINT),
  }, { ...TEMPLE_KIT_HERO }, TempleKitHeroBlock),
  TempleKitLive: block('Temple live band (live)', {
    items: { type: 'array', label: 'Up to four facts', hint: "A fact set to a live source shows the Space's own next event, Journeys or members when there are any.", arrayFields: {
      source: { type: 'select', label: 'Source', options: [{ label: 'Written by hand', value: 'custom' }, { label: 'Next event', value: 'nextEvent' }, { label: 'Journeys open', value: 'journeys' }, { label: 'Members', value: 'members' }] },
      icon: glyph, label: text('Label'), value: text('Words'), href: text('Link', LINK_HINT),
    } },
  }, { ...TEMPLE_KIT_LIVE }, TempleKitLiveBlock),
  TempleKitGatherings: block('Temple gatherings (live)', {
    ...head, ...action, count: { type: 'number', label: 'How many to show', min: 2, max: 8 }, note: area('Closing line'), empty: area('Line when there are no dates yet'),
    rows: { type: 'array', label: 'Rows', hint: 'Used when the Space has no upcoming events of its own. The first one is the large card.', arrayFields: {
      month: text('Month'), day: text('Day'), when: text('Day line', 'Like Thu 20 Nov.'), time: text('Hours', 'Like 7pm to 8:30pm.'), title: text('Name'), place: text('Place'), price: text('Price'), seats: text('Seats left', 'A number. Three or fewer shows a badge.'), image, href: text('Link', LINK_HINT),
    } },
  }, { ...TEMPLE_KIT_GATHERINGS }, TempleKitGatheringsBlock),
  TempleKitRooms: block('Temple rooms', {
    ...head, ...action,
    rooms: { type: 'array', label: 'Rooms', arrayFields: { name: text('Name'), capacity: text('Capacity'), image, href: text('Link', LINK_HINT) } },
  }, { ...TEMPLE_KIT_ROOMS }, TempleKitRoomsBlock),
  TempleKitOfferings: block('Temple offerings', {
    ...head, buttonLabel: text('Button on each card'),
    services: { type: 'array', label: 'Offerings', arrayFields: { numeral: text('Numeral'), title: text('Name'), length: text('Small line'), summary: area('Summary'), includes: area('What is included', 'One per line.'), price: text('Price line'), image, href: text('Link', LINK_HINT) } },
  }, { ...TEMPLE_KIT_OFFERINGS }, TempleKitOfferingsBlock),
  TempleKitSteps: block('Temple steps', {
    ...head,
    steps: { type: 'array', label: 'Steps', arrayFields: { title: text('Name'), body: area('Line under the name'), image } },
  }, { ...TEMPLE_KIT_STEPS }, TempleKitStepsBlock),
  TempleKitGallery: block('Temple gallery', {
    eyebrow: text('Small label'), title: area('Line beside the photos'), body: text('Small line under it'),
    photos: { type: 'array', label: 'Three photos', hint: 'The first and third are tall arches, the second is wide.', arrayFields: { image, alt: text('Photo description', 'For screen readers.') } },
  }, { ...TEMPLE_KIT_GALLERY }, TempleKitGalleryBlock),
  TempleKitJourneys: block('Temple journeys', {
    ...head, ...action,
    journeys: { type: 'array', label: 'Programs', hint: 'Up to four.', arrayFields: { title: text('Name'), outcome: area('What it is'), weeks: text('Weeks', 'A number.'), pillar: text('Kind', 'Like Breath.'), image, host: text('Led by'), price: text('Price', 'Like $180, or Free.'), href: text('Link', LINK_HINT) } },
  }, { ...TEMPLE_KIT_JOURNEYS }, TempleKitJourneysBlock),
  TempleKitProof: block('Temple kind words', {
    image, alt: text('Photo description', 'For screen readers.'), eyebrow: text('Small label'), quote: area('The main quote'), who: text('Who said it'), role: text('Who they are'),
    stars: text('Sparks out of five', 'A number from 0 to 5. Leave 0 to show none.'),
    more: { type: 'array', label: 'Smaller quotes', hint: 'Up to three.', arrayFields: { text: area('Quote'), who: text('Who said it'), on: text('About') } },
  }, { ...TEMPLE_KIT_PROOF }, TempleKitProofBlock),
  TempleKitMembership: block('Temple membership', {
    ...head,
    tiers: { type: 'array', label: 'Tiers', hint: 'Up to four. The featured one is the clay card.', arrayFields: {
      eyebrow: text('Small label'), name: text('Name'), price: text('Price'), unit: text('After the price', 'Like a month.'), badge: text('Badge'),
      featured: { type: 'radio', label: 'Featured', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] },
      summary: area('Summary'), perks: area('What is included', 'One per line.'), button: text('Button'), href: text('Link', LINK_HINT),
    } },
  }, { ...TEMPLE_KIT_MEMBERSHIP }, TempleKitMembershipBlock),
  TempleKitFaq: block('Temple questions', {
    eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), image, alt: text('Photo description', 'For screen readers.'),
    items: { type: 'array', label: 'Questions', hint: 'The first one opens first.', arrayFields: { q: text('Question'), a: area('Answer') } },
  }, { ...TEMPLE_KIT_FAQ }, TempleKitFaqBlock),
  TempleKitLetter: block('Temple letter sign-up', {
    eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), body: area('Line under the heading'), image, alt: text('Photo description', 'For screen readers.'),
    placeholder: text('Email field hint'), buttonLabel: text('Button'), successMessage: text('Thank-you line'),
  }, { ...TEMPLE_KIT_LETTER }, TempleKitLetterBlock),
  TempleKitCta: block('Temple closing call', {
    title: area('Heading', VOICE_HINT), image, alt: text('Photo description', 'For screen readers.'),
    primaryLabel: text('Main button'), primaryHref: text('Main button link', LINK_HINT), secondaryLabel: text('Second button'), secondaryHref: text('Second button link', LINK_HINT),
  }, { ...TEMPLE_KIT_CTA }, TempleKitCtaBlock),
}

export const TEMPLE_KIT_CATEGORY_COMPONENTS = Object.keys(templeKitComponents)
