import type { ReactNode } from 'react'
import type { ComponentConfig } from '@/lib/page-editor/types'
import { layoutField, layoutDefault, padClass, visClass, type LayoutValue } from '@/lib/page-editor/layout'
import { safeImageSrc } from '@/lib/safe-image-src'
import { safeImageUrl, safeUrl } from '@/lib/entity-blocks/block-content'
import { siteLocalHref, type SiteLinkMap } from '@/lib/sites/house-theme'
import { expandSiteSeries, storedWallClock, type SiteEventRow } from '@/lib/sites/site-events'
import { templeStamp, templeWhen } from '@/lib/sites/temple-events'
import { templeWeek, weekdayOfTitle } from '@/lib/sites/temple-week'
import { loomImageField } from '@/lib/page-editor/loom-image-field'
import { InlineText } from '@/components/sites/inline-text'
import { TempleFollowForm } from '@/components/sites/temple-follow-form'
import { TEMPLE_EVENTS, TEMPLE_FAQ, TEMPLE_FOLLOW, TEMPLE_HERO, TEMPLE_RETREAT, TEMPLE_SEASONS, TEMPLE_TIERS, TEMPLE_WEEK } from '@/lib/sites/temple-home'

// ── The Temple block family (Royal Temple design system, "The House", 2026-10-22) ──────────────────────────
// Every section of the design's Home is one registered block here, in the design's markup and order: the hero
// with the next-gathering ticket, the three event cards, the standing week, the night band of membership
// rungs, the four seasonal events, the retreat and rental split, the questions, and the follow band. Server
// Components, except the follow form. Dates are the Space's own events (`puck.metadata.space.events` and
// `series`, the channel the Space blocks read); every start is the stored wall clock (lib/time/zone.ts), read
// as it is. Every look is the Temple skin's (components/sites/temple-blocks-css.ts), tokens only.

type Props = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const arr = (v: unknown): Props[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Props[]) : [])
const img = (v: unknown) => safeImageSrc(safeImageUrl(v) || null)
const cls = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')
const layoutOf = (layout: unknown) => ({ pad: padClass(layout as LayoutValue), vis: visClass(layout as LayoutValue) })
const lines = (v: unknown) => str(v).split('\n').map((s) => s.trim()).filter(Boolean)

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

function Btn({ label, href, kind = 'primary', metadata, arrow = false }: { label: string; href: string; kind?: 'primary' | 'soft'; metadata?: Props; arrow?: boolean }) {
  const to = label ? hrefOf(href, metadata) : null
  if (!to) return null
  return (
    <a className={cls('hs-btn', kind === 'primary' ? 'hs-btn-primary' : 'hs-btn-soft')} href={to} {...(external(to) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {label}
      {arrow && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      )}
    </a>
  )
}

/** The section head (design .rt-sechead): eyebrow, big title, lede, and an optional button to the right. */
function Head({ p, metadata, button }: { p: Props; metadata?: Props; button?: ReactNode }) {
  if (!str(p.eyebrow) && !str(p.title) && !str(p.lead)) return null
  return (
    <div className="tt-sechead">
      <div>
        {str(p.eyebrow) && <div className="tt-eyebrow">{str(p.eyebrow)}</div>}
        {str(p.title) && (
          <h2 className="tt-title">
            <InlineText text={str(p.title)} accentStars />
          </h2>
        )}
        {str(p.lead) && <p className="tt-sechead-lead">{str(p.lead)}</p>}
      </div>
      {button ?? (str(p.actionLabel) ? <div><Btn label={str(p.actionLabel)} href={str(p.actionHref)} kind="soft" metadata={metadata} arrow /></div> : null)}
    </div>
  )
}

function Arch({ src, alt, shape, children }: { src: string | null; alt: string; shape: 'hero' | 'card' | 'tall' | 'keyhole'; children?: ReactNode }) {
  return (
    <figure className={cls('tt-arch', `tt-arch--${shape}`)}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
        <img src={src} alt={alt} loading="lazy" />
      )}
      {children}
    </figure>
  )
}

// ── Events, from the Space's own rows ────────────────────────────────────────────────────────────────

interface Row extends SiteEventRow {
  description?: string | null
  priceLabel?: string | null
  coverUrl?: string | null
  hostingSpaceId?: string | null
}
const isRow = (e: unknown): e is Row => !!e && typeof (e as Row).id === 'string' && typeof (e as Row).title === 'string' && typeof (e as Row).startsAt === 'string'
const ROWS = new WeakMap<object, Row[]>()
const WINDOW_DAYS = 70

