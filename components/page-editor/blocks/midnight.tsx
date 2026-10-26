import type { ReactNode } from 'react'
import type { ComponentConfig } from '@/lib/page-editor/types'
import { layoutField, layoutDefault, padClass, visClass, type LayoutValue } from '@/lib/page-editor/layout'
import { safeImageSrc } from '@/lib/safe-image-src'
import { safeImageUrl, safeUrl } from '@/lib/entity-blocks/block-content'
import { siteLocalHref, type SiteLinkMap } from '@/lib/sites/house-theme'
import { storedWallClock } from '@/lib/sites/site-events'
import { loomImageField } from '@/lib/page-editor/loom-image-field'
import { InlineText } from '@/components/sites/inline-text'
import { MidnightLetterForm } from '@/components/sites/midnight-letter-form'
import { MidnightSeal, MidnightSigil, MIDNIGHT_SIGIL_NAMES } from '@/components/sites/midnight-sigil'
import {
  MIDNIGHT_CTA, MIDNIGHT_DOORS, MIDNIGHT_FAQ, MIDNIGHT_GATHERINGS, MIDNIGHT_HERO, MIDNIGHT_JOURNEYS, MIDNIGHT_LETTER, MIDNIGHT_LIBRARY,
  MIDNIGHT_LIVE, MIDNIGHT_MEMBERSHIP, MIDNIGHT_OFFERINGS, MIDNIGHT_PROOF, MIDNIGHT_SHOP,
} from '@/lib/sites/midnight-home'

// ── The Midnight block family (Midnight design system, "Web Theme", 2026-10-26) ─────────────────────────────
// Every section of the design's Home is one registered block here, in the design's markup: the hero (split with
// the arch, or a banner), the liveness strip, four doors, offerings, Journeys, gatherings, membership, the quote
// band, the shop, the library, the letter, the questions and the closing call. Server Components, except the
// letter form. Live blocks read the Space's own rows from `puck.metadata.space` (events, Journeys, reviews,
// questions, highlights) and fall back to the cards the owner wrote. Every look is the Midnight skin's
// (components/sites/midnight-blocks-css.ts), tokens only.

type Props = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const arr = (v: unknown): Props[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Props[]) : [])
const img = (v: unknown) => safeImageSrc(safeImageUrl(v) || null)
const cls = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')
const layoutOf = (layout: unknown) => ({ pad: padClass(layout as LayoutValue), vis: visClass(layout as LayoutValue) })

