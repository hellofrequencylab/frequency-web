import type { CSSProperties, ReactNode } from 'react'
import type { ComponentConfig } from '@/lib/page-editor/types'
import { layoutField, layoutDefault, padClass, visClass, type LayoutValue } from '@/lib/page-editor/layout'
import { safeImageSrc } from '@/lib/safe-image-src'
import { safeImageUrl, safeUrl } from '@/lib/entity-blocks/block-content'
import { siteLocalHref, type SiteLinkMap } from '@/lib/sites/house-theme'
import { storedWallClock } from '@/lib/sites/site-events'
import { loomImageField } from '@/lib/page-editor/loom-image-field'
import { InlineText } from '@/components/sites/inline-text'
import { NetworkKitLetterForm } from '@/components/sites/network-kit-letter-form'
import { NkArrow, NkChevron, NkGlyph, NkSeal, NETWORK_KIT_GLYPH_NAMES } from '@/components/sites/network-kit-glyph'
import {
  NETWORK_KIT_CTA, NETWORK_KIT_DOORS, NETWORK_KIT_FAQ, NETWORK_KIT_GATHERINGS, NETWORK_KIT_HERO, NETWORK_KIT_JOURNEYS, NETWORK_KIT_LETTER, NETWORK_KIT_LIBRARY,
  NETWORK_KIT_LIVE, NETWORK_KIT_MEMBERSHIP, NETWORK_KIT_OFFERINGS, NETWORK_KIT_PROOF, NETWORK_KIT_SHOP, NETWORK_KIT_STEPS,
} from '@/lib/sites/network-kit-home'

// ── The Network kit block family (Network design system, "Web Theme", ui_kits/site/HomePage.jsx) ─────────────────
// The design's fourteen base blocks, each one registered editor block in the design's markup with the layout
// variants its kits choose between: the hero (split with the leaf photo, full, centred, left), the liveness strip,
// steps (grid, timeline, strip), ways in (grid, list, tiles), offerings (list, cards, split), programs (cards,
// feature), meetups (split, calendar, cards), membership (tiers, table, spotlight), proof (quote, wall, stats), the
// shop (grid, rail), the library (grid, list), the letter (band, card), questions (split, stack) and the closing
// call (centre, split, band). Server Components, except the letter form. Live blocks read the Space's own rows from
// `puck.metadata.space` (events, programs, reviews, questions, member count) and fall back to the cards the owner
// wrote. Every look is the kit's (components/sites/network-kit-blocks-css.ts), tokens only.
// The thirteen extra blocks (chapters, circles, rooms, ...) are in network-kit-more.tsx and share this file's pieces.

export type Props = Record<string, unknown>
export const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
export const arr = (v: unknown): Props[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Props[]) : [])
export const img = (v: unknown) => safeImageSrc(safeImageUrl(v) || null)
export const cls = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')
export const layoutOf = (layout: unknown) => ({ pad: padClass(layout as LayoutValue), vis: visClass(layout as LayoutValue) })
export const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed as readonly string[]).includes(str(v)) ? (str(v) as T) : fallback