/** The Space's rows from the metadata channel (`space.events` and `space.series`), every recurring anchor
 *  expanded through the next ten weeks, cancelled rows dropped, soonest first. */
function rowsOf(metadata: Props | undefined, now: Date): Row[] {
  const space = metadata?.space as { events?: unknown; series?: unknown } | undefined
  if (!space) return []
  const hit = ROWS.get(space)
  if (hit) return hit
  const seen = new Set<string>()
  const rows: Row[] = []
  for (const e of [...(Array.isArray(space.events) ? space.events : []), ...(Array.isArray(space.series) ? space.series : [])]) {
    if (!isRow(e) || seen.has(e.id)) continue
    seen.add(e.id)
    rows.push(e)
  }
  const out = expandSiteSeries(rows, { through: new Date(now.getTime() + WINDOW_DAYS * 86_400_000), from: now })
  ROWS.set(space, out)
  return out
}

const ZONE = 'America/Los_Angeles'
const todayIn = (now: Date) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

/** The upcoming rows, soonest first, from today. */
function upcoming(metadata: Props | undefined, now: Date): Row[] {
  const today = todayIn(now)
  return rowsOf(metadata, now)
    .filter((e) => !e.isCancelled && e.startsAt.slice(0, 10) >= today)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

function eventHref(e: Row, metadata: Props | undefined): string | null {
  if (!e.slug) return null
  const origin = (metadata?.links as SiteLinkMap | undefined)?.origin
  return origin ? `${origin}/events/${e.slug}` : `/events/${e.slug}`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** "Sun · 5:00 PM": the weekday and the start. */
function startLine(startsAt: string): string {
  const d = storedWallClock(startsAt)
  if (!d) return ''
  const h = d.getUTCHours()
  const m = String(d.getUTCMinutes()).padStart(2, '0')
  return `${DAYS[d.getUTCDay()]} · ${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`
}

function Stamp({ startsAt }: { startsAt: string }) {
  const s = templeStamp(startsAt)
  if (!s) return null
  return (
    <div className="tt-stamp">
      <b>{s.day}</b>
      <span>{s.month}</span>
    </div>
  )
}

/** A card's photo: the event's own cover, else the first cover whose words appear in its title, else the fallback. */
function coverFor(e: Row, p: Props): string | null {
  const own = img(e.coverUrl)
  if (own) return own
  const title = e.title.toLowerCase()
  for (const c of arr(p.covers)) {
    const word = str(c.match).toLowerCase()
    if (word && title.includes(word)) return img(c.image)
  }
  return img(p.fallback)
}

// ── Hero ──────────────────────────────────────────────────────────────────────────────────────────

function TempleHeroBlock({ p, metadata, now = new Date(), pad, vis }: { p: Props; metadata?: Props; now?: Date; pad?: string; vis?: string }) {
  const next = upcoming(metadata, now)[0] ?? null
  const when = next ? templeWhen(next.startsAt, next.endsAt) : null
  const to = next ? eventHref(next, metadata) : null
  const facts = arr(p.facts).filter((f) => str(f.value))
  const ticket = next ? (
    <>
      <Stamp startsAt={next.startsAt} />
      <div>
        <div className="tt-eyebrow tt-eyebrow--small">{str(p.ticketLabel)}</div>
        <div className="tt-ticket-title">{next.title}</div>
        {when && <div className="tt-muted">{when}</div>}
      </div>
    </>
  ) : null
  return (
    <section data-tt="hero" className={cls('tt-hero tp-sand tp-grit tp-motif tp-motif--fan', pad, vis)}>
      <div className="tt-wrap tt-hero-grid">
        <div>
          {str(p.eyebrow) && <div className="tt-eyebrow">{str(p.eyebrow)}</div>}
          <h1 className="tt-display">
            <InlineText text={str(p.title)} accentStars />
          </h1>
          {str(p.lead) && <p className="tt-lede">{str(p.lead)}</p>}
          <div className="tt-actions">
            <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} metadata={metadata} />
            <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind="soft" metadata={metadata} />
          </div>
          {facts.length > 0 && (
            <dl className="tt-facts">
              {facts.map((f, i) => (
                <div key={i}>
                  <dt>{str(f.value)}</dt>
                  <dd>{str(f.label)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div className="tt-heroimg">
          <Arch src={img(p.image)} alt={str(p.alt)} shape="hero" />
          {ticket && (to ? <a className="tt-ticket" href={to}>{ticket}</a> : <div className="tt-ticket">{ticket}</div>)}
        </div>
      </div>
    </section>
  )
}

// ── What's coming up ──────────────────────────────────────────────────────────────────────────────

function TempleEventsBlock({ p, metadata, now = new Date(), pad, vis }: { p: Props; metadata?: Props; now?: Date; pad?: string; vis?: string }) {
  const count = Math.max(1, Math.min(6, Number(p.count) || 3))
  const rows = upcoming(metadata, now).slice(0, count)
  if (rows.length === 0) return null
  return (
    <section data-tt="sessions" className={cls('tt-section tp-sand tp-motif tp-motif--bold tp-motif--olive tp-motif--left', pad, vis)}>
      <div className="tt-inner">
        <Head p={p} metadata={metadata} />
        <div className="tt-cards">
          {rows.map((e) => {
            const to = eventHref(e, metadata)
            const price = str(e.priceLabel)
            const body = (
              <>
                <div className="tt-ev-media">
                  <Arch src={coverFor(e, p)} alt={e.title} shape="card" />
                  <Stamp startsAt={e.startsAt} />
                </div>
                <div className="tt-ev-body">
                  <div className="tt-eyebrow">{startLine(e.startsAt)}</div>
                  <h3 className="tt-ev-title">{e.title}</h3>
                  {str(e.description) && <div className="tt-muted">{str(e.description).split('\n')[0].slice(0, 140)}</div>}
                  <div className="tt-ev-foot">
                    <span className="tt-price">{price}</span>
                    {str(p.badge) && <span className="tt-badge">{str(p.badge)}</span>}
                  </div>
                </div>
              </>
            )
            return to ? <a key={e.id} className="tt-ev" href={to}>{body}</a> : <div key={e.id} className="tt-ev">{body}</div>
          })}
        </div>
      </div>
    </section>
  )
}

// ── The standing week ─────────────────────────────────────────────────────────────────────────────

function TempleWeekBlock({ p, metadata, now = new Date(), pad, vis }: { p: Props; metadata?: Props; now?: Date; pad?: string; vis?: string }) {
  const words = new Map<number, string>()
  for (const n of arr(p.notes)) {
    const wd = weekdayOfTitle(str(n.weekday))
    if (wd !== null && str(n.label)) words.set(wd, str(n.label))
  }
  const days = templeWeek(rowsOf(metadata, now).map((e) => ({ title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, recurring: !!e.parentEventId || (!!e.recurrenceType && e.recurrenceType !== 'none') })), now, words)
  return (
    <section data-tt="steps" className={cls('tt-section tt-section--sunk tp-sand', pad, vis)}>
      <div className="tt-inner">
        <Head p={p} metadata={metadata} />
        <div className="tt-week">
          {days.map((d) => (
            <div key={d.name} className={cls('tt-day', d.tone === 'quiet' && 'tt-day--note', d.tone === 'held' && 'tt-day--hold')}>
              <div className="tt-day-name">{d.name}</div>
              {d.slots.map((s, i) => (
                <div key={s.title}>
                  {i > 0 && <div className="tt-day-t tt-day-join">{d.joiner}</div>}
                  <div className="tt-day-ev">{s.title}</div>
                  {s.time && <div className="tt-day-t">{s.time}</div>}
                </div>
              ))}
              {d.note && <div className="tt-day-note">{d.note}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Follow, belong, hold ──────────────────────────────────────────────────────────────────────────

function TempleTiersBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const tiers = arr(p.tiers).filter((t) => str(t.name))
  return (
    <section data-tt="community" className={cls('tt-section tt-section--night tp-grit tp-grit--ink tp-motif tp-motif--rays tp-motif--on-ink', pad, vis)}>
      <div className="tt-inner">
        <Head p={p} metadata={metadata} button={str(p.actionLabel) ? <div><Btn label={str(p.actionLabel)} href={str(p.actionHref)} metadata={metadata} /></div> : null} />
        <div className="tt-tiers">
          {tiers.map((t, i) => (
            <div key={i} className={cls('tt-tier', t.lead === true ? 'tt-tier--lead' : 'tt-tier--ink')}>
              {str(t.rung) && <div className="tt-eyebrow">{str(t.rung)}</div>}
              <h3>{str(t.name)}</h3>
              <div>
                <span className="tt-tier-price">{str(t.price)}</span> <span className="tt-muted">{str(t.priceNote)}</span>
              </div>
              {str(t.blurb) && <p>{str(t.blurb)}</p>}
              <ul>
                {lines(t.perks).map((perk) => (
                  <li key={perk}>{perk}</li>
                ))}
              </ul>
              <Btn label={str(t.ctaLabel)} href={str(t.ctaHref)} kind={t.lead === true ? 'primary' : 'soft'} metadata={metadata} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Four seasonal events ──────────────────────────────────────────────────────────────────────────

function TempleSeasonsBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const seasons = arr(p.seasons).filter((s) => str(s.title))
  return (
    <section data-tt="seasonal" className={cls('tt-section tt-section--terracotta tp-sand tp-grit', pad, vis)}>
      <div className="tt-inner">
        <Head p={p} metadata={metadata} />
        <div className="tt-seasons">
          {seasons.map((s, i) => {
            const to = hrefOf(str(s.href), metadata)
            const body = (
              <>
                <Arch src={img(s.image)} alt="" shape="tall" />
                {str(s.turn) && <div className="tt-eyebrow">{str(s.turn)}</div>}
                <h3>{str(s.title)}</h3>
                {str(s.when) && <div className="tt-muted">{str(s.when)}</div>}
              </>
            )
            return to ? <a key={i} className="tt-season" href={to}>{body}</a> : <div key={i} className="tt-season">{body}</div>
          })}
        </div>
      </div>
    </section>
  )
}

// ── Retreat and rental ────────────────────────────────────────────────────────────────────────────

const ICONS = ['arch-door', 'candle', 'incense', 'long-table', 'moon-phase', 'olive-branch', 'palm', 'stone-stack', 'sun-crescent', 'water-ripple']

function TempleRetreatBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const spaces = arr(p.spaces).filter((s) => str(s.label))
  return (
    <section data-tt="story" className={cls('tt-section tt-section--dawn tp-sand tp-grit tp-motif tp-motif--bold tp-motif--agave', pad, vis)}>
      <div className="tt-inner">
        <div className="tt-split">
          <Arch src={img(p.image)} alt={str(p.alt)} shape="keyhole" />
          <div>
            <Head p={p} metadata={metadata} button={<></>} />
            {spaces.length > 0 && (
              <div className="tt-spaces">
                {spaces.map((s, i) => (
                  <div key={i} className="tt-space">
                    {ICONS.includes(str(s.icon)) ? <span className={`tp-icon tp-icon--${str(s.icon)}`} aria-hidden /> : <span aria-hidden />}
                    <span>{str(s.label)}</span>
                    <div>
                      <b>{str(s.value)}</b>
                      <small>{str(s.unit)}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} metadata={metadata} />
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Questions ─────────────────────────────────────────────────────────────────────────────────────

function TempleFAQBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const space = metadata?.space as { faqs?: { question?: unknown; answer?: unknown }[] } | undefined
  const live = Array.isArray(space?.faqs) ? space.faqs.map((f) => ({ q: str(f.question), a: str(f.answer) })).filter((f) => f.q && f.a) : []
  const items = live.length ? live : arr(p.items).map((f) => ({ q: str(f.q), a: str(f.a) })).filter((f) => f.q && f.a)
  if (items.length === 0) return null
  return (
    <section data-tt="faq" className={cls('tt-section tp-sand tp-motif tp-motif--fig tp-motif--left', pad, vis)}>
      <div className="tt-inner">
        <Head p={p} metadata={metadata} button={<></>} />
        <div className="tt-faq">
          {items.map((f, i) => (
            <details key={i} open={i === 0}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── The follow band ───────────────────────────────────────────────────────────────────────────────

function TempleFollowBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const links = metadata?.links as SiteLinkMap | undefined
  return (
    <section data-tt="follow" className={cls('tt-follow tp-grit tp-grit--ink tp-motif tp-motif--bold tp-motif--fan tp-motif--on-ink', pad, vis)}>
      <div className="tt-wrap tt-follow-grid">
        <div>
          {str(p.eyebrow) && <div className="tt-eyebrow tt-eyebrow--on-clay">{str(p.eyebrow)}</div>}
          <h2 className="tt-title tt-title--on-clay">
            <InlineText text={str(p.title)} accentStars />
          </h2>
          {str(p.lead) && <p className="tt-follow-lead">{str(p.lead)}</p>}
        </div>
        <TempleFollowForm slug={links?.slug ?? null} placeholder={str(p.placeholder)} buttonLabel={str(p.buttonLabel)} successMessage={str(p.successMessage)} />
      </div>
    </section>
  )
}

// ── Registry ────────────────────────────────────────────────────────────────────────────────────────────

const text = (label: string, hint?: string) => ({ type: 'text', label, ...(hint ? { hint } : {}) }) as const
const area = (label: string, hint?: string) => ({ type: 'textarea', label, ...(hint ? { hint } : {}) }) as const
const image = { ...loomImageField, label: 'Photo' }
const VOICE_HINT = 'Wrap words in *stars* to set them in the accent italic.'
const head = { eyebrow: text('Small label', 'The short line above the heading.'), title: area('Heading', VOICE_HINT), lead: area('Intro') }
const action = { actionLabel: text('Button beside the heading'), actionHref: text('Button beside the heading: where it goes', 'Start with ~/ for a page of this site, like ~/memberships.') }
const buttons = { primaryLabel: text('Main button'), primaryHref: text('Main button link', 'Start with ~/ for a page of this site, like ~/contact.'), secondaryLabel: text('Second button'), secondaryHref: text('Second button link') }
const yesNo = { type: 'radio', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] } as const

function block<P extends Props>(label: string, fields: Record<string, unknown>, defaults: P, Comp: (args: { p: Props; metadata?: Props; pad?: string; vis?: string }) => ReactNode): ComponentConfig {
  return {
    label,
    fields: { ...fields, layout: layoutField },
    defaultProps: { ...defaults, layout: layoutDefault },
    render: (props: Props & { puck?: { metadata?: Props } }) => <Comp p={props} metadata={props.puck?.metadata} {...layoutOf(props.layout)} />,
  } as unknown as ComponentConfig
}

export const templeComponents: Record<string, ComponentConfig> = {
  TempleHero: block('Temple hero with the next gathering', {
    ...head, ...buttons,
    facts: { type: 'array', label: 'Facts under the buttons', arrayFields: { value: text('Number'), label: text('Label') } },
    image, alt: text('Photo description', 'For screen readers.'), ticketLabel: text('Next gathering label', 'The small line on the ticket over the photo.'),
  }, { ...TEMPLE_HERO }, TempleHeroBlock),
  TempleEvents: block('Temple event cards (live)', {
    ...head, ...action, count: { type: 'number', label: 'How many to show', min: 1, max: 6 }, badge: text('Card badge', 'Shown at the foot of every card.'),
    fallback: { ...loomImageField, label: 'Photo when an event has none' },
    covers: { type: 'array', label: 'Photos by event name', arrayFields: { match: text('Title contains'), image } },
  }, { ...TEMPLE_EVENTS }, TempleEventsBlock),
  TempleWeek: block('Temple standing week (live)', {
    ...head,
    notes: { type: 'array', label: 'Words on empty days', hint: 'A day with no recurring gathering shows these. Words like retreat or rental draw the night card.', arrayFields: { weekday: text('Weekday', 'Like Monday.'), label: text('Words') } },
  }, { ...TEMPLE_WEEK }, TempleWeekBlock),
  TempleTiers: block('Temple membership rungs', {
    ...head, ...action,
    tiers: { type: 'array', label: 'Rungs', arrayFields: { rung: text('Small label'), name: text('Name'), price: text('Price'), priceNote: text('Price note'), lead: { ...yesNo, label: 'Lead rung' }, blurb: area('Line under the name'), perks: area('Perks', 'Each new line is one perk.'), ctaLabel: text('Button'), ctaHref: text('Button link') } },
  }, { ...TEMPLE_TIERS }, TempleTiersBlock),
  TempleSeasons: block('Temple seasonal events', {
    ...head, ...action,
    seasons: { type: 'array', label: 'Seasonal events', arrayFields: { turn: text('Solstice or equinox'), title: text('Name'), when: text('When'), image, href: text('Link') } },
  }, { ...TEMPLE_SEASONS }, TempleSeasonsBlock),
  TempleRetreat: block('Temple retreat and rental', {
    ...head, ...buttons, image, alt: text('Photo description', 'For screen readers.'),
    spaces: { type: 'array', label: 'Spaces and capacity', arrayFields: { icon: { type: 'select', label: 'Icon', options: ICONS.map((v) => ({ label: v, value: v })) }, label: text('Space'), value: text('Number'), unit: text('Unit') } },
  }, { ...TEMPLE_RETREAT }, TempleRetreatBlock),
  TempleFAQ: block('Temple questions', {
    ...head, items: { type: 'array', label: 'Questions', hint: 'Used when the Space has no questions of its own.', arrayFields: { q: text('Question'), a: area('Answer') } },
  }, { ...TEMPLE_FAQ }, TempleFAQBlock),
  TempleFollow: block('Temple follow band', {
    ...head, placeholder: text('Email field hint'), buttonLabel: text('Button'), successMessage: text('Thank-you line'),
  }, { ...TEMPLE_FOLLOW }, TempleFollowBlock),
}

export const TEMPLE_CATEGORY_COMPONENTS = Object.keys(templeComponents)