/** A link through the site's link map. `~/page` means "this Space's page". Kept as written without a map. */
function hrefOf(raw: string, metadata: Props | undefined): string | null {
  if (!raw) return null
  if (raw.startsWith('#')) return raw
  const links = metadata?.links as SiteLinkMap | undefined
  if (!links) return raw.startsWith('~/') ? `/spaces/space/${raw.slice(2)}` : safeUrl(raw) || (raw.startsWith('/') ? raw : null)
  const own = raw.startsWith('~/') ? `/spaces/${links.slug}/${raw.slice(2)}` : raw
  if (links.contactHref && /^mailto:/i.test(own)) return links.contactHref
  return siteLocalHref(own, links)?.href ?? (/^\/(?:spaces|circles|events|market)(?:\/|[?#]|$)|^\/sign-in(?:[?#]|$)/.test(own) ? `${links.origin}${own}` : null)
}
const external = (href: string) => /^https?:\/\//.test(href)
const rel = (href: string) => (external(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  )
}

function Btn({ label, href, kind = 'primary', metadata, arrow = false }: { label: string; href: string; kind?: 'primary' | 'secondary' | 'ghost'; metadata?: Props; arrow?: boolean }) {
  const to = label ? hrefOf(href, metadata) : null
  if (!to) return null
  return (
    <a className={cls('hs-btn', kind === 'primary' ? 'hs-btn-primary' : kind === 'ghost' ? 'hs-btn-ghost' : 'hs-btn-soft')} href={to} {...rel(to)}>
      {label}
      {arrow && <Arrow />}
    </a>
  )
}

/** The section head (design SectionHeading): a roman index, a star, the eyebrow, the big title, an italic kicker, and an optional button to the right. */
function Head({ p, metadata, numbered = true, button }: { p: Props; metadata?: Props; numbered?: boolean; button?: ReactNode }) {
  if (!str(p.eyebrow) && !str(p.title) && !str(p.lead)) return null
  const action = button ?? (str(p.actionLabel) ? <Btn label={str(p.actionLabel)} href={str(p.actionHref)} kind="secondary" metadata={metadata} /> : null)
  return (
    <div className="mn-head">
      <div className="mn-head-copy">
        {(str(p.eyebrow) || numbered) && (
          <div className="mn-eyebrow">
            {numbered && str(p.title) && <span className="mn-index" aria-hidden="true" />}
            {numbered && str(p.title) && str(p.eyebrow) && <span className="mn-star" aria-hidden="true">✦</span>}
            {str(p.eyebrow) && <span>{str(p.eyebrow)}</span>}
          </div>
        )}
        {str(p.title) && (
          <h2 className="mn-title">
            <InlineText text={str(p.title)} />
          </h2>
        )}
        {str(p.lead) && <p className="mn-kicker">{str(p.lead)}</p>}
      </div>
      {action}
    </div>
  )
}

/** The arch (design ArchFrame): a photo in an arched window with an offset hairline. */
function Arch({ src, alt, ratio = 'tall', children }: { src: string | null; alt: string; ratio?: 'tall' | 'portrait'; children?: ReactNode }) {
  return (
    <figure className={cls('mn-arch', `mn-arch--${ratio}`)}>
      <div className="mn-arch-frame">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
          <img src={src} alt={alt} loading="lazy" />
        )}
        <div className="mn-mist mn-mist--low" aria-hidden="true" />
        {children}
      </div>
    </figure>
  )
}

// ── Live rows from the data bag ─────────────────────────────────────────────────────────────

interface EventRow { id: string; slug?: string; title: string; startsAt: string; endsAt?: string | null; location?: string | null; priceLabel?: string | null; isCancelled?: boolean; ticketsMode?: boolean }
const isRow = (e: unknown): e is EventRow => !!e && typeof (e as EventRow).id === 'string' && typeof (e as EventRow).title === 'string' && typeof (e as EventRow).startsAt === 'string'
interface SpaceBag {
  events?: unknown
  practices?: { journeys?: { id: string; slug: string; title: string; summary: string | null; adoptCount: number }[] }
  reviews?: { average: number | null; count: number; latest?: { id: string; rating: number; body: string; author: { displayName: string } | null }[] }
  faqs?: { id: string; question: string; answer: string }[]
  highlights?: { label: string; value: number }[]
}
const spaceOf = (metadata: Props | undefined) => (metadata?.space ?? undefined) as SpaceBag | undefined

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const clock = (d: Date) => `${d.getUTCHours() % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')}${d.getUTCHours() < 12 ? 'am' : 'pm'}`

/** The Space's upcoming events, soonest first, each start read as the stored wall clock. */
function upcoming(metadata: Props | undefined, now: Date): EventRow[] {
  const raw = spaceOf(metadata)?.events
  if (!Array.isArray(raw)) return []
  const today = now.toISOString().slice(0, 10)
  return raw.filter(isRow).filter((e) => !e.isCancelled && e.startsAt.slice(0, 10) >= today).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/** "Thu 30 Oct · 10:00am". */
function whenOf(startsAt: string): string {
  const d = storedWallClock(startsAt)
  return d ? `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} · ${clock(d)}` : ''
}

function eventHref(e: EventRow, metadata: Props | undefined): string | null {
  if (!e.slug) return null
  const origin = (metadata?.links as SiteLinkMap | undefined)?.origin
  return origin ? `${origin}/events/${e.slug}` : `/events/${e.slug}`
}

type Common = { p: Props; metadata?: Props; now?: Date; pad?: string; vis?: string }

// ── Hero ─────────────────────────────────────────────────────────────────────────────────

function MidnightHeroBlock({ p, metadata, pad, vis }: Common) {
  const layout = str(p.layout) === 'banner' ? 'banner' : str(p.layout) === 'center' ? 'center' : 'split'
  const src = img(p.image)
  const text = (
    <>
      {str(p.eyebrow) && <div className="mn-eyebrow">{str(p.eyebrow)}</div>}
      <h1 className="mn-display">
        <InlineText text={str(p.title)} />
      </h1>
      {str(p.lead) && <p className="mn-lead">{str(p.lead)}</p>}
      {(str(p.primaryLabel) || str(p.secondaryLabel)) && (
        <div className="mn-actions">
          <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} metadata={metadata} />
          <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind="secondary" metadata={metadata} />
        </div>
      )}
    </>
  )
  if (layout === 'split') {
    return (
      <section data-mn="hero" className={cls('mn-section mn-hero mn-grain', pad, vis)}>
        <div className="mn-mist" aria-hidden="true" />
        <div className="mn-hero-copy">{text}</div>
        <Arch src={src} alt={str(p.alt)} ratio="portrait" />
      </section>
    )
  }
  return (
    <section data-mn="hero" className={cls('mn-hero mn-hero--photo mn-grain', layout === 'center' && 'mn-hero--center', layout === 'banner' && 'mn-hero--banner', pad, vis)}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
        <img className="mn-hero-photo" src={src} alt={str(p.alt)} />
      )}
      <div className="mn-protect" aria-hidden="true" />
      <div className="mn-mist mn-mist--low" aria-hidden="true" />
      <div className="mn-hero-copy">{text}</div>
    </section>
  )
}