/** A link through the site's link map. `~/page` means "this Space's page". Kept as written without a map. */
export function hrefOf(raw: string, metadata: Props | undefined): string | null {
  if (!raw) return null
  if (raw.startsWith('#')) return raw
  const links = metadata?.links as SiteLinkMap | undefined
  if (!links) return raw.startsWith('~/') ? `/spaces/space/${raw.slice(2)}` : safeUrl(raw) || (raw.startsWith('/') ? raw : null)
  const own = raw.startsWith('~/') ? `/spaces/${links.slug}/${raw.slice(2)}` : raw
  if (links.contactHref && /^mailto:/i.test(own)) return links.contactHref
  return siteLocalHref(own, links)?.href ?? (/^\/(?:spaces|circles|events|market)(?:\/|[?#]|$)|^\/sign-in(?:[?#]|$)/.test(own) ? `${links.origin}${own}` : null)
}
export const rel = (href: string) => (/^https?:\/\//.test(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})

export type BtnKind = 'primary' | 'secondary' | 'ghost' | 'glass' | 'dark'
export function Btn({ label, href, kind = 'primary', metadata, arrow = false, size }: { label: string; href: string; kind?: BtnKind; metadata?: Props; arrow?: boolean; size?: 'sm' | 'lg' }) {
  const to = label ? hrefOf(href, metadata) : null
  if (!to) return null
  return (
    <a className={cls('nk-btn', kind !== 'primary' && `nk-btn--${kind}`, size && `nk-btn--${size}`)} href={to} {...rel(to)}>
      {label}
      {arrow && <span className="nk-btn__arrow" aria-hidden="true">→</span>}
    </a>
  )
}

/** A row, card or tile that is a link when it has somewhere to go, and plain when it does not. */
export function Tap({ to, className, children }: { to: string | null; className: string; children: ReactNode }) {
  return to ? <a className={className} href={to} {...rel(to)}>{children}</a> : <div className={className}>{children}</div>
}

/** The section head (design SectionHeading): an accent-dot label, the big title with its italic word, a kicker, and an optional button to the right. */
export function Head({ p, metadata, button, center = false, kicker = true }: { p: Props; metadata?: Props; button?: ReactNode; center?: boolean; kicker?: boolean }) {
  if (!str(p.eyebrow) && !str(p.title) && !str(p.lead)) return null
  const action = button === undefined ? (str(p.actionLabel) ? <Btn label={str(p.actionLabel)} href={str(p.actionHref)} kind="secondary" metadata={metadata} /> : null) : button
  return (
    <div className="nk-head" data-center={center ? '' : undefined}>
      <div className="nk-head-copy">
        {str(p.eyebrow) && <div className="nk-eyebrow">{str(p.eyebrow)}</div>}
        {str(p.title) && (
          <h2 className="nk-display nk-display--h2">
            <InlineText text={str(p.title)} />
          </h2>
        )}
        {kicker && str(p.lead) && <p className="nk-lead nk-head-lead">{str(p.lead)}</p>}
      </div>
      {action}
    </div>
  )
}

/** One block's frame: the band (paper or sand, with the design's wavy top edge) and the layout field's spacing. */
export function Band({ kind, p, variant, pad, vis, className, children }: { kind: string; p: Props; variant?: string; pad?: string; vis?: string; className?: string; children: ReactNode }) {
  return (
    <section data-nk={kind} data-variant={variant} className={cls('nk-band', str(p.band) === 'sand' && 'nk-band--sand', className, pad, vis)}>
      {children}
    </section>
  )
}
export const Section = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cls('nk-section', className)}>{children}</div>

/** The design's SplitHead: the heading held in view on the left, the content on the right. */
export function SplitHead({ p, metadata, kicker = true, children }: { p: Props; metadata?: Props; kicker?: boolean; children: ReactNode }) {
  return (
    <Section>
      <div className="nk-split nk-split--top">
        <div className="nk-sticky"><Head p={p} metadata={metadata} button={null} kicker={kicker} /></div>
        <div>{children}</div>
      </div>
    </Section>
  )
}

// ── Live rows from the data bag ─────────────────────────────────────────────────────────────

export interface EventRow { id: string; slug?: string; title: string; startsAt: string; endsAt?: string | null; location?: string | null; priceLabel?: string | null; isCancelled?: boolean; ticketsMode?: boolean }
const isRow = (e: unknown): e is EventRow => !!e && typeof (e as EventRow).id === 'string' && typeof (e as EventRow).title === 'string' && typeof (e as EventRow).startsAt === 'string'
interface SpaceBag {
  events?: unknown
  practices?: { journeys?: { id: string; slug: string; title: string; summary: string | null; adoptCount: number }[] }
  reviews?: { average: number | null; count: number; latest?: { id: string; rating: number; body: string; author: { displayName: string } | null }[] }
  faqs?: { id: string; question: string; answer: string }[]
  highlights?: { label: string; value: number }[]
}
export const spaceOf = (metadata: Props | undefined) => (metadata?.space ?? undefined) as SpaceBag | undefined

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const clock = (d: Date) => `${d.getUTCHours() % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')}${d.getUTCHours() < 12 ? 'am' : 'pm'}`

/** The Space's upcoming events, soonest first, each start read as the stored wall clock. */
export function upcoming(metadata: Props | undefined, now: Date): EventRow[] {
  const raw = spaceOf(metadata)?.events
  if (!Array.isArray(raw)) return []
  const today = now.toISOString().slice(0, 10)
  return raw.filter(isRow).filter((e) => !e.isCancelled && e.startsAt.slice(0, 10) >= today).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/** "Thu 30 Oct · 10:00am". */
export function whenOf(startsAt: string): string {
  const d = storedWallClock(startsAt)
  return d ? `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} · ${clock(d)}` : ''
}

export function eventHref(e: EventRow, metadata: Props | undefined): string | null {
  if (!e.slug) return null
  const origin = (metadata?.links as SiteLinkMap | undefined)?.origin
  return origin ? `${origin}/events/${e.slug}` : `/events/${e.slug}`
}

export type Common = { p: Props; metadata?: Props; now?: Date; pad?: string; vis?: string }

/** A date tile: month over day. The first is the one solid hero tile, the rest sit on the tint. */
export function DateTile({ month, day, solid = false }: { month: string; day: string; solid?: boolean }) {
  return (
    <span className="nk-date" data-solid={solid ? '' : undefined}>
      <b>{month}</b>
      <span>{day}</span>
    </span>
  )
}

// ── Hero ─────────────────────────────────────────────────────────────────────────────────

const HERO_VARIANTS = ['split', 'full', 'center', 'left'] as const

function NetworkKitHeroBlock({ p, metadata, now = new Date(), pad, vis }: Common) {
  const variant = pick(p.variant, HERO_VARIANTS, 'split')
  const split = variant === 'split'
  const src = img(p.image)
  const pos = /^[a-z0-9% .-]{1,30}$/i.test(str(p.pos)) ? str(p.pos) : ''
  const flip = p.flip === true
  const next = split && p.showEvent !== false ? upcoming(metadata, now)[0] : undefined
  const nextAt = next ? storedWallClock(next.startsAt) : null
  const nextHref = next ? eventHref(next, metadata) : null
  // The design sizes the split headline to its length, so a long line still fits two or three rows.
  const length = str(p.title).replace(/[*\n]/g, ' ').length
  const scale = length <= 30 ? 13.5 : length <= 40 ? 11 : length <= 50 ? 9 : 7.5
  const head = (
    <>
      {str(p.eyebrow) && <div className={cls('nk-eyebrow', !split && 'nk-eyebrow--pill')}>{str(p.eyebrow)}</div>}
      <h1 className="nk-display nk-hero-title" style={split ? ({ '--nk-hero-scale': scale } as CSSProperties) : undefined}>
        <InlineText text={str(p.title)} />
      </h1>
      {str(p.lead) && <p className="nk-hero-lead">{str(p.lead)}</p>}
      {(str(p.primaryLabel) || str(p.secondaryLabel)) && (
        <div className="nk-actions" data-center={variant === 'center' ? '' : undefined}>
          <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} metadata={metadata} size="lg" arrow />
          <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind={split ? 'secondary' : 'glass'} metadata={metadata} size="lg" />
        </div>
      )}
      {str(p.note) && <p className="nk-hero-note">{str(p.note)}</p>}
    </>
  )
  if (split) {
    return (
      <section data-nk="hero" data-variant="split" className={cls('nk-hero nk-contour', pad, vis)}>
        <div className="nk-hero-split">
          <div className="nk-hero-copy" data-flip={flip ? '' : undefined}>{head}</div>
          <div className="nk-hero-media" data-grade="" data-flip={flip ? '' : undefined}>
            {src && (
              // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
              <img src={src} alt={str(p.alt)} style={pos ? { objectPosition: pos } : undefined} />
            )}
            {next && (
              <div className="nk-hero-event">
                <span className="nk-date" data-solid="">
                  <b>{nextAt ? MONTHS[nextAt.getUTCMonth()] : ''}</b>
                  <span>{nextAt ? String(nextAt.getUTCDate()) : ''}</span>
                </span>
                <span className="nk-hero-event-text">
                  <span className="nk-hero-event-title">{next.title}</span>
                  <span className="nk-hero-event-meta">{[nextAt ? clock(nextAt) : '', next.location ?? ''].filter(Boolean).join(' · ')}</span>
                </span>
                {nextHref && <a className="nk-btn nk-btn--sm" href={nextHref} {...rel(nextHref)}>RSVP</a>}
              </div>
            )}
          </div>
        </div>
      </section>
    )
  }
  return (
    <section data-nk="hero" data-variant={variant} data-grade="" className={cls('nk-hero nk-hero--photo nk-leaf nk-on-media', pad, vis)}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
        <img className="nk-hero-photo" src={src} alt={str(p.alt)} style={pos ? { objectPosition: pos } : undefined} />
      )}
      <div className="nk-hero-scrim" aria-hidden="true" />
      <div className="nk-hero-inner">{head}</div>
    </section>
  )
}

// ── The liveness strip ─────────────────────────────────────────────────────────────────────

function NetworkKitLiveBlock({ p, metadata, now = new Date(), pad, vis }: Common) {
  const space = spaceOf(metadata)
  const next = upcoming(metadata, now)[0]
  const items = arr(p.items).map((it) => {
    const source = str(it.source)
    let value = str(it.value)
    if (source === 'nextEvent') value = next ? `${next.title} · ${whenOf(next.startsAt)}` : value
    if (source === 'journeys') value = space?.practices?.journeys?.length ? `${space.practices.journeys.length} open` : value
    if (source === 'members') {
      const n = space?.highlights?.find((h) => /member/i.test(h.label))?.value
      value = n ? `${n} in the group` : value
    }
    return { glyph: str(it.glyph) || 'spark', label: str(it.label), value, href: hrefOf(str(it.href), metadata) }
  }).filter((it) => it.label && it.value).slice(0, 4)
  if (!items.length) return null
  return (
    <section data-nk="live" className={cls('nk-live', pad, vis)} aria-label="Right now">
      <div className="nk-section nk-section--lead">
        <div className="nk-grid-cards">
          {items.map((it, i) => (
            <Tap key={i} to={it.href} className="nk-live-tile nk-card--lift nk-grain">
              <span className="nk-chip"><NkGlyph name={it.glyph} size={20} /></span>
              <span className="nk-live-label">{it.label}</span>
              <span className="nk-live-value">{it.value}</span>
            </Tap>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Steps ──────────────────────────────────────────────────────────────────────────────────

const STEP_VARIANTS = ['grid', 'timeline', 'strip'] as const
export const num = (i: number) => String(i + 1).padStart(2, '0')

function NetworkKitStepsBlock({ p, metadata, pad, vis }: Common) {
  const variant = pick(p.variant, STEP_VARIANTS, 'grid')
  const steps = arr(p.steps).filter((s) => str(s.title)).slice(0, 6)
  const icon = (s: Props, i: number) => str(s.glyph) || ['circle', 'half', 'ring'][i % 3]
  let body: ReactNode
  if (variant === 'timeline') {
    body = (
      <SplitHead p={p} metadata={metadata} kicker={false}>
        <ol className="nk-timeline">
          {steps.map((s, i) => (
            <li key={i}>
              <NkSeal name={icon(s, i)} size={56} tone={i === 0 ? 'accent' : 'subtle'} />
              <span>
                <span className="nk-eyebrow nk-eyebrow--bare nk-step-label">Step {num(i)}</span>
                <span className="nk-display nk-step-title">{str(s.title)}</span>
                {str(s.body) && <span className="nk-step-body">{str(s.body)}</span>}
              </span>
            </li>
          ))}
        </ol>
      </SplitHead>
    )
  } else if (variant === 'strip') {
    body = (
      <Section className="nk-section--ruled">
        <div className="nk-steps-strip">
          <div><Head p={p} metadata={metadata} button={null} kicker={false} /></div>
          {steps.map((s, i) => (
            <div key={i} className="nk-strip-step" data-first={i === 0 ? '' : undefined}>
              <span className="nk-display nk-strip-num">{num(i)}</span>
              <span className="nk-display nk-step-title">{str(s.title)}</span>
              {str(s.body) && <span className="nk-step-body">{str(s.body)}</span>}
            </div>
          ))}
        </div>
      </Section>
    )
  } else {
    body = (
      <Section>
        <Head p={p} metadata={metadata} button={null} kicker={false} />
        <ol className="nk-steps-grid">
          {steps.map((s, i) => (
            <li key={i} className="nk-card nk-step-card">
              <span className="nk-step-top">
                <NkSeal name={icon(s, i)} size={48} tone={i === 0 ? 'accent' : 'subtle'} />
                <span className="nk-display nk-step-num">{num(i)}</span>
              </span>
              <span className="nk-display nk-step-title">{str(s.title)}</span>
              {str(s.body) && <span className="nk-step-body">{str(s.body)}</span>}
            </li>
          ))}
        </ol>
      </Section>
    )
  }
  return <Band kind="steps" p={p} variant={variant} pad={pad} vis={vis}>{body}</Band>
}

// ── Ways in ────────────────────────────────────────────────────────────────────────────────

const DOOR_VARIANTS = ['grid', 'list', 'tiles'] as const

function NetworkKitDoorsBlock({ p, metadata, pad, vis }: Common) {
  const variant = pick(p.variant, DOOR_VARIANTS, 'grid')
  const doors = arr(p.doors).filter((d) => str(d.title)).slice(0, 6).map((d) => ({ glyph: str(d.glyph) || 'circle', title: str(d.title), body: str(d.body), to: hrefOf(str(d.href), metadata) }))
  let body: ReactNode
  if (variant === 'list') {
    body = (
      <SplitHead p={p} metadata={metadata}>
        <div className="nk-list nk-list--ruled">
          {doors.map((d, i) => (
            <Tap key={i} to={d.to} className="nk-list-row nk-door-row">
              <span className="nk-display nk-voice-num">{num(i)}</span>
              <span>
                <span className="nk-display nk-row-title nk-row-title--lg">{d.title}</span>
                {d.body && <span className="nk-row-body">{d.body}</span>}
              </span>
              {d.to && <NkArrow size={20} />}
            </Tap>
          ))}
        </div>
      </SplitHead>
    )
  } else {
    const tiles = variant === 'tiles'
    body = (
      <Section>
        <Head p={p} metadata={metadata} />
        <div className="nk-grid-cards nk-grid-cards--after">
          {doors.map((d, i) => (
            <Tap key={i} to={d.to} className={cls('nk-door', tiles ? 'nk-door--tile nk-grain' : 'nk-card nk-card--lift')} >
              {tiles && <span className="nk-display nk-ghost-num" aria-hidden="true">{num(i)}</span>}
              <NkSeal name={d.glyph} size={tiles ? 48 : 56} tone={tiles && i === 0 ? 'accent' : 'subtle'} />
              <span className="nk-display nk-card-title">{d.title}</span>
              {d.body && <span className="nk-door-body">{d.body}</span>}
              {!tiles && d.to && <span className="nk-eyebrow nk-eyebrow--bare nk-open">Open<NkArrow size={14} /></span>}
            </Tap>
          ))}
        </div>
      </Section>
    )
  }
  return <Band kind="doors" p={p} variant={variant} pad={pad} vis={vis}>{body}</Band>
}

// ── Offerings ──────────────────────────────────────────────────────────────────────────────

const OFFERING_VARIANTS = ['list', 'cards', 'split'] as const

function NetworkKitOfferingsBlock({ p, metadata, pad, vis }: Common) {
  const variant = pick(p.variant, OFFERING_VARIANTS, 'list')
  const rows = arr(p.offerings).filter((o) => str(o.name)).map((o) => ({
    glyph: str(o.glyph) || 'circle', name: str(o.name), minutes: str(o.minutes), blurb: str(o.blurb), price: str(o.price), to: hrefOf(str(o.href), metadata),
  }))
  const meta = (o: (typeof rows)[number]) => [o.minutes && `${o.minutes} min`, o.blurb].filter(Boolean).join(' · ')
  const all = str(p.actionLabel) ? <Btn label={str(p.actionLabel)} href={str(p.actionHref)} kind="secondary" metadata={metadata} /> : null
  let body: ReactNode
  if (variant === 'cards') {
    body = (
      <Section>
        <Head p={p} metadata={metadata} />
        <div className="nk-grid-cards nk-grid-cards--after">
          {rows.map((o, i) => (
            <Tap key={i} to={o.to} className={cls('nk-card nk-offer-card', i === 1 ? 'nk-card--tint' : 'nk-card--lift')}>
              <span className="nk-between">
                <NkSeal name={o.glyph} size={52} tone={i === 1 ? 'accent' : 'subtle'} />
                {o.minutes && <span className="nk-eyebrow nk-eyebrow--bare">{o.minutes} min</span>}
              </span>
              <span className="nk-display nk-card-title">{o.name}</span>
              {o.blurb && <span className="nk-door-body">{o.blurb}</span>}
              {(o.price || o.to) && (
                <span className="nk-card-foot">
                  <span className="nk-mono">{o.price}</span>
                  {o.to && <span className="nk-eyebrow nk-eyebrow--bare nk-open">Book<NkArrow size={14} /></span>}
                </span>
              )}
            </Tap>
          ))}
        </div>
      </Section>
    )
  } else if (variant === 'split') {
    body = (
      <SplitHead p={p} metadata={metadata}>
        <div className="nk-list nk-list--ruled">
          {rows.map((o, i) => (
            <Tap key={i} to={o.to} className="nk-list-row nk-list-row--stack">
              <span className="nk-baseline"><span className="nk-display nk-row-title nk-row-title--lg">{o.name}</span><span className="nk-mono">{o.price}</span></span>
              <span className="nk-row-body">{meta(o)}</span>
            </Tap>
          ))}
        </div>
        {all && <div className="nk-after">{all}</div>}
      </SplitHead>
    )
  } else {
    body = (
      <Section>
        <Head p={p} metadata={metadata} />
        <div className="nk-list nk-list--ruled nk-grid-cards--after">
          {rows.map((o, i) => (
            <Tap key={i} to={o.to} className="nk-list-row nk-offer-row">
              <NkSeal name={o.glyph} size={52} />
              <span>
                <span className="nk-display nk-row-title">{o.name}</span>
                {meta(o) && <span className="nk-row-body">{meta(o)}</span>}
              </span>
              <span className="nk-row-end">
                {o.price && <span className="nk-mono">{o.price}</span>}
                {o.to && <NkArrow />}
              </span>
            </Tap>
          ))}
        </div>
      </Section>
    )
  }
  return <Band kind="offerings" p={p} variant={variant} pad={pad} vis={vis}>{body}</Band>
}

// ── Programs ───────────────────────────────────────────────────────────────────────────────

const JOURNEY_VARIANTS = ['cards', 'feature'] as const

function NetworkKitJourneysBlock({ p, metadata, pad, vis }: Common) {
  const variant = pick(p.variant, JOURNEY_VARIANTS, 'cards')
  const count = Math.max(1, Math.min(12, Number(p.count) || 3))
  const live = spaceOf(metadata)?.practices?.journeys ?? []
  const cards = (live.length
    ? live.slice(0, count).map((j) => ({ image: null as string | null, eyebrow: 'Program', title: j.title, meta: '', body: j.summary ?? '', price: '', note: j.adoptCount > 0 ? `${j.adoptCount} have taken it` : '', href: '' }))
    : arr(p.cards).slice(0, count).map((c) => ({ image: img(c.image), eyebrow: [str(c.eyebrow), str(c.weeks) && `${str(c.weeks)} weeks`].filter(Boolean).join(' · '), title: str(c.title), meta: str(c.meta), body: str(c.body), price: str(c.price), note: str(c.note), href: str(c.href) }))
  ).filter((c) => c.title)
  let body: ReactNode
  if (variant === 'feature' && cards.length) {
    const [first, ...rest] = cards.slice(0, 4)
    const to = hrefOf(first.href, metadata)
    body = (
      <Section>
        <Head p={p} metadata={metadata} />
        <div className="nk-feature" data-solo={rest.length ? undefined : ''}>
          <Tap to={to} className="nk-feature-main nk-grain nk-protect" >
            {first.image && (
              // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
              <img src={first.image} alt="" loading="lazy" />
            )}
            <span className="nk-feature-text">
              <span className="nk-badge nk-badge--accent">Starts next</span>
              <span className="nk-display nk-display--h3">{first.title}</span>
              {[first.eyebrow, first.meta, first.price].filter(Boolean).length > 0 && <span className="nk-feature-meta">{[first.eyebrow, first.meta, first.price].filter(Boolean).join(' · ')}</span>}
            </span>
          </Tap>
          {rest.length > 0 && <div className="nk-list nk-list--ruled">
            {rest.map((c, i) => (
              <Tap key={i} to={hrefOf(c.href, metadata)} className="nk-list-row nk-feature-row">
                <span>
                  {c.eyebrow && <span className="nk-eyebrow nk-eyebrow--bare nk-step-label">{c.eyebrow}</span>}
                  <span className="nk-display nk-row-title">{c.title}</span>
                  {c.body && <span className="nk-row-body">{c.body}</span>}
                </span>
                <span className="nk-row-end">{c.price && <span className="nk-mono">{c.price}</span>}<NkArrow /></span>
              </Tap>
            ))}
          </div>}
        </div>
      </Section>
    )
  } else {
    body = (
      <Section>
        <Head p={p} metadata={metadata} />
        <div className="nk-grid-cards nk-grid-cards--after">
          {cards.map((c, i) => (
            <Tap key={i} to={hrefOf(c.href, metadata)} className="nk-card nk-card--lift nk-entity">
              {c.image && (
                <div className="nk-photo nk-entity-cover">
                  {/* eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host */}
                  <img src={c.image} alt="" loading="lazy" />
                </div>
              )}
              <div className="nk-entity-body">
                {c.eyebrow && <div className="nk-entity-eyebrow"><NkGlyph name="arc" size={16} />{c.eyebrow}</div>}
                <h3 className="nk-display nk-card-title">{c.title}</h3>
                {c.meta && <div className="nk-row-body">{c.meta}</div>}
                {c.body && <p className="nk-entity-text">{c.body}</p>}
                {(c.price || c.note) && (
                  <div className="nk-card-foot">
                    <span className="nk-mono">{c.price}</span>
                    <span className="nk-meta">{c.note}</span>
                  </div>
                )}
              </div>
            </Tap>
          ))}
        </div>
      </Section>
    )
  }
  return <Band kind="journeys" p={p} variant={variant} pad={pad} vis={vis}>{body}</Band>
}

// ── Meetups ────────────────────────────────────────────────────────────────────────────────

const GATHERING_VARIANTS = ['split', 'calendar', 'cards'] as const

function NetworkKitGatheringsBlock({ p, metadata, now = new Date(), pad, vis }: Common) {
  const variant = pick(p.variant, GATHERING_VARIANTS, 'split')
  const count = Math.max(1, Math.min(12, Number(p.count) || 4))
  const events = upcoming(metadata, now).slice(0, count)
  const rows = (events.length
    ? events.map((e) => {
        const d = storedWallClock(e.startsAt)
        return { month: d ? MONTHS[d.getUTCMonth()] : '', day: d ? String(d.getUTCDate()) : '', title: e.title, meta: [d ? clock(d) : '', e.location ?? ''].filter(Boolean).join(' · '), note: e.priceLabel ?? '', href: eventHref(e, metadata) ?? '' }
      })
    : arr(p.rows).slice(0, count).map((r) => ({ month: str(r.month), day: str(r.day), title: str(r.title), meta: str(r.meta), note: str(r.note), href: hrefOf(str(r.href), metadata) ?? '' }))
  ).filter((r) => r.title)
  const src = img(p.image)
  const all = (kind: BtnKind) => (str(p.actionLabel) ? <Btn label={str(p.actionLabel)} href={str(p.actionHref)} kind={kind} metadata={metadata} arrow /> : null)
  const note = (n: string) => (n ? <span className={cls('nk-mono', /seat|left|full/i.test(n) && 'nk-badge nk-badge--accent')}>{n}</span> : null)
  const empty = !rows.length && str(p.empty) ? <p className="nk-row-body nk-empty">{str(p.empty)}</p> : null
  let body: ReactNode
  if (variant === 'calendar') {
    body = (
      <Section>
        <Head p={p} metadata={metadata} button={all('secondary')} />
        <div className="nk-list nk-list--ruled nk-list--strong nk-grid-cards--after">
          {rows.map((r, i) => (
            <Tap key={i} to={r.href || null} className="nk-list-row nk-cal-row">
              <span className="nk-cal-date"><span className="nk-display nk-cal-day" data-first={i === 0 ? '' : undefined}>{r.day}</span><span className="nk-eyebrow nk-eyebrow--bare">{r.month}</span></span>
              <span>
                <span className="nk-display nk-row-title nk-row-title--lg">{r.title}</span>
                {r.meta && <span className="nk-row-body">{r.meta}</span>}
              </span>
              <span className="nk-row-body nk-cal-note">{note(r.note)}</span>
              {r.href && <NkArrow size={18} />}
            </Tap>
          ))}
        </div>
        {empty}
      </Section>
    )
  } else if (variant === 'cards') {
    body = (
      <Section>
        <Head p={p} metadata={metadata} button={all('secondary')} />
        <div className="nk-grid-cards nk-grid-cards--after">
          {rows.map((r, i) => (
            <Tap key={i} to={r.href || null} className="nk-event-card nk-card--lift nk-protect nk-on-media" >
              {src && (
                // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
                <img src={src} alt="" loading="lazy" />
              )}
              <DateTile month={r.month} day={r.day} solid={i === 0} />
              <span className="nk-event-card-text">
                <span className="nk-display nk-card-title">{r.title}</span>
                {r.meta && <span className="nk-event-card-meta">{r.meta}</span>}
              </span>
            </Tap>
          ))}
        </div>
        {empty}
      </Section>
    )
  } else {
    body = (
      <Section>
        <div className="nk-split nk-split--stretch">
          <div className="nk-gather-main">
            <Head p={p} metadata={metadata} button={null} />
            {src && (
              <div className="nk-gather-photo nk-photo" data-grade="">
                {/* eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host */}
                <img src={src} alt={str(p.alt)} loading="lazy" />
              </div>
            )}
          </div>
          <div className="nk-gather-list">
            <div className="nk-list nk-list--ruled">
              {rows.map((r, i) => (
                <Tap key={i} to={r.href || null} className="nk-list-row nk-event-row">
                  <span className="nk-date" data-tint=""><b>{r.month}</b><span>{r.day}</span></span>
                  <span className="nk-event-row-main">
                    <span className="nk-event-row-title">{r.title}</span>
                    {r.meta && <span className="nk-row-body">{r.meta}</span>}
                  </span>
                  {note(r.note)}
                </Tap>
              ))}
            </div>
            {empty}
            {all('secondary') && <div className="nk-after">{all('secondary')}</div>}
          </div>
        </div>
      </Section>
    )
  }
  return <Band kind="gatherings" p={p} variant={variant} pad={pad} vis={vis}>{body}</Band>
}

// ── Membership ─────────────────────────────────────────────────────────────────────────────

const MEMBERSHIP_VARIANTS = ['tiers', 'table', 'spotlight'] as const

function NetworkKitMembershipBlock({ p, metadata, pad, vis }: Common) {
  const variant = pick(p.variant, MEMBERSHIP_VARIANTS, 'tiers')
  const tiers = arr(p.tiers).filter((t) => str(t.name)).map((t) => ({
    glyph: str(t.glyph) || 'circle', name: str(t.name), blurb: str(t.blurb), price: str(t.price), period: str(t.period), badge: str(t.badge), label: str(t.buttonLabel), href: str(t.href),
  }))
  const lead = tiers.findIndex((t) => t.badge)
  const featured = lead >= 0 ? lead : tiers.length > 1 ? 1 : 0
  const price = (t: (typeof tiers)[number]) => (t.price ? `${t.price}${t.period ? ` ${t.period}` : ''}` : '')
  let body: ReactNode
  if (variant === 'table') {
    body = (
      <Section>
        <Head p={p} metadata={metadata} />
        <div className="nk-list nk-list--strong nk-grid-cards--after">
          {tiers.map((t, i) => (
            <div key={i} className="nk-table-row" data-lead={i === featured && t.badge ? '' : undefined}>
              <span className="nk-table-name"><NkSeal name={t.glyph} size={44} tone={i === featured ? 'accent' : 'subtle'} /><span className="nk-display nk-row-title nk-row-title--lg">{t.name}</span></span>
              <span className="nk-row-body">{t.blurb}{t.badge && <span className="nk-badge nk-badge--accent">{t.badge}</span>}</span>
              <span className="nk-mono nk-nowrap">{price(t)}</span>
              <Btn label={t.label || str(p.buttonLabel) || 'Join'} href={t.href} kind={i === featured ? 'primary' : 'secondary'} metadata={metadata} size="sm" />
            </div>
          ))}
        </div>
      </Section>
    )
  } else if (variant === 'spotlight' && tiers.length) {
    const f = tiers[featured]
    const rest = tiers.filter((_, i) => i !== featured)
    body = (
      <Section>
        <Head p={p} metadata={metadata} />
        <div className="nk-spotlight nk-grid-cards--after">
          <div className="nk-card nk-tier-spot">
            <span className="nk-between"><NkSeal name={f.glyph} size={56} tone="accent" />{f.badge && <span className="nk-badge nk-badge--accent">{f.badge}</span>}</span>
            <span className="nk-display nk-display--h3">{f.name}</span>
            {f.blurb && <span className="nk-spot-blurb">{f.blurb}</span>}
            <span className="nk-spot-foot">
              <span>{f.price && <><span className="nk-display nk-price nk-price--lg">{f.price}</span>{f.period && <span className="nk-period"> {f.period}</span>}</>}</span>
              <Btn label={f.label || `Choose ${f.name}`} href={f.href} metadata={metadata} />
            </span>
          </div>
          <div className="nk-spot-rest">
            {rest.map((t, i) => (
              <Tap key={i} to={hrefOf(t.href, metadata)} className="nk-card nk-card--lift nk-spot-row">
                <NkSeal name={t.glyph} size={44} />
                <span>
                  <span className="nk-display nk-row-title">{t.name}</span>
                  {t.blurb && <span className="nk-row-body">{t.blurb}</span>}
                </span>
                {price(t) && <span className="nk-mono nk-nowrap">{price(t)}</span>}
              </Tap>
            ))}
          </div>
        </div>
      </Section>
    )
  } else {
    body = (
      <Section>
        <Head p={p} metadata={metadata} />
        <div className="nk-grid-cards nk-grid-cards--after">
          {tiers.map((t, i) => {
            const lead = i === featured && !!t.badge
            return (
              <div key={i} className="nk-card nk-tier" data-lead={lead ? '' : undefined}>
                <div className="nk-between"><NkSeal name={t.glyph} size={48} tone={lead ? 'accent' : 'subtle'} />{t.badge && <span className="nk-badge nk-badge--accent">{t.badge}</span>}</div>
                <span className="nk-display nk-card-title">{t.name}</span>
                {t.blurb && <span className="nk-door-body">{t.blurb}</span>}
                {t.price && <span className="nk-tier-price"><span className="nk-display nk-price" data-lead={lead ? '' : undefined}>{t.price}</span>{t.period && <span className="nk-period"> {t.period}</span>}</span>}
                <Btn label={t.label || `Choose ${t.name}`} href={t.href} kind={lead ? 'primary' : 'secondary'} metadata={metadata} />
              </div>
            )
          })}
        </div>
      </Section>
    )
  }
  return <Band kind="membership" p={p} variant={variant} pad={pad} vis={vis}>{body}</Band>
}

// ── Proof ──────────────────────────────────────────────────────────────────────────────────

const PROOF_VARIANTS = ['quote', 'wall', 'stats'] as const

function Ornament() {
  return <div className="nk-ornament" role="separator"><span /><i aria-hidden="true" /><span /></div>
}

function NetworkKitProofBlock({ p, metadata, pad, vis }: Common) {
  const variant = pick(p.variant, PROOF_VARIANTS, 'quote')
  const reviews = spaceOf(metadata)?.reviews
  const useLive = p.live !== false && !!reviews?.latest?.[0]?.body
  const liveQuotes = useLive ? (reviews?.latest ?? []).filter((r) => r.body).map((r) => ({ quote: r.body, who: r.author?.displayName ?? '', role: '', stars: r.rating })) : []
  const own = [{ quote: str(p.quote), who: str(p.who), role: str(p.role), stars: 0 }, ...arr(p.more).map((m) => ({ quote: str(m.quote), who: str(m.who), role: str(m.role), stars: 0 }))].filter((q) => q.quote)
  const quotes = liveQuotes.length ? liveQuotes : own
  const first = quotes[0]
  if (!first) return null
  const rating = useLive && reviews?.average ? `${reviews.average} from ${reviews.count} reviews` : ''
  const by = (q: (typeof quotes)[number]) => (q.who || q.role) && (
    <div className="nk-eyebrow nk-eyebrow--bare nk-proof-by">
      {q.who && <b>{q.who}</b>}
      {q.who && q.role && <span aria-hidden="true">·</span>}
      {q.role && <span>{q.role}</span>}
    </div>
  )
  const stars = (n: number) => <span className="nk-stars" role="img" aria-label={`${n} out of 5`}>{'★'.repeat(Math.max(0, Math.min(5, Math.round(n))))}</span>
  let body: ReactNode
  if (variant === 'wall') {
    body = (
      <Section className="nk-proof-wall">
        <div className="nk-mist nk-mist--corner" aria-hidden="true" />
        <div className="nk-proof-wall-in">
          <div className="nk-center"><Ornament />{str(p.eyebrow) && <div className="nk-eyebrow nk-wall-eyebrow">{str(p.eyebrow)}</div>}</div>
          <div className="nk-grid-cards nk-grid-cards--after">
            {quotes.slice(0, 3).map((q, i) => (
              <figure key={i} className="nk-card nk-quote-card">
                {q.stars > 0 && stars(q.stars)}
                <blockquote className="nk-display">“{q.quote}”</blockquote>
                <figcaption>{by(q)}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </Section>
    )
  } else if (variant === 'stats') {
    const own = arr(p.stats).filter((s) => str(s.value) && str(s.label)).map((s) => ({ value: str(s.value), label: str(s.label) }))
    const live = (spaceOf(metadata)?.highlights ?? []).filter((h) => h.label && Number.isFinite(h.value)).slice(0, 4).map((h) => ({ value: String(h.value), label: h.label }))
    const stats = (own.length ? own : live).slice(0, 4)
    body = (
      <Section>
        <div className="nk-split" data-solo={stats.length ? undefined : ''}>
          <div>
            <span className="nk-eyebrow">From a member</span>
            <blockquote className="nk-voice-quote">“{first.quote}”</blockquote>
            {by(first)}
          </div>
          {stats.length > 0 && (
            <div className="nk-stat-grid">
              {stats.map((s, i) => (
                <div key={i} className="nk-card nk-stat">
                  <div className="nk-display nk-stat-value">{s.value}</div>
                  <div className="nk-stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>
    )
  } else {
    body = (
      <Section className="nk-proof-quote">
        <div className="nk-mist" aria-hidden="true" />
        <div className="nk-proof-in">
          <Ornament />
          <blockquote className="nk-display nk-display--h2 nk-big-quote">“{first.quote}”</blockquote>
          {by(first)}
          {rating && <div className="nk-proof-rating">{stars(5)}<span className="nk-meta">{rating}</span></div>}
        </div>
      </Section>
    )
  }
  return <Band kind="proof" p={p} variant={variant} pad={pad} vis={vis}>{body}</Band>
}

// ── Shop ───────────────────────────────────────────────────────────────────────────────────

const SHOP_VARIANTS = ['grid', 'rail'] as const

function NetworkKitShopBlock({ p, metadata, pad, vis }: Common) {
  const variant = pick(p.variant, SHOP_VARIANTS, 'grid')
  const products = arr(p.products).filter((x) => str(x.name))
  const tiles = products.map((x, i) => {
    const src = img(x.image)
    return (
      <Tap key={i} to={hrefOf(str(x.href), metadata)} className="nk-tile">
        <div className="nk-tile-cover nk-photo">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
            <img src={src} alt="" loading="lazy" />
          ) : (
            <span className="nk-tile-icon"><NkGlyph name={str(x.glyph) || 'shop'} size={28} /></span>
          )}
          {str(x.kind) && <span className="nk-badge nk-tile-kind">{str(x.kind)}</span>}
        </div>
        <div className="nk-tile-body">
          <span className="nk-display nk-tile-title">{str(x.name)}</span>
          {str(x.price) && <span className="nk-mono">{str(x.price)}</span>}
        </div>
        {str(x.rating) && <span className="nk-meta">{str(x.rating)}</span>}
      </Tap>
    )
  })
  const action = str(p.actionLabel) ? <Btn label={str(p.actionLabel)} href={str(p.actionHref)} kind="secondary" metadata={metadata} /> : null
  const body = variant === 'rail' ? (
    <Section className="nk-section--rail">
      <div className="nk-rail-head"><Head p={p} metadata={metadata} button={action} kicker={false} /></div>
      <div className="nk-rail nk-grid-cards--after">{tiles.map((t, i) => <div key={i} className="nk-rail-item">{t}</div>)}</div>
    </Section>
  ) : (
    <Section>
      <Head p={p} metadata={metadata} button={action} kicker={false} />
      <div className="nk-grid-cards nk-grid-cards--after">{tiles}</div>
    </Section>
  )
  return <Band kind="shop" p={p} variant={variant} pad={pad} vis={vis}>{body}</Band>
}

// ── Library ────────────────────────────────────────────────────────────────────────────────

const LIBRARY_VARIANTS = ['grid', 'list'] as const

function NetworkKitLibraryBlock({ p, metadata, pad, vis }: Common) {
  const variant = pick(p.variant, LIBRARY_VARIANTS, 'grid')
  const items = arr(p.resources).filter((r) => str(r.title)).map((r) => ({ glyph: str(r.glyph) || 'half', type: str(r.type), title: str(r.title), meta: str(r.meta), price: str(r.price), to: hrefOf(str(r.href), metadata) }))
  const badge = (price: string) => price && <span className={cls('nk-badge', /^free$/i.test(price) && 'nk-badge--accent')}>{price}</span>
  const action = str(p.actionLabel) ? <Btn label={str(p.actionLabel)} href={str(p.actionHref)} kind="secondary" metadata={metadata} /> : null
  const body = variant === 'list' ? (
    <SplitHead p={p} metadata={metadata}>
      <div className="nk-list nk-list--ruled">
        {items.slice(0, 4).map((r, i) => (
          <Tap key={i} to={r.to} className="nk-list-row nk-lib-row">
            <span className="nk-accent-ink"><NkGlyph name={r.glyph} size={22} /></span>
            <span>
              <span className="nk-eyebrow nk-eyebrow--bare nk-step-label">{[r.type, r.meta].filter(Boolean).join(' · ')}</span>
              <span className="nk-display nk-row-title">{r.title}</span>
            </span>
            {badge(r.price)}
          </Tap>
        ))}
      </div>
      {action && <div className="nk-after">{action}</div>}
    </SplitHead>
  ) : (
    <Section>
      <Head p={p} metadata={metadata} />
      <div className="nk-grid-cards nk-grid-cards--after">
        {items.slice(0, 6).map((r, i) => (
          <Tap key={i} to={r.to} className="nk-card nk-card--lift nk-resource">
            <span className="nk-between"><span className="nk-accent-ink"><NkGlyph name={r.glyph} size={22} /></span>{badge(r.price)}</span>
            {r.type && <span className="nk-eyebrow nk-eyebrow--bare">{r.type}</span>}
            <span className="nk-display nk-card-title nk-card-title--sm">{r.title}</span>
            {r.meta && <span className="nk-meta nk-push">{r.meta}</span>}
          </Tap>
        ))}
      </div>
    </Section>
  )
  return <Band kind="library" p={p} variant={variant} pad={pad} vis={vis}>{body}</Band>
}

// ── Letter ─────────────────────────────────────────────────────────────────────────────────

const LETTER_VARIANTS = ['band', 'card'] as const

function NetworkKitLetterBlock({ p, metadata, pad, vis }: Common) {
  const variant = pick(p.variant, LETTER_VARIANTS, 'band')
  const links = metadata?.links as SiteLinkMap | undefined
  const form = <NetworkKitLetterForm slug={links?.slug ?? null} placeholder={str(p.placeholder)} buttonLabel={str(p.buttonLabel)} successMessage={str(p.successMessage)} />
  const copy = (
    <div className="nk-display nk-display--h3 nk-letter-title">
      {str(p.title)} {str(p.em) && <em>{str(p.em)}</em>}
    </div>
  )
  const body = variant === 'card' ? (
    <Section>
      <div className="nk-letter-card nk-grain">
        <NkSeal name="circle" size={64} tone="accent" />
        {copy}
        {str(p.lead) && <p className="nk-lead nk-letter-lead">{str(p.lead)}</p>}
        <div className="nk-letter-form-wrap">{form}</div>
      </div>
    </Section>
  ) : (
    <Section>
      <div className="nk-split nk-letter-band">
        <div className="nk-letter-copy">
          <NkSeal name="circle" size={64} tone="accent" />
          <div>
            {copy}
            {str(p.lead) && <p className="nk-lead nk-letter-lead">{str(p.lead)}</p>}
          </div>
        </div>
        {form}
      </div>
    </Section>
  )
  return <Band kind="letter" p={p} variant={variant} pad={pad} vis={vis}>{body}</Band>
}

// ── Questions ──────────────────────────────────────────────────────────────────────────────

const FAQ_VARIANTS = ['split', 'stack'] as const

function NetworkKitFAQBlock({ p, metadata, pad, vis }: Common) {
  const variant = pick(p.variant, FAQ_VARIANTS, 'split')
  const own = spaceOf(metadata)?.faqs ?? []
  const items = (own.length ? own.map((f) => ({ q: f.question, a: f.answer })) : arr(p.items).map((f) => ({ q: str(f.q), a: str(f.a) }))).filter((f) => f.q)
  if (!items.length) return null
  const list = (
    <div className="nk-faq">
      {items.map((f, i) => (
        <details key={i} name="nk-faq" open={i === 0}>
          <summary>
            <span>{f.q}</span>
            <span className="nk-faq-toggle"><NkChevron /></span>
          </summary>
          <p>{f.a}</p>
        </details>
      ))}
    </div>
  )
  const body = variant === 'stack' ? (
    <Section>
      <div className="nk-faq-stack">
        <div className="nk-center"><Head p={p} metadata={metadata} button={null} center kicker={false} /></div>
        <div className="nk-grid-cards--after">{list}</div>
      </div>
    </Section>
  ) : (
    <Section>
      <div className="nk-split nk-split--top">
        <div className="nk-sticky">
          <Head p={p} metadata={metadata} button={null} kicker={false} />
          {str(p.side) && <p className="nk-lead nk-faq-side">{str(p.side)}</p>}
        </div>
        {list}
      </div>
    </Section>
  )
  return <Band kind="faq" p={p} variant={variant} pad={pad} vis={vis}>{body}</Band>
}

// ── Closing call ───────────────────────────────────────────────────────────────────────────

const CTA_VARIANTS = ['center', 'split', 'band', 'card'] as const

function NetworkKitCTABlock({ p, metadata, pad, vis }: Common) {
  const variant = pick(p.variant, CTA_VARIANTS, 'center')
  const src = img(p.image)
  const title = (
    <h2 className="nk-display nk-display--h2 nk-cta-title">
      <InlineText text={str(p.title)} />
    </h2>
  )
  const primary = <Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} metadata={metadata} size="lg" arrow />
  // The inner pages' closing call (design CtaBand): a compact tinted card, the label and line on the left, one button on the right.
  if (variant === 'card') {
    return (
      <Band kind="cta" p={p} variant={variant} pad={pad} vis={vis}>
        <div className="nk-cta-split-wrap">
          <div className="nk-cta-card nk-grain">
            <div>
              {str(p.eyebrow) && <div className="nk-eyebrow">{str(p.eyebrow)}</div>}
              {title}
            </div>
            {primary}
          </div>
        </div>
      </Band>
    )
  }
  if (variant === 'split') {
    return (
      <Band kind="cta" p={p} variant={variant} pad={pad} vis={vis}>
        <div className="nk-cta-split-wrap">
          <div className="nk-cta-split nk-grain">
            {title}
            <div className="nk-actions nk-actions--end">
              {primary}
              <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind="secondary" metadata={metadata} size="lg" />
            </div>
          </div>
        </div>
      </Band>
    )
  }
  if (variant === 'band') {
    return (
      <Band kind="cta" p={p} variant={variant} pad={pad} vis={vis}>
        <div className="nk-cta-band-wrap">
          <div className="nk-cta-band nk-frame-media nk-on-media" data-grade="">
            {src && (
              // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
              <img src={src} alt={str(p.alt)} loading="lazy" />
            )}
            <div className="nk-hero-scrim" aria-hidden="true" />
            <div className="nk-cta-band-in">{title}<div className="nk-actions" data-center="">{primary}</div></div>
          </div>
        </div>
      </Band>
    )
  }
  return (
    <Band kind="cta" p={p} variant={variant} pad={pad} vis={vis} className="nk-contour">
      <Section className="nk-cta-center">
        {title}
        <div className="nk-actions" data-center="">{primary}</div>
      </Section>
    </Band>
  )
}

// ── Registry ─────────────────────────────────────────────────────────────────────────────

export const text = (label: string, hint?: string) => ({ type: 'text', label, ...(hint ? { hint } : {}) }) as const
export const area = (label: string, hint?: string) => ({ type: 'textarea', label, ...(hint ? { hint } : {}) }) as const
export const image = { ...loomImageField, label: 'Photo' }
export const VOICE_HINT = 'Wrap a word in *stars* to set it in the italic.'
export const LINK_HINT = 'Start with ~/ for a page of this site, like ~/book.'
export const glyph = { type: 'select', label: 'Mark', options: NETWORK_KIT_GLYPH_NAMES.map((v) => ({ label: v, value: v })) } as const
export const head = { eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), lead: area('Line under the heading') }
export const action = { actionLabel: text('Button beside the heading'), actionHref: text('Button beside the heading: where it goes', LINK_HINT) }
export const variantField = (options: [string, string][]) => ({ type: 'select', label: 'Layout', options: options.map(([value, label]) => ({ label, value })) }) as const
export const bandField = { type: 'select', label: 'Ground', options: [{ label: 'Paper', value: '' }, { label: 'Sand, with a wavy top edge', value: 'sand' }] } as const
export const countField = { type: 'number', label: 'How many to show', min: 1, max: 12 } as const

export function block<P extends Props>(label: string, fields: Record<string, unknown>, defaults: P, Comp: (args: Common) => ReactNode): ComponentConfig {
  return {
    label,
    fields: { ...fields, band: bandField, layout: layoutField },
    defaultProps: { ...defaults, layout: layoutDefault },
    render: (props: Props & { puck?: { metadata?: Props } }) => {
      const { pad, vis } = layoutOf(props.layout)
      return <Comp p={props} metadata={props.puck?.metadata} pad={pad} vis={vis} />
    },
  } as unknown as ComponentConfig
}

export const networkKitComponents: Record<string, ComponentConfig> = {
  NetworkKitHero: block('Network hero', {
    variant: variantField([['split', 'Text beside the leaf photo'], ['full', 'Photo, text at the bottom'], ['center', 'Photo, text in the middle'], ['left', 'Photo, text on the left']]),
    flip: { type: 'radio', label: 'Photo side', options: [{ label: 'Right', value: false }, { label: 'Left', value: true }] },
    eyebrow: text('Small label'), title: area('Heading', `${VOICE_HINT} A new line starts a new row.`), lead: area('Intro'),
    primaryLabel: text('Main button'), primaryHref: text('Main button link', LINK_HINT), secondaryLabel: text('Second button'), secondaryHref: text('Second button link', LINK_HINT),
    note: text('Small line under the buttons', 'Optional. Say where you meet, in your own words.'),
    image, alt: text('Photo description', 'For screen readers.'), pos: text('Photo crop', 'Where the photo is held when it is cropped, like center 40%.'),
    showEvent: { type: 'radio', label: 'Show the next event on the photo', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] },
  }, { ...NETWORK_KIT_HERO }, NetworkKitHeroBlock),
  NetworkKitLive: block('Network liveness strip (live)', {
    items: { type: 'array', label: 'Up to four facts', hint: 'A fact set to a live source shows the Space\'s own next event, programs or member count when there are any. A fact with no words is left out.', arrayFields: {
      source: { type: 'select', label: 'Source', options: [{ label: 'Written by hand', value: 'custom' }, { label: 'Next event', value: 'nextEvent' }, { label: 'Programs open', value: 'journeys' }, { label: 'Members', value: 'members' }] },
      glyph, label: text('Label'), value: text('Words'), href: text('Link', LINK_HINT),
    } },
  }, { ...NETWORK_KIT_LIVE }, NetworkKitLiveBlock),
  NetworkKitSteps: block('Network how it works', {
    variant: variantField([['grid', 'Three cards'], ['timeline', 'Timeline beside the heading'], ['strip', 'Ruled strip']]),
    eyebrow: text('Small label'), title: area('Heading', VOICE_HINT),
    steps: { type: 'array', label: 'Steps', arrayFields: { glyph, title: text('Name'), body: area('Words') } },
  }, { ...NETWORK_KIT_STEPS }, NetworkKitStepsBlock),
  NetworkKitDoors: block('Network ways in', {
    variant: variantField([['grid', 'Cards'], ['list', 'Numbered list'], ['tiles', 'Tiles']]),
    ...head,
    doors: { type: 'array', label: 'Doors', arrayFields: { glyph, title: text('Name'), body: area('Line under the name'), href: text('Link', LINK_HINT) } },
  }, { ...NETWORK_KIT_DOORS }, NetworkKitDoorsBlock),
  NetworkKitOfferings: block('Network offerings', {
    variant: variantField([['list', 'List'], ['cards', 'Cards'], ['split', 'List beside the heading']]),
    ...head, ...action,
    offerings: { type: 'array', label: 'Offerings', arrayFields: { glyph, name: text('Name'), minutes: text('Minutes'), blurb: area('Line under the name'), price: text('Price'), href: text('Link', LINK_HINT) } },
  }, { ...NETWORK_KIT_OFFERINGS }, NetworkKitOfferingsBlock),
  NetworkKitJourneys: block('Network programs (live)', {
    variant: variantField([['cards', 'Cards'], ['feature', 'One large, the rest in a list']]),
    ...head, ...action, count: countField,
    cards: { type: 'array', label: 'Cards', hint: 'Used when the Space has no live programs of its own.', arrayFields: { image, eyebrow: text('Small label'), weeks: text('Weeks'), title: text('Name'), meta: text('Next run'), body: area('Outcome'), price: text('Price'), note: text('Small note'), href: text('Link', LINK_HINT) } },
  }, { ...NETWORK_KIT_JOURNEYS }, NetworkKitJourneysBlock),
  NetworkKitGatherings: block('Network meetups (live)', {
    variant: variantField([['split', 'List beside a photo'], ['calendar', 'Calendar rows'], ['cards', 'Photo cards']]),
    ...head, ...action, count: countField, image, alt: text('Photo description', 'For screen readers.'),
    empty: area('Line when there are no dates yet'),
    rows: { type: 'array', label: 'Rows', hint: 'Used when the Space has no upcoming events of its own.', arrayFields: { month: text('Month'), day: text('Day'), title: text('Name'), meta: text('Time and place'), note: text('Price or seats'), href: text('Link', LINK_HINT) } },
  }, { ...NETWORK_KIT_GATHERINGS }, NetworkKitGatheringsBlock),
  NetworkKitMembership: block('Network membership', {
    variant: variantField([['tiers', 'Tier cards'], ['table', 'Table'], ['spotlight', 'One tier in the spotlight']]),
    ...head, buttonLabel: text('Table button'),
    tiers: { type: 'array', label: 'Tiers', hint: 'A tier with a badge is the lead one.', arrayFields: { glyph, name: text('Name'), blurb: area('Line under the name'), price: text('Price'), period: text('After the price', 'Like / month.'), badge: text('Badge'), buttonLabel: text('Button'), href: text('Link', LINK_HINT) } },
  }, { ...NETWORK_KIT_MEMBERSHIP }, NetworkKitMembershipBlock),
  NetworkKitProof: block('Network quote (live)', {
    variant: variantField([['quote', 'One large quote'], ['wall', 'Three quotes'], ['stats', 'Quote beside figures']]),
    live: { type: 'radio', label: 'Use the Space\'s latest reviews', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] },
    eyebrow: text('Label above the quotes', 'Three quotes only.'),
    quote: area('Quote'), who: text('Name'), role: text('Role'),
    more: { type: 'array', label: 'More quotes (three quotes only)', arrayFields: { quote: area('Quote'), who: text('Name'), role: text('Role') } },
    stats: { type: 'array', label: 'Figures (quote beside figures only)', hint: 'Real numbers only. With none written, the Space\'s own counts are used.', arrayFields: { value: text('Number'), label: text('What it counts') } },
  }, { ...NETWORK_KIT_PROOF }, NetworkKitProofBlock),
  NetworkKitShop: block('Network shop', {
    variant: variantField([['grid', 'Grid'], ['rail', 'Sideways rail']]),
    eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), ...action,
    products: { type: 'array', label: 'Products', arrayFields: { image, glyph, name: text('Name'), kind: text('Kind'), price: text('Price'), rating: text('Small line under it'), href: text('Link', LINK_HINT) } },
  }, { ...NETWORK_KIT_SHOP }, NetworkKitShopBlock),
  NetworkKitLibrary: block('Network library', {
    variant: variantField([['grid', 'Cards'], ['list', 'List beside the heading']]),
    ...head, ...action,
    resources: { type: 'array', label: 'Resources', arrayFields: { glyph, type: text('Kind'), title: text('Name'), meta: text('Small line'), price: text('Price'), href: text('Link', LINK_HINT) } },
  }, { ...NETWORK_KIT_LIBRARY }, NetworkKitLibraryBlock),
  NetworkKitLetter: block('Network letter sign-up', {
    variant: variantField([['band', 'Band'], ['card', 'Centred card']]),
    title: text('Heading'), em: text('Heading, italic part'), lead: area('Line under the heading'), placeholder: text('Email field hint'), buttonLabel: text('Button'), successMessage: text('Thank-you line', 'Say thanks. Leave out any day or promise.'),
  }, { ...NETWORK_KIT_LETTER }, NetworkKitLetterBlock),
  NetworkKitFAQ: block('Network questions (live)', {
    variant: variantField([['split', 'Heading beside the list'], ['stack', 'Centred list']]),
    eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), side: area('Line under the heading', 'Heading beside the list only.'),
    items: { type: 'array', label: 'Questions', hint: 'Used when the Space has no questions of its own.', arrayFields: { q: text('Question'), a: area('Answer') } },
  }, { ...NETWORK_KIT_FAQ }, NetworkKitFAQBlock),
  NetworkKitCTA: block('Network closing call', {
    variant: variantField([['center', 'Centred'], ['split', 'Card, buttons on the right'], ['band', 'Photo band'], ['card', 'Compact card, one button']]),
    eyebrow: text('Small label', 'Compact card only.'), title: area('Heading', `${VOICE_HINT} A new line starts a new row.`), buttonLabel: text('Main button'), buttonHref: text('Main button link', LINK_HINT),
    secondaryLabel: text('Second button', 'Card only.'), secondaryHref: text('Second button link', LINK_HINT), image, alt: text('Photo description', 'For screen readers.'),
  }, { ...NETWORK_KIT_CTA }, NetworkKitCTABlock),
}

export const NETWORK_KIT_CATEGORY_COMPONENTS = Object.keys(networkKitComponents)