// ── The liveness strip ─────────────────────────────────────────────────────────────────────

function MidnightLiveBlock({ p, metadata, now = new Date(), pad, vis }: Common) {
  const space = spaceOf(metadata)
  const next = upcoming(metadata, now)[0]
  const items = arr(p.items).slice(0, 4).map((it) => {
    const source = str(it.source)
    let value = str(it.value)
    if (source === 'nextEvent' && next) value = `${next.title} · ${whenOf(next.startsAt)}`
    if (source === 'journeys' && space?.practices?.journeys?.length) value = `${space.practices.journeys.length} Journeys open`
    if (source === 'members') {
      const n = space?.highlights?.find((h) => /member/i.test(h.label))?.value
      if (n) value = `${n} members`
    }
    return { sigil: str(it.sigil) || 'moon-new', label: str(it.label), value, href: hrefOf(str(it.href), metadata) }
  }).filter((it) => it.label && it.value)
  if (!items.length) return null
  return (
    <section data-mn="live" className={cls('mn-live', pad, vis)} aria-label="Right now">
      {items.map((it, i) => {
        const inner = (
          <>
            <span className="mn-live-icon"><MidnightSigil name={it.sigil} size={18} /></span>
            <span>
              <span className="mn-eyebrow mn-eyebrow--block">{it.label}</span>
              <span className="mn-live-value">{it.value}</span>
            </span>
          </>
        )
        return it.href ? <a key={i} className="mn-live-item" href={it.href} {...rel(it.href)}>{inner}</a> : <div key={i} className="mn-live-item">{inner}</div>
      })}
    </section>
  )
}

// ── Doors ──────────────────────────────────────────────────────────────────────────────────

function MidnightDoorsBlock({ p, metadata, pad, vis }: Common) {
  const doors = arr(p.doors).filter((d) => str(d.title))
  return (
    <section data-mn="doors" className={cls('mn-section', pad, vis)}>
      <Head p={p} metadata={metadata} />
      <div className="mn-cells">
        {doors.map((d, i) => {
          const to = hrefOf(str(d.href), metadata)
          const inner = (
            <>
              <MidnightSeal name={str(d.sigil) || 'moon-new'} />
              <span className="mn-card-title">{str(d.title)}</span>
              {str(d.body) && <span className="mn-muted">{str(d.body)}</span>}
              {to && <span className="mn-eyebrow mn-open">Open<Arrow /></span>}
            </>
          )
          return to ? <a key={i} className="mn-cell mn-door" href={to} {...rel(to)}>{inner}</a> : <div key={i} className="mn-cell mn-door">{inner}</div>
        })}
      </div>
    </section>
  )
}

// ── Offerings ─────────────────────────────────────────────────────────────────────────────

function MidnightOfferingsBlock({ p, metadata, pad, vis }: Common) {
  const rows = arr(p.offerings).filter((o) => str(o.name))
  return (
    <section data-mn="offerings" className={cls('mn-section', pad, vis)}>
      <Head p={p} metadata={metadata} />
      <div className="mn-rows">
        {rows.map((o, i) => {
          const to = hrefOf(str(o.href), metadata)
          const inner = (
            <>
              <MidnightSeal name={str(o.sigil) || 'moon-new'} size={52} />
              <span>
                <span className="mn-row-title">{str(o.name)}</span>
                <span className="mn-muted mn-row-meta">{[str(o.minutes) && `${str(o.minutes)} min`, str(o.blurb)].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="mn-row-end">
                {str(o.price) && <span className="mn-mono">{str(o.price)}</span>}
                {to && <Arrow />}
              </span>
            </>
          )
          return to ? <a key={i} className="mn-row" href={to} {...rel(to)}>{inner}</a> : <div key={i} className="mn-row">{inner}</div>
        })}
      </div>
    </section>
  )
}

// ── Journeys ──────────────────────────────────────────────────────────────────────────────

function MidnightJourneysBlock({ p, metadata, pad, vis }: Common) {
  const count = Math.max(1, Math.min(12, Number(p.count) || 3))
  const live = spaceOf(metadata)?.practices?.journeys ?? []
  const cards = live.length
    ? live.slice(0, count).map((j) => ({ image: null as string | null, eyebrow: 'Journey', title: j.title, meta: '', body: j.summary ?? '', price: '', note: j.adoptCount > 0 ? `${j.adoptCount} have taken it` : '', href: '' }))
    : arr(p.cards).slice(0, count).map((c) => ({ image: img(c.image), eyebrow: str(c.eyebrow), title: str(c.title), meta: str(c.meta), body: str(c.body), price: str(c.price), note: str(c.note), href: str(c.href) }))
  return (
    <section data-mn="journeys" className={cls('mn-section', pad, vis)}>
      <Head p={p} metadata={metadata} />
      <div className="mn-grid mn-grid--wide">
        {cards.filter((c) => c.title).map((c, i) => {
          const to = hrefOf(c.href, metadata)
          const inner = (
            <>
              {c.image && (
                <div className="mn-cover">
                  {/* eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host */}
                  <img src={c.image} alt="" loading="lazy" />
                </div>
              )}
              <div className="mn-card-body">
                {c.eyebrow && <div className="mn-eyebrow mn-eyebrow--icon"><MidnightSigil name="moon-waxing" size={13} />{c.eyebrow}</div>}
                <h3 className="mn-card-title">{c.title}</h3>
                {c.meta && <div className="mn-muted mn-small">{c.meta}</div>}
                {c.body && <p className="mn-muted mn-body-sm">{c.body}</p>}
                {(c.price || c.note) && (
                  <div className="mn-card-foot">
                    <span className="mn-mono">{c.price}</span>
                    <span className="mn-subtle mn-small">{c.note}</span>
                  </div>
                )}
              </div>
            </>
          )
          return to ? <a key={i} className="mn-card" href={to} {...rel(to)}>{inner}</a> : <article key={i} className="mn-card">{inner}</article>
        })}
      </div>
    </section>
  )
}

// ── Gatherings ────────────────────────────────────────────────────────────────────────────

function MidnightGatheringsBlock({ p, metadata, now = new Date(), pad, vis }: Common) {
  const count = Math.max(1, Math.min(12, Number(p.count) || 4))
  const events = upcoming(metadata, now).slice(0, count)
  const rows = events.length
    ? events.map((e) => {
        const d = storedWallClock(e.startsAt)
        return { month: d ? MONTHS[d.getUTCMonth()] : '', day: d ? String(d.getUTCDate()) : '', title: e.title, meta: [d ? clock(d) : '', e.location ?? ''].filter(Boolean).join(' · '), note: e.priceLabel ?? '', href: eventHref(e, metadata) ?? '' }
      })
    : arr(p.rows).slice(0, count).map((r) => ({ month: str(r.month), day: str(r.day), title: str(r.title), meta: str(r.meta), note: str(r.note), href: hrefOf(str(r.href), metadata) ?? '' }))
  const src = img(p.image)
  const noPhoto = !src
  return (
    <section data-mn="gatherings" className={cls('mn-section mn-split', noPhoto && 'mn-split--solo', pad, vis)}>
      <div className="mn-split-main">
        <Head p={p} metadata={metadata} button={<></>} />
        {src && <Arch src={src} alt={str(p.alt)} />}
      </div>
      <div>
        <div className="mn-rows mn-rows--tight">
          {rows.filter((r) => r.title).map((r, i) => {
            const inner = (
              <>
                <span className="mn-stamp"><b>{r.month}</b><span>{r.day}</span></span>
                <span className="mn-row-main">
                  <span className="mn-row-line">{r.title}</span>
                  {r.meta && <span className="mn-muted mn-small">{r.meta}</span>}
                </span>
                {r.note && <span className={cls('mn-mono mn-note', /seat|left|full/i.test(r.note) && 'mn-badge')}>{r.note}</span>}
              </>
            )
            return r.href ? <a key={i} className="mn-row mn-row--event" href={r.href} {...rel(r.href)}>{inner}</a> : <div key={i} className="mn-row mn-row--event">{inner}</div>
          })}
        </div>
        {str(p.actionLabel) && <div className="mn-after"><Btn label={str(p.actionLabel)} href={str(p.actionHref)} kind="ghost" metadata={metadata} /></div>}
      </div>
    </section>
  )
}

// ── Membership ────────────────────────────────────────────────────────────────────────────

function MidnightMembershipBlock({ p, metadata, pad, vis }: Common) {
  const tiers = arr(p.tiers).filter((t) => str(t.name))
  return (
    <section data-mn="membership" className={cls('mn-section', pad, vis)}>
      <Head p={p} metadata={metadata} />
      <div className="mn-cells">
        {tiers.map((t, i) => {
          const featured = !!str(t.badge)
          return (
            <div key={i} className={cls('mn-cell mn-tier', featured && 'mn-tier--lead')}>
              <div className="mn-tier-top">
                <MidnightSeal name={str(t.sigil) || 'moon-full'} size={48} tone={featured ? 'accent' : 'subtle'} />
                {featured && <span className="mn-badge mn-badge--accent">{str(t.badge)}</span>}
              </div>
              <span className="mn-card-title">{str(t.name)}</span>
              {str(t.blurb) && <span className="mn-muted mn-body-sm">{str(t.blurb)}</span>}
              {str(t.price) && <span className="mn-mono mn-tier-price">{str(t.price)}</span>}
              <Btn label={str(t.buttonLabel)} href={str(t.href)} kind={featured ? 'primary' : 'secondary'} metadata={metadata} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Proof ─────────────────────────────────────────────────────────────────────────────────

function MidnightProofBlock({ p, metadata, pad, vis }: Common) {
  const reviews = spaceOf(metadata)?.reviews
  const first = reviews?.latest?.[0]
  const useLive = p.live !== false && !!first && !!first.body
  const quote = useLive ? first.body : str(p.quote)
  const who = useLive ? first.author?.displayName ?? '' : str(p.who)
  const role = useLive ? '' : str(p.role)
  const rating = useLive && reviews?.average ? `${reviews.average} from ${reviews.count} reviews` : str(p.rating)
  if (!quote) return null
  return (
    <section data-mn="proof" className={cls('mn-section mn-proof mn-grain', pad, vis)}>
      <div className="mn-mist mn-mist--right" aria-hidden="true" />
      <div className="mn-proof-inner">
        <div className="mn-ornament" role="separator"><span /><i aria-hidden="true">✦</i><span /></div>
        <blockquote className="mn-quote">“{quote}”</blockquote>
        {(who || role) && (
          <div className="mn-eyebrow mn-proof-by">
            {who && <b>{who}</b>}
            {who && role && <span aria-hidden="true">·</span>}
            {role && <span>{role}</span>}
          </div>
        )}
        {rating && <div className="mn-proof-rating"><span className="mn-stars" aria-hidden="true">★★★★★</span><span className="mn-muted mn-small">{rating}</span></div>}
      </div>
    </section>
  )
}

// ── Shop ──────────────────────────────────────────────────────────────────────────────────

function MidnightShopBlock({ p, metadata, pad, vis }: Common) {
  const products = arr(p.products).filter((x) => str(x.name))
  return (
    <section data-mn="shop" className={cls('mn-section', pad, vis)}>
      <Head p={p} metadata={metadata} />
      <div className="mn-grid">
        {products.map((x, i) => {
          const to = hrefOf(str(x.href), metadata)
          const src = img(x.image)
          const inner = (
            <>
              <div className="mn-cover mn-cover--tile">
                {src && (
                  // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
                  <img src={src} alt="" loading="lazy" />
                )}
              </div>
              <div className="mn-tile-body">
                {str(x.kind) && <div className="mn-eyebrow">{str(x.kind)}</div>}
                <span className="mn-tile-title">{str(x.name)}</span>
                <div className="mn-tile-foot">
                  <span className="mn-mono">{str(x.price)}</span>
                  {str(x.rating) && <span className="mn-subtle mn-small">{str(x.rating)}</span>}
                </div>
              </div>
            </>
          )
          return to ? <a key={i} className="mn-tile" href={to} {...rel(to)}>{inner}</a> : <article key={i} className="mn-tile">{inner}</article>
        })}
      </div>
    </section>
  )
}

// ── Library ───────────────────────────────────────────────────────────────────────────────

function MidnightLibraryBlock({ p, metadata, pad, vis }: Common) {
  const items = arr(p.resources).filter((r) => str(r.title))
  return (
    <section data-mn="library" className={cls('mn-section', pad, vis)}>
      <Head p={p} metadata={metadata} />
      <div className="mn-cells mn-cells--wide">
        {items.map((r, i) => {
          const to = hrefOf(str(r.href), metadata)
          const free = /^free$/i.test(str(r.price))
          const inner = (
            <>
              <span className="mn-cell-top">
                <span className="mn-accent-ink"><MidnightSigil name={str(r.sigil) || 'star'} size={22} /></span>
                {str(r.price) && <span className={cls('mn-badge', free && 'mn-badge--accent')}>{str(r.price)}</span>}
              </span>
              {str(r.type) && <span className="mn-eyebrow">{str(r.type)}</span>}
              <span className="mn-card-title mn-card-title--sm">{str(r.title)}</span>
              {str(r.meta) && <span className="mn-subtle mn-small mn-push">{str(r.meta)}</span>}
            </>
          )
          return to ? <a key={i} className="mn-cell mn-resource" href={to} {...rel(to)}>{inner}</a> : <div key={i} className="mn-cell mn-resource">{inner}</div>
        })}
      </div>
    </section>
  )
}

// ── Letter ────────────────────────────────────────────────────────────────────────────────

function MidnightLetterBlock({ p, metadata, pad, vis }: Common) {
  const links = metadata?.links as SiteLinkMap | undefined
  return (
    <section data-mn="letter" className={cls('mn-section mn-letter', pad, vis)}>
      <div className="mn-letter-copy">
        <MidnightSeal name="moon-new" size={64} tone="accent" />
        <div>
          <div className="mn-display mn-display--h3">
            {str(p.title)} {str(p.em) && <em>{str(p.em)}</em>}
          </div>
          {str(p.lead) && <p className="mn-muted mn-letter-lead">{str(p.lead)}</p>}
        </div>
      </div>
      <MidnightLetterForm slug={links?.slug ?? null} placeholder={str(p.placeholder)} buttonLabel={str(p.buttonLabel)} successMessage={str(p.successMessage)} />
    </section>
  )
}

// ── Questions ─────────────────────────────────────────────────────────────────────────────

function MidnightFAQBlock({ p, metadata, pad, vis }: Common) {
  const own = spaceOf(metadata)?.faqs ?? []
  const items = own.length ? own.map((f) => ({ q: f.question, a: f.answer })) : arr(p.items).map((f) => ({ q: str(f.q), a: str(f.a) }))
  if (!items.length) return null
  return (
    <section data-mn="faq" className={cls('mn-section mn-split', pad, vis)}>
      <Head p={p} metadata={metadata} button={<></>} />
      <div className="mn-faq">
        {items.filter((f) => f.q).map((f, i) => (
          <details key={i} open={i === 0}>
            <summary>
              {f.q}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

// ── Closing call ──────────────────────────────────────────────────────────────────────────

function MidnightCTABlock({ p, metadata, pad, vis }: Common) {
  return (
    <section data-mn="cta" className={cls('mn-section mn-cta mn-grain', pad, vis)}>
      <div className="mn-mist mn-mist--veil" aria-hidden="true" />
      <div className="mn-cta-inner">
        <h2 className="mn-display mn-display--h2">
          <InlineText text={str(p.title)} />
        </h2>
        <div className="mn-actions mn-actions--center">
          <Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} metadata={metadata} />
        </div>
      </div>
    </section>
  )
}

// ── Registry ─────────────────────────────────────────────────────────────────────────────

const text = (label: string, hint?: string) => ({ type: 'text', label, ...(hint ? { hint } : {}) }) as const
const area = (label: string, hint?: string) => ({ type: 'textarea', label, ...(hint ? { hint } : {}) }) as const
const image = { ...loomImageField, label: 'Photo' }
const VOICE_HINT = 'Wrap words in *stars* to set them in the italic.'
const LINK_HINT = 'Start with ~/ for a page of this site, like ~/book.'
const sigil = { type: 'select', label: 'Symbol', options: MIDNIGHT_SIGIL_NAMES.map((v) => ({ label: v, value: v })) } as const
const head = { eyebrow: text('Small label', 'The short line beside the number.'), title: area('Heading', VOICE_HINT), lead: area('Line under the heading') }
const action = { actionLabel: text('Button beside the heading'), actionHref: text('Button beside the heading: where it goes', LINK_HINT) }

function block<P extends Props>(label: string, fields: Record<string, unknown>, defaults: P, Comp: (args: Common) => ReactNode): ComponentConfig {
  return {
    label,
    fields: { ...fields, layout: layoutField },
    defaultProps: { ...defaults, layout: layoutDefault },
    render: (props: Props & { puck?: { metadata?: Props } }) => <Comp p={props} metadata={props.puck?.metadata} {...layoutOf(props.layout)} />,
  } as unknown as ComponentConfig
}

export const midnightComponents: Record<string, ComponentConfig> = {
  MidnightHero: block('Midnight hero', {
    layout: { type: 'select', label: 'Layout', options: [{ label: 'Split with the arch', value: 'split' }, { label: 'Photo, text on the photo', value: 'center' }, { label: 'Banner', value: 'banner' }] },
    eyebrow: text('Small label'), title: area('Heading', `${VOICE_HINT} A new line starts a new row.`), lead: area('Intro'),
    primaryLabel: text('Main button'), primaryHref: text('Main button link', LINK_HINT), secondaryLabel: text('Second button'), secondaryHref: text('Second button link', LINK_HINT),
    image, alt: text('Photo description', 'For screen readers.'),
  }, { ...MIDNIGHT_HERO }, MidnightHeroBlock),
  MidnightLive: block('Midnight liveness strip (live)', {
    items: { type: 'array', label: 'Up to four facts', hint: 'A fact set to a live source shows the Space\'s own next event, Journeys or members when there are any.', arrayFields: {
      source: { type: 'select', label: 'Source', options: [{ label: 'Written by hand', value: 'custom' }, { label: 'Next event', value: 'nextEvent' }, { label: 'Journeys open', value: 'journeys' }, { label: 'Members', value: 'members' }] },
      sigil, label: text('Label'), value: text('Words'), href: text('Link', LINK_HINT),
    } },
  }, { ...MIDNIGHT_LIVE }, MidnightLiveBlock),
  MidnightDoors: block('Midnight ways in', {
    ...head,
    doors: { type: 'array', label: 'Doors', arrayFields: { sigil, title: text('Name'), body: area('Line under the name'), href: text('Link', LINK_HINT) } },
  }, { ...MIDNIGHT_DOORS }, MidnightDoorsBlock),
  MidnightOfferings: block('Midnight offerings', {
    ...head, ...action,
    offerings: { type: 'array', label: 'Offerings', arrayFields: { sigil, name: text('Name'), minutes: text('Minutes'), blurb: area('Line under the name'), price: text('Price'), href: text('Link', LINK_HINT) } },
  }, { ...MIDNIGHT_OFFERINGS }, MidnightOfferingsBlock),
  MidnightJourneys: block('Midnight Journeys (live)', {
    ...head, ...action, count: { type: 'number', label: 'How many to show', min: 1, max: 12 },
    cards: { type: 'array', label: 'Cards', hint: 'Used when the Space has no live Journeys of its own.', arrayFields: { image, eyebrow: text('Small label'), title: text('Name'), meta: text('Next run'), body: area('Outcome'), price: text('Price'), note: text('Small note'), href: text('Link', LINK_HINT) } },
  }, { ...MIDNIGHT_JOURNEYS }, MidnightJourneysBlock),
  MidnightGatherings: block('Midnight gatherings (live)', {
    ...head, ...action, count: { type: 'number', label: 'How many to show', min: 1, max: 12 }, image, alt: text('Photo description', 'For screen readers.'),
    rows: { type: 'array', label: 'Rows', hint: 'Used when the Space has no upcoming events of its own.', arrayFields: { month: text('Month'), day: text('Day'), title: text('Name'), meta: text('Time and place'), note: text('Price or seats'), href: text('Link', LINK_HINT) } },
  }, { ...MIDNIGHT_GATHERINGS }, MidnightGatheringsBlock),
  MidnightMembership: block('Midnight membership', {
    ...head,
    tiers: { type: 'array', label: 'Tiers', hint: 'A tier with a badge is the lead one.', arrayFields: { sigil, name: text('Name'), blurb: area('Line under the name'), price: text('Price'), badge: text('Badge'), buttonLabel: text('Button'), href: text('Link', LINK_HINT) } },
  }, { ...MIDNIGHT_MEMBERSHIP }, MidnightMembershipBlock),
  MidnightProof: block('Midnight quote band (live)', {
    live: { type: 'radio', label: 'Use the Space\'s latest review', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] },
    quote: area('Quote'), who: text('Name'), role: text('Role'), rating: text('Rating line'),
  }, { ...MIDNIGHT_PROOF }, MidnightProofBlock),
  MidnightShop: block('Midnight shop', {
    ...head, ...action,
    products: { type: 'array', label: 'Products', arrayFields: { image, name: text('Name'), kind: text('Kind'), price: text('Price'), rating: text('Rating line'), href: text('Link', LINK_HINT) } },
  }, { ...MIDNIGHT_SHOP }, MidnightShopBlock),
  MidnightLibrary: block('Midnight library', {
    ...head, ...action,
    resources: { type: 'array', label: 'Resources', arrayFields: { sigil, type: text('Kind'), title: text('Name'), meta: text('Small line'), price: text('Price'), href: text('Link', LINK_HINT) } },
  }, { ...MIDNIGHT_LIBRARY }, MidnightLibraryBlock),
  MidnightLetter: block('Midnight letter sign-up', {
    title: text('Heading'), em: text('Heading, italic part'), lead: area('Line under the heading'), placeholder: text('Email field hint'), buttonLabel: text('Button'), successMessage: text('Thank-you line'),
  }, { ...MIDNIGHT_LETTER }, MidnightLetterBlock),
  MidnightFAQ: block('Midnight questions (live)', {
    ...head, items: { type: 'array', label: 'Questions', hint: 'Used when the Space has no questions of its own.', arrayFields: { q: text('Question'), a: area('Answer') } },
  }, { ...MIDNIGHT_FAQ }, MidnightFAQBlock),
  MidnightCTA: block('Midnight closing call', {
    title: area('Heading', `${VOICE_HINT} A new line starts a new row.`), buttonLabel: text('Button'), buttonHref: text('Button link', LINK_HINT),
  }, { ...MIDNIGHT_CTA }, MidnightCTABlock),
}

export const MIDNIGHT_CATEGORY_COMPONENTS = Object.keys(midnightComponents)
