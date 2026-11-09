import { siteToday } from '@/lib/sites/site-events'
import type { ReactNode } from 'react'
import type { ComponentConfig } from '@/lib/page-editor/types'
import { layoutField, layoutDefault, type LayoutValue } from '@/lib/page-editor/layout'
import { loomImageField } from '@/lib/page-editor/loom-image-field'
import { safeImageSrc } from '@/lib/safe-image-src'
import { safeImageUrl, safeUrl } from '@/lib/entity-blocks/block-content'
import { siteLocalHref, type SiteLinkMap } from '@/lib/sites/house-theme'
import { storedWallClock } from '@/lib/sites/site-events'
import { InlineText } from '@/components/sites/inline-text'
import { ROLES, roleVariant as pickVariant, type RoleId } from '@/lib/blocks/roles/roles'
import { presentationDefault } from '@/components/sites/presentation'

// ── The seventeen role blocks (docs/THEME-COHESION.md section 2, ADR-1923, LIVE-1858 and LIVE-1859) ─────────────────────────────────
// Hero, Steps, Offerings, Gatherings, Membership, Proof, FAQ and CTA (LIVE-1858), then Statement, Letter, Contact, Stats,
// Shop, Library, People, Gallery and Chapters (LIVE-1859): three structural layouts each. They are the
// block the owner picks; the theme is only the stylesheet around it. Every block emits the same markup on every
// theme: `data-role`, `data-variant` and `data-part` hooks, no theme class, and no colour, font or size of its own.
// The look is components/sites/role-blocks-css.ts, which reads the core token contract and nothing else, so a block
// set on a Nocturne site and the same block set on a Network site differ by token values and presentation only.
//
// Opt-in: nothing here renders unless an owner adds one, and no legacy block is touched. The variant list, labels,
// sample words and parts come from lib/blocks/roles/*.role.json. An empty `variant` means "the theme's default": it
// draws the role's default today and is where a theme manifest will plug its own (LIVE-1861); a variant the owner
// picks is theirs and stays through a theme switch. The live roles (Gatherings, FAQ) read the Space's own rows from
// `puck.metadata.space` when asked and fall back to the words the owner wrote. Server Components, no client script.

type Props = Record<string, unknown>
type Ctx = { p: Props; metadata?: Props }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const arr = (v: unknown): Props[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Props[]) : [])
const img = (v: unknown) => safeImageSrc(safeImageUrl(v) || null)
const lines = (v: unknown) => str(v).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
const rel = (href: string) => (/^https?:\/\//.test(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})

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

// ── The shared pieces ────────────────────────────────────────────────────────────────────────

const TONES = ['canvas', 'surface', 'band']

/** The layout a block draws: the owner's pick, else the theme's default for the role, else the role's own. */
const roleVariant = (role: RoleId, picked: unknown, metadata?: Props) => pickVariant(role, picked, presentationDefault(metadata?.theme, role))

function Frame({ role, p, variant, media, children }: { role: RoleId; p: Props; variant: string; media?: boolean; children: ReactNode }) {
  const layout = (p.layout ?? {}) as LayoutValue
  const tone = TONES.includes(str(p.tone)) ? str(p.tone) : undefined
  const space = (v: unknown) => (v && v !== 'default' ? String(v) : undefined)
  return (
    <section
      data-role={role}
      data-variant={variant}
      data-tone={tone}
      data-media={media ? '' : undefined}
      data-flip={p.flip === true ? '' : undefined}
      data-vis={layout.visibility && layout.visibility !== 'all' ? layout.visibility : undefined}
      data-space-top={space(layout.spaceTop)}
      data-space-bottom={space(layout.spaceBottom)}
    >
      <div data-part="inner">{children}</div>
    </section>
  )
}

function Heading({ p, children }: { p: Props; children?: ReactNode }) {
  if (!str(p.eyebrow) && !str(p.title) && !str(p.lead)) return null
  return (
    <div data-part="heading">
      {str(p.eyebrow) && <p data-part="eyebrow">{str(p.eyebrow)}</p>}
      {str(p.title) && <h2 data-part="title"><InlineText text={str(p.title)} /></h2>}
      {str(p.lead) && <p data-part="lead">{str(p.lead)}</p>}
      {children}
    </div>
  )
}

function Cta({ label, href, kind, metadata }: { label: string; href: string; kind?: 'secondary'; metadata?: Props }) {
  const to = label ? hrefOf(href, metadata) : null
  return to ? <a data-part="cta" data-kind={kind} href={to} {...rel(to)}>{label}</a> : null
}

function Actions({ p, metadata, a = 'primary', b = 'secondary' }: Ctx & { a?: string; b?: string }) {
  const first = Cta({ label: str(p[`${a}Label`]), href: str(p[`${a}Href`]), metadata })
  const second = Cta({ label: str(p[`${b}Label`]), href: str(p[`${b}Href`]), kind: 'secondary', metadata })
  return first || second ? <div data-part="actions">{first}{second}</div> : null
}

function Media({ src, alt }: { src: string | null; alt?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
  return src ? <figure data-part="media"><img src={src} alt={alt ?? ''} loading="lazy" /></figure> : null
}

/** A name that is a link when it has somewhere to go; the link stretches over the whole item (role-blocks-css). */
function Name({ text, href, metadata }: { text: string; href?: string; metadata?: Props }) {
  const to = href ? hrefOf(href, metadata) : null
  return <h3 data-part="name">{to ? <a href={to} {...rel(to)}>{text}</a> : text}</h3>
}

// ── Hero ───────────────────────────────────────────────────────────────────────────────────

function HeroBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('hero', p.variant, metadata)
  const src = img(p.image)
  const showMedia = variant !== 'glow' && variant !== 'minimal'
  const media = showMedia ? <Media src={src} alt={str(p.alt)} /> : null
  return (
    <Frame role="hero" p={p} variant={variant} media={!!src && showMedia}>
      {variant === 'full' && media}
      <div data-part="copy">
        {str(p.eyebrow) && <p data-part="eyebrow">{str(p.eyebrow)}</p>}
        {str(p.title) && <h1 data-part="title"><InlineText text={str(p.title)} /></h1>}
        {str(p.lead) && <p data-part="lead">{str(p.lead)}</p>}
        <Actions p={p} metadata={metadata} />
      </div>
      {variant !== 'full' && media}
    </Frame>
  )
}

// ── Steps ──────────────────────────────────────────────────────────────────────────────────

function StepsBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('steps', p.variant, metadata)
  const items = arr(p.items).filter((s) => str(s.title) || str(s.body))
  return (
    <Frame role="steps" p={p} variant={variant}>
      <Heading p={p} />
      <ol data-part="list">
        {items.map((s, i) => (
          <li key={i} data-part="item" data-card={variant === 'grid' ? '' : undefined}>
            <span data-part="index">{variant === 'timeline' ? i + 1 : String(i + 1).padStart(2, '0')}</span>
            {str(s.title) && <h3 data-part="name">{str(s.title)}</h3>}
            {str(s.body) && <p data-part="body">{str(s.body)}</p>}
          </li>
        ))}
      </ol>
    </Frame>
  )
}

// ── Offerings ──────────────────────────────────────────────────────────────────────────────

function OfferingsBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('offerings', p.variant, metadata)
  const liveRows = liveAsked(p) ? liveOfferings(metadata) : []
  if (emptyLive(p, metadata, liveRows.length > 0)) return null
  const items = (liveRows.length ? liveRows : arr(p.items)).filter((s) => str(s.title))
  return (
    <Frame role="offerings" p={p} variant={variant}>
      <Heading p={p}>{str(p.actionLabel) && <div data-part="actions"><Cta label={str(p.actionLabel)} href={str(p.actionHref)} kind="secondary" metadata={metadata} /></div>}</Heading>
      <ul data-part="list">
        {items.map((s, i) => (
          <li key={i} data-part="item" data-card={variant === 'cards' || variant === 'split' ? '' : undefined}>
            <Media src={img(s.image)} />
            <div data-part="text">
              <Name text={str(s.title)} href={str(s.href)} metadata={metadata} />
              {str(s.body) && <p data-part="body">{str(s.body)}</p>}
            </div>
            {str(s.price) && <span data-part="price">{str(s.price)}</span>}
          </li>
        ))}
      </ul>
    </Frame>
  )
}

// ── Live rows for the other roles (BLD-213) ────────────────────────────────────────────────
// A live render carries the Space's own rows in `puck.metadata.space` (lib/spaces/content-data.ts). A role asked to be live
// (the default) draws them; with none it falls back to the words the owner wrote, and a block still showing the sample copy
// draws nothing at all, so no sample number or name ever reaches a live page. The editor canvas has no `space`, so it keeps the sample.
const spaceOf = (metadata: Props | undefined) => metadata?.space as Record<string, unknown> | undefined
const isLiveRender = (metadata: Props | undefined) => !!spaceOf(metadata) && typeof spaceOf(metadata)?.spaceId === 'string'
const liveAsked = (p: Props) => p.live !== false
/** True when this block is the sample copy on a live page and there is nothing real to put in its place. */
const emptyLive = (p: Props, metadata: Props | undefined, haveLive: boolean) => isLiveRender(metadata) && p.sample === true && !haveLive

function liveStats(metadata: Props | undefined) {
  const raw = spaceOf(metadata)?.stats
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s): s is { label: string; value: number } => !!s && typeof (s as { label?: unknown }).label === 'string' && Number.isFinite((s as { value?: unknown }).value) && (s as { value: number }).value > 0)
    .slice(0, 6)
    .map((s) => ({ value: s.value.toLocaleString('en-US'), label: s.label, note: '' }))
}

function liveReviews(metadata: Props | undefined) {
  const raw = (spaceOf(metadata)?.reviews as { latest?: unknown } | undefined)?.latest
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is { body: string; rating: number; author: { displayName: string; avatarUrl: string | null } | null } => !!r && typeof (r as { body?: unknown }).body === 'string' && !!(r as { body: string }).body.trim())
    .slice(0, 6)
    .map((r) => ({ quote: r.body.trim(), name: r.author?.displayName ?? '', role: '', photo: r.author?.avatarUrl ?? '', rating: r.rating }))
}

function liveTeam(metadata: Props | undefined) {
  const raw = spaceOf(metadata)?.team
  if (!Array.isArray(raw)) return []
  return raw
    .filter((m): m is { name: string; role: string; avatarUrl: string | null; handle: string | null } => !!m && typeof (m as { name?: unknown }).name === 'string' && !!(m as { name: string }).name.trim())
    .slice(0, 12)
    .map((m) => ({ name: m.name, role: m.role ? m.role.charAt(0).toUpperCase() + m.role.slice(1) : '', photo: m.avatarUrl ?? '', bio: '', href: m.handle ? `/u/${m.handle}` : '' }))
}

function liveChapters(metadata: Props | undefined) {
  const raw = spaceOf(metadata)?.chapters
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c): c is { name: string; city: string | null; tagline: string | null; slug: string } => !!c && typeof (c as { name?: unknown }).name === 'string' && typeof (c as { slug?: unknown }).slug === 'string')
    .slice(0, 25)
    .map((c) => ({ name: c.name, place: c.city ?? '', body: c.tagline ?? '', image: '', href: `/spaces/${c.slug}` }))
}

/** The Space's own address and contact lines, from the one Business Info form (profile-data.ts) every surface reads. */
function liveLocation(metadata: Props | undefined) {
  const prof = spaceOf(metadata)?.profile as Record<string, unknown> | undefined
  if (!prof) return null
  const address = str(prof.address)
  const hours = str(prof.hours).split(/\n+/).map((l) => l.trim()).filter(Boolean).join(' · ')
  const items = [
    { label: 'Hours', value: hours },
    { label: 'Phone', value: str(prof.phone) },
    { label: 'Email', value: str(prof.email) },
  ].filter((r) => r.value)
  return address || items.length ? { address, items } : null
}

/** What the Space offers: its live practices, journeys and circles, in that order. */
function liveOfferings(metadata: Props | undefined) {
  const sp = spaceOf(metadata)
  const named = (x: unknown): x is Record<string, unknown> => !!x && typeof (x as { title?: unknown; name?: unknown }).title === 'string' || !!x && typeof (x as { name?: unknown }).name === 'string'
  const list = (v: unknown) => (Array.isArray(v) ? v.filter(named) : [])
  const practices = (sp?.practices as { practices?: unknown; journeys?: unknown } | undefined) ?? {}
  const rows = [
    ...list(practices.practices).map((x) => ({ title: str(x.title), body: str(x.summary), href: `/practices/${str(x.id)}` })),
    ...list(practices.journeys).map((x) => ({ title: str(x.title), body: str(x.summary), href: `/journeys/${str(x.slug)}` })),
    ...list(sp?.community).map((x) => ({ title: str(x.name), body: str(x.about), href: `/circles/${str(x.slug)}` })),
  ]
  return rows.filter((r) => r.title).slice(0, 6).map((r) => ({ ...r, image: '', price: '' }))
}

/** The Space's next open booking slots as rows (BLD-213): the public door's open instants, each labelled in the Space's own
 *  clock. A row's title is the slot's length; its link is the booking tab. Nothing about who booked anything is read. */
function liveBooking(metadata: Props | undefined) {
  const booking = spaceOf(metadata)?.booking as { href?: unknown; timezone?: unknown; openings?: unknown } | undefined
  if (!booking || !Array.isArray(booking.openings)) return []
  const timeZone = typeof booking.timezone === 'string' && booking.timezone ? booking.timezone : 'UTC'
  const href = typeof booking.href === 'string' ? booking.href : ''
  const rows: { day: string; time: string; title: string; note: string; href: string }[] = []
  for (const o of booking.openings as Array<{ startsAt?: unknown; slotMinutes?: unknown }>) {
    if (typeof o?.startsAt !== 'string') continue
    const at = new Date(o.startsAt)
    if (Number.isNaN(at.getTime())) continue
    let day = ''
    let time = ''
    try {
      day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(at)
      time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(at)
    } catch { continue }
    const minutes = Number(o.slotMinutes)
    rows.push({ day, time, title: Number.isFinite(minutes) && minutes > 0 ? `${minutes} minute session` : 'Open session', note: 'Open', href })
    if (rows.length >= 6) break
  }
  return rows
}

// ── Gatherings ─────────────────────────────────────────────────────────────────────────────

interface EventRow { id: string; slug?: string; title: string; startsAt: string; location?: string | null; isCancelled?: boolean }
const isRow = (e: unknown): e is EventRow => !!e && typeof (e as EventRow).id === 'string' && typeof (e as EventRow).title === 'string' && typeof (e as EventRow).startsAt === 'string'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const clock = (d: Date) => `${d.getUTCHours() % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')}${d.getUTCHours() < 12 ? 'am' : 'pm'}`

/** The Space's upcoming events as rows, soonest first, each start read as the stored wall clock. */
function liveEvents(metadata: Props | undefined, now: Date, count: number) {
  const raw = (metadata?.space as { events?: unknown } | undefined)?.events
  if (!Array.isArray(raw)) return []
  const today = siteToday(now)
    return raw
    .filter(isRow)
    .filter((e) => !e.isCancelled && e.startsAt.slice(0, 10) >= today)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, count)
    .map((e) => {
      const d = storedWallClock(e.startsAt)
      return { month: d ? MONTHS[d.getUTCMonth()] : '', day: d ? String(d.getUTCDate()) : '', title: e.title, time: d ? clock(d) : '', place: e.location ?? '', href: e.slug ? `/events/${e.slug}` : '' }
    })
}

function GatheringsBlock({ p, metadata, now = new Date() }: Ctx & { now?: Date }) {
  const variant = roleVariant('gatherings', p.variant, metadata)
  const count = Math.max(1, Math.min(12, Number(p.count) || 6))
  const live = p.live !== false ? liveEvents(metadata, now, count) : []
  const rows = (live.length ? live : arr(p.items).slice(0, count).map((r) => ({ month: str(r.month), day: str(r.day), title: str(r.title), time: str(r.time), place: str(r.place), href: str(r.href) }))).filter((r) => r.title)
  const src = variant === 'split' ? img(p.image) : null
  const list = (
    <ul data-part="list">
      {rows.map((r, i) => (
        <li key={i} data-part="item" data-card={variant === 'rows' ? undefined : ''}>
          <span data-part="date"><b>{r.month}</b><span>{r.day}</span></span>
          <div data-part="text">
            <Name text={r.title} href={r.href} metadata={metadata} />
            {(r.time || r.place) && <p data-part="meta">{[r.time, r.place].filter(Boolean).join(' · ')}</p>}
          </div>
        </li>
      ))}
    </ul>
  )
  // The agenda layout opens with a ribbon of the dates on offer (one chip per gathering, in order), then the rows.
  const ribbon = variant === 'agenda' && rows.length > 0 && (
    <ol data-part="ribbon" aria-hidden="true">
      {rows.map((r, i) => <li key={i} data-part="chip"><b>{r.month}</b><span>{r.day}</span></li>)}
    </ol>
  )
  return (
    <Frame role="gatherings" p={p} variant={variant} media={!!src}>
      <Heading p={p}>{str(p.actionLabel) && <div data-part="actions"><Cta label={str(p.actionLabel)} href={str(p.actionHref)} kind="secondary" metadata={metadata} /></div>}</Heading>
      <div data-part="side">
        <Media src={src} alt={str(p.alt)} />
        {ribbon}
        {rows.length ? list : str(p.empty) ? <p data-part="empty">{str(p.empty)}</p> : null}
      </div>
    </Frame>
  )
}

// ── Membership ─────────────────────────────────────────────────────────────────────────────

function MembershipBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('membership', p.variant, metadata)
  const plans = arr(p.items).filter((s) => str(s.name))
  // The spotlight needs one lead plan; with none marked, the middle plan leads so the layout never draws flat.
  const lead = plans.findIndex((s) => s.featured === true)
  const featured = variant === 'spotlight' && lead < 0 ? Math.floor(plans.length / 2) : lead
  return (
    <Frame role="membership" p={p} variant={variant}>
      <Heading p={p} />
      <ul data-part="list">
        {plans.map((s, i) => {
          const isLead = i === featured
          return (
            <li key={i} data-part="item" data-card={variant === 'table' ? undefined : ''} data-featured={isLead ? '' : undefined}>
              <div data-part="text">
                {str(s.badge) && <span data-part="badge">{str(s.badge)}</span>}
                <h3 data-part="name">{str(s.name)}</h3>
                {str(s.blurb) && <p data-part="body">{str(s.blurb)}</p>}
              </div>
              {lines(s.features).length > 0 && <ul data-part="features">{lines(s.features).map((f, j) => <li key={j}>{f}</li>)}</ul>}
              <div data-part="text">
                {str(s.price) && <p data-part="price">{str(s.price)}{str(s.per) && <> <span data-part="per">{str(s.per)}</span></>}</p>}
                <Cta label={str(s.label)} href={str(s.href)} kind={isLead ? undefined : 'secondary'} metadata={metadata} />
              </div>
            </li>
          )
        })}
      </ul>
    </Frame>
  )
}

// ── Proof ──────────────────────────────────────────────────────────────────────────────────

function ProofBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('proof', p.variant, metadata)
  const liveRows = liveAsked(p) ? liveReviews(metadata) : []
  if (emptyLive(p, metadata, liveRows.length > 0)) return null
  const all = (liveRows.length ? liveRows : arr(p.items)).filter((q) => str(q.quote))
  const items = variant === 'quote' ? all.slice(0, 3) : variant === 'stats' ? all.slice(0, 1) : all
  const stats = variant === 'stats' ? arr(p.stats).filter((s) => str(s.value) && str(s.label)).slice(0, 4) : []
  const stars = (n: unknown) => { const r = Math.round(Number(n)); return r >= 1 && r <= 5 ? r : 0 }
  return (
    <Frame role="proof" p={p} variant={variant}>
      <Heading p={p} />
      <ul data-part="list">
        {items.map((q, i) => (
          <li key={i} data-part="item" data-card={variant === 'wall' ? '' : undefined}>
            <figure data-part="quote">
              {stars(q.rating) > 0 && <span data-part="rating" role="img" aria-label={`${stars(q.rating)} out of 5`}>{'★'.repeat(stars(q.rating))}</span>}
              <blockquote>{str(q.quote)}</blockquote>
              {str(q.name) && (
                <figcaption data-part="person">
                  {img(q.photo) && (
                    // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
                    <img data-part="photo" src={img(q.photo)!} alt="" loading="lazy" />
                  )}
                  <span data-part="who"><b>{str(q.name)}</b>{str(q.role) && <span>{str(q.role)}</span>}</span>
                </figcaption>
              )}
            </figure>
          </li>
        ))}
      </ul>
      {stats.length > 0 && (
        <ul data-part="stats">
          {stats.map((s, i) => <li key={i} data-part="stat"><b>{str(s.value)}</b><span>{str(s.label)}</span></li>)}
        </ul>
      )}
    </Frame>
  )
}

// ── FAQ ────────────────────────────────────────────────────────────────────────────────────

function FaqBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('faq', p.variant, metadata)
  const space = (metadata?.space as { faqs?: { question: string; answer: string }[] } | undefined)?.faqs
  const liveRows = p.live !== false && Array.isArray(space) ? space.filter((f) => f && str(f.question)).map((f) => ({ question: str(f.question), answer: str(f.answer) })) : []
  const rows = (liveRows.length ? liveRows : arr(p.items).map((f) => ({ question: str(f.question), answer: str(f.answer) }))).filter((f) => f.question)
  return (
    <Frame role="faq" p={p} variant={variant}>
      <Heading p={p} />
      <div data-part="list">
        {rows.map((f, i) => (
          <details key={i} data-part="item">
            <summary><span data-part="question">{f.question}</span></summary>
            {f.answer && <p data-part="answer">{f.answer}</p>}
          </details>
        ))}
      </div>
    </Frame>
  )
}

// ── CTA ────────────────────────────────────────────────────────────────────────────────────

function CtaBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('cta', p.variant, metadata)
  return (
    <Frame role="cta" p={p} variant={variant}>
      <div data-part="copy">
        {str(p.eyebrow) && <p data-part="eyebrow">{str(p.eyebrow)}</p>}
        {str(p.title) && <h2 data-part="title"><InlineText text={str(p.title)} /></h2>}
        {str(p.lead) && <p data-part="lead">{str(p.lead)}</p>}
      </div>
      <Actions p={p} metadata={metadata} />
    </Frame>
  )
}

// ── The nine roles that complete the set (LIVE-1859) ──────────────────────────────────────────

const ctaOf = (p: Props, metadata: Props | undefined) => str(p.actionLabel) ? <div data-part="actions"><Cta label={str(p.actionLabel)} href={str(p.actionHref)} kind="secondary" metadata={metadata} /></div> : null

// ── Statement ──────────────────────────────────────────────────────────────────────────────

function StatementBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('statement', p.variant, metadata)
  const phrases = variant === 'ticker' ? arr(p.items).filter((s) => str(s.text)) : []
  return (
    <Frame role="statement" p={p} variant={variant}>
      <div data-part="copy">
        {str(p.eyebrow) && <p data-part="eyebrow">{str(p.eyebrow)}</p>}
        {str(p.title) && <h2 data-part="title"><InlineText text={str(p.title)} /></h2>}
        {str(p.lead) && <p data-part="lead">{str(p.lead)}</p>}
        <Actions p={p} metadata={metadata} />
      </div>
      {phrases.length > 0 && <ul data-part="list">{phrases.map((s, i) => <li key={i} data-part="item">{str(s.text)}</li>)}</ul>}
    </Frame>
  )
}

// ── Letter ─────────────────────────────────────────────────────────────────────────────────

function LetterBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('letter', p.variant, metadata)
  return (
    <Frame role="letter" p={p} variant={variant}>
      <div data-part="copy" data-card={variant === 'card' ? '' : undefined}>
        <div data-part="text">
          {str(p.eyebrow) && <p data-part="eyebrow">{str(p.eyebrow)}</p>}
          {str(p.title) && <h2 data-part="title"><InlineText text={str(p.title)} /></h2>}
          {str(p.lead) && <p data-part="lead">{str(p.lead)}</p>}
        </div>
        <div data-part="side">
          <Actions p={p} metadata={metadata} b="none" />
          {str(p.note) && <p data-part="note">{str(p.note)}</p>}
        </div>
      </div>
    </Frame>
  )
}

// ── Contact ────────────────────────────────────────────────────────────────────────────────
// Details and a way in, never a form of its own: the message section writes the lead and emails the owner.

function ContactBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('contact', p.variant, metadata)
  const rows = arr(p.items).filter((r) => str(r.label) && str(r.value))
  return (
    <Frame role="contact" p={p} variant={variant}>
      <Heading p={p}><Actions p={p} metadata={metadata} /></Heading>
      {(rows.length > 0 || str(p.note)) && (
        <div data-part="side" data-card={variant === 'card' ? '' : undefined}>
          {rows.length > 0 && (
            <ul data-part="list">
              {rows.map((r, i) => {
                const to = str(r.href) ? hrefOf(str(r.href), metadata) : null
                return (
                  <li key={i} data-part="item">
                    <span data-part="meta">{str(r.label)}</span>
                    <span data-part="value">{to ? <a href={to} {...rel(to)}>{str(r.value)}</a> : str(r.value)}</span>
                  </li>
                )
              })}
            </ul>
          )}
          {str(p.note) && <p data-part="note">{str(p.note)}</p>}
        </div>
      )}
    </Frame>
  )
}

// ── Stats ──────────────────────────────────────────────────────────────────────────────────

function StatsBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('stats', p.variant, metadata)
  const liveRows = liveAsked(p) ? liveStats(metadata) : []
  if (emptyLive(p, metadata, liveRows.length > 0)) return null
  const items = (liveRows.length ? liveRows : arr(p.items)).filter((s) => str(s.value) && str(s.label)).slice(0, 6)
  return (
    <Frame role="stats" p={p} variant={variant}>
      <Heading p={p} />
      <ul data-part="list">
        {items.map((s, i) => (
          <li key={i} data-part="item" data-card={variant === 'cards' ? '' : undefined}>
            <b data-part="value">{str(s.value)}</b>
            <span data-part="label">{str(s.label)}</span>
            {str(s.note) && <span data-part="meta">{str(s.note)}</span>}
          </li>
        ))}
      </ul>
    </Frame>
  )
}

// ── Shop ───────────────────────────────────────────────────────────────────────────────────

function ShopBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('shop', p.variant, metadata)
  // A Space has no shop of its own to read yet (listings belong to people, not Spaces): on a live page the sample draws nothing.
  if (emptyLive(p, metadata, false)) return null
  const items = arr(p.items).filter((s) => str(s.name))
  return (
    <Frame role="shop" p={p} variant={variant}>
      <Heading p={p}>{ctaOf(p, metadata)}</Heading>
      <ul data-part="list">
        {items.map((s, i) => (
          <li key={i} data-part="item" data-card={variant === 'list' ? undefined : ''}>
            <Media src={img(s.image)} />
            <div data-part="text">
              {str(s.badge) && <span data-part="badge">{str(s.badge)}</span>}
              <Name text={str(s.name)} href={str(s.href)} metadata={metadata} />
            </div>
            {str(s.price) && <span data-part="price">{str(s.price)}</span>}
          </li>
        ))}
      </ul>
    </Frame>
  )
}

// ── Library ────────────────────────────────────────────────────────────────────────────────

function LibraryBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('library', p.variant, metadata)
  // Same as the shop: no Space-owned source yet, so only the owner's own words show on a live page.
  if (emptyLive(p, metadata, false)) return null
  const items = arr(p.items).filter((s) => str(s.title))
  return (
    <Frame role="library" p={p} variant={variant}>
      <Heading p={p}>{ctaOf(p, metadata)}</Heading>
      <ul data-part="list">
        {items.map((s, i) => (
          <li key={i} data-part="item" data-card={variant === 'list' ? undefined : ''}>
            <Media src={img(s.image)} />
            <div data-part="text">
              {str(s.kind) && <span data-part="kind">{str(s.kind)}</span>}
              <Name text={str(s.title)} href={str(s.href)} metadata={metadata} />
              {str(s.meta) && <p data-part="meta">{str(s.meta)}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  )
}

// ── People ─────────────────────────────────────────────────────────────────────────────────

function PeopleBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('people', p.variant, metadata)
  const liveRows = liveAsked(p) ? liveTeam(metadata) : []
  if (emptyLive(p, metadata, liveRows.length > 0)) return null
  const all = (liveRows.length ? liveRows : arr(p.items)).filter((s) => str(s.name))
  const items = variant === 'founder' ? all.slice(0, 1) : all
  return (
    <Frame role="people" p={p} variant={variant}>
      <Heading p={p} />
      <ul data-part="list">
        {items.map((s, i) => (
          <li key={i} data-part="item" data-card={variant === 'grid' ? '' : undefined}>
            <Media src={img(s.photo)} alt={str(s.name)} />
            <div data-part="text">
              <Name text={str(s.name)} href={str(s.href)} metadata={metadata} />
              {str(s.role) && <p data-part="role">{str(s.role)}</p>}
              {str(s.bio) && <p data-part="body">{str(s.bio)}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  )
}

// ── Gallery ────────────────────────────────────────────────────────────────────────────────

function GalleryBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('gallery', p.variant, metadata)
  const items = arr(p.items).filter((s) => img(s.image) || str(s.caption))
  return (
    <Frame role="gallery" p={p} variant={variant}>
      <Heading p={p}>{ctaOf(p, metadata)}</Heading>
      <ul data-part="list">
        {items.map((s, i) => (
          <li key={i} data-part="item">
            {img(s.image) ? <Media src={img(s.image)} alt={str(s.alt) || str(s.caption)} /> : <figure data-part="media" />}
            {str(s.caption) && <p data-part="caption">{str(s.caption)}</p>}
          </li>
        ))}
      </ul>
    </Frame>
  )
}

// ── Chapters ───────────────────────────────────────────────────────────────────────────────

function ChaptersBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('chapters', p.variant, metadata)
  const liveRows = liveAsked(p) ? liveChapters(metadata) : []
  if (emptyLive(p, metadata, liveRows.length > 0)) return null
  const items = (liveRows.length ? liveRows : arr(p.items)).filter((s) => str(s.name))
  return (
    <Frame role="chapters" p={p} variant={variant}>
      <Heading p={p}>{ctaOf(p, metadata)}</Heading>
      <ul data-part="list">
        {items.map((s, i) => (
          <li key={i} data-part="item" data-card={variant === 'grid' ? '' : undefined}>
            <Media src={img(s.image)} />
            <div data-part="text">
              <Name text={str(s.name)} href={str(s.href)} metadata={metadata} />
              {str(s.place) && <p data-part="meta">{str(s.place)}</p>}
              {str(s.body) && <p data-part="body">{str(s.body)}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  )
}

// ── The five roles the block builder names that the set lacked (BLD-210, docs/EDITOR-NEXT.md) ─────────────────
// Words the owner writes, in the same parts every theme styles. Live rows (next openings, the Space's hours) arrive
// with BLD-213; until then an owner types them, so nothing here states a number the owner did not write.

function FirstVisitBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('firstvisit', p.variant, metadata)
  const items = arr(p.items).filter((s) => str(s.title) || str(s.body))
  return (
    <Frame role="firstvisit" p={p} variant={variant}>
      <Heading p={p} />
      <ol data-part="list">
        {items.map((s, i) => (
          <li key={i} data-part="item" data-card={variant === 'grid' ? '' : undefined}>
            <span data-part="index">{i + 1}</span>
            <div data-part="text">
              {str(s.title) && <h3 data-part="name">{str(s.title)}</h3>}
              {str(s.body) && <p data-part="body">{str(s.body)}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Frame>
  )
}

function BookingBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('booking', p.variant, metadata)
  // The Space's own openings when it publishes availability (BLD-213); else the owner's typed times; a live page holding only
  // the sample copy draws nothing.
  const live = liveAsked(p) ? liveBooking(metadata) : []
  if (emptyLive(p, metadata, live.length > 0)) return null
  const items = (live.length ? live : arr(p.items).filter((s) => str(s.title))).slice(0, 6) as Props[]
  return (
    <Frame role="booking" p={p} variant={variant}>
      <Heading p={p}>{ctaOf(p, metadata)}</Heading>
      <ul data-part="list">
        {items.map((s, i) => {
          const to = str(s.href) ? hrefOf(str(s.href), metadata) : null
          return (
            <li key={i} data-part="item" data-card={variant === 'cards' ? '' : undefined}>
              <div data-part="when">
                {str(s.day) && <b data-part="day">{str(s.day)}</b>}
                {str(s.time) && <span data-part="time">{str(s.time)}</span>}
              </div>
              <div data-part="text">
                <Name text={str(s.title)} href={str(s.href)} metadata={metadata} />
                {str(s.note) && <p data-part="meta">{str(s.note)}</p>}
              </div>
              {to && <span data-part="go" aria-hidden="true">→</span>}
            </li>
          )
        })}
      </ul>
    </Frame>
  )
}

function LocationsBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('locations', p.variant, metadata)
  const src = img(p.image)
  const live = liveAsked(p) ? liveLocation(metadata) : null
  if (emptyLive(p, metadata, !!live)) return null
  const rows = (live ? live.items : arr(p.items)).filter((r) => str(r.label) && str(r.value))
  const address = live?.address || str(p.address)
  return (
    <Frame role="locations" p={p} variant={variant} media={!!src && variant === 'split'}>
      <div data-part="copy">
        <Heading p={p} />
        {address && <address data-part="address">{address}</address>}
        {rows.length > 0 && (
          <ul data-part="list">
            {rows.map((r, i) => (
              <li key={i} data-part="item"><span data-part="meta">{str(r.label)}</span><span data-part="value">{str(r.value)}</span></li>
            ))}
          </ul>
        )}
        {str(p.areas) && !(live && p.sample === true) && <p data-part="note">{str(p.areas)}</p>}
        <Actions p={p} metadata={metadata} />
      </div>
      {variant === 'split' && <Media src={src} alt={str(p.alt)} />}
    </Frame>
  )
}

function BusinessBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('business', p.variant, metadata)
  const items = arr(p.items).filter((s) => str(s.name))
  return (
    <Frame role="business" p={p} variant={variant}>
      <Heading p={p} />
      <ul data-part="list">
        {items.map((s, i) => (
          <li key={i} data-part="item" data-card={variant === 'grid' ? '' : undefined}>
            <h3 data-part="name">{str(s.name)}</h3>
            {str(s.body) && <p data-part="body">{str(s.body)}</p>}
          </li>
        ))}
      </ul>
    </Frame>
  )
}

function StoryBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('story', p.variant, metadata)
  const src = img(p.image)
  const lines = arr(p.items).filter((s) => str(s.text))
  return (
    <Frame role="story" p={p} variant={variant} media={!!src && variant === 'split'}>
      <div data-part="copy">
        <Heading p={p} />
        {lines.length > 0 && <div data-part="lines">{lines.map((s, i) => <p key={i} data-part="body">{str(s.text)}</p>)}</div>}
        {str(p.quote) && <blockquote data-part="quote">{str(p.quote)}</blockquote>}
      </div>
      {variant === 'split' && <Media src={src} alt={str(p.alt)} />}
    </Frame>
  )
}

// ── Registration ───────────────────────────────────────────────────────────────────────────

const text = (label: string, hint?: string) => ({ type: 'text', label, ...(hint ? { hint } : {}) }) as const
const area = (label: string, hint?: string) => ({ type: 'textarea', label, ...(hint ? { hint } : {}) }) as const
const image = { ...loomImageField, label: 'Photo' }
const VOICE_HINT = 'Wrap a word in *stars* to set it in the theme\'s italic voice.'
const LINK_HINT = 'Start with ~/ for a page of this site, like ~/book.'
const yesNo = (label: string) => ({ type: 'radio', label, options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] }) as const
const toneField = { type: 'select', label: 'Ground', options: [{ label: 'Theme default', value: '' }, { label: 'Page', value: 'canvas' }, { label: 'Soft', value: 'surface' }, { label: 'Band', value: 'band' }] } as const
const variantField = (role: RoleId) => ({
  type: 'select',
  label: 'Layout',
  options: [{ label: 'Theme default', value: '' }, ...Object.entries(ROLES[role].variants).map(([value, v]) => ({ label: v.label, value }))],
}) as const
const head = { eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), lead: area('Line under the heading') }
const action = { actionLabel: text('Button beside the heading'), actionHref: text('Button beside the heading: where it goes', LINK_HINT) }

function role(id: RoleId, fields: Record<string, unknown>, Comp: (args: Ctx & { now?: Date }) => ReactNode, extra: Props = {}): ComponentConfig {
  const defaults: Props = { ...ROLES[id].sample }
  delete defaults.sample
  return {
    label: ROLES[id].label,
    fields: { variant: variantField(id), ...fields, tone: toneField, layout: layoutField },
    defaultProps: { variant: '', tone: '', ...defaults, ...extra, layout: layoutDefault },
    render: (props: Props & { puck?: { metadata?: Props } }) => <Comp p={props} metadata={props.puck?.metadata} />,
  } as ComponentConfig
}

export const rolesComponents: Record<string, ComponentConfig> = {
  [ROLES.hero.type]: role('hero', {
    ...head,
    image, alt: text('Photo description', 'For screen readers.'),
    flip: { type: 'radio', label: 'Photo side (beside the words)', options: [{ label: 'Right', value: false }, { label: 'Left', value: true }] },
    primaryLabel: text('Main button'), primaryHref: text('Main button: where it goes', LINK_HINT),
    secondaryLabel: text('Second button'), secondaryHref: text('Second button: where it goes', LINK_HINT),
  }, HeroBlock, { flip: false }),
  [ROLES.steps.type]: role('steps', {
    ...head,
    items: { type: 'array', label: 'Steps', arrayFields: { title: text('Name'), body: area('Words') } },
  }, StepsBlock),
  [ROLES.offerings.type]: role('offerings', {
    ...head, ...action,
    live: yesNo('Use the Space\'s own practices, journeys and circles'),
    items: { type: 'array', label: 'Offerings', arrayFields: { image, title: text('Name'), body: area('Line under the name'), price: text('Price'), href: text('Link', LINK_HINT) } },
  }, OfferingsBlock),
  [ROLES.gatherings.type]: role('gatherings', {
    ...head, ...action,
    live: yesNo('Use the Space\'s own upcoming events'),
    count: { type: 'number', label: 'How many to show', min: 1, max: 12 },
    image, alt: text('Photo description', 'List beside a photo only.'),
    empty: area('Line when there are no dates yet'),
    items: { type: 'array', label: 'Dates', hint: 'Used when the Space has no upcoming events of its own.', arrayFields: { month: text('Month'), day: text('Day'), title: text('Name'), time: text('Time'), place: text('Place'), href: text('Link', LINK_HINT) } },
  }, GatheringsBlock),
  [ROLES.membership.type]: role('membership', {
    ...head,
    items: { type: 'array', label: 'Plans', hint: 'Mark one as the lead plan. The spotlight layout needs one.', arrayFields: { name: text('Name'), blurb: area('Line under the name'), price: text('Price'), per: text('After the price', 'Like / month.'), features: area('What it includes', 'One per line.'), badge: text('Badge'), featured: yesNo('Lead plan'), label: text('Button'), href: text('Link', LINK_HINT) } },
  }, MembershipBlock),
  [ROLES.proof.type]: role('proof', {
    live: yesNo('Use the Space\'s own reviews'),
    ...head,
    items: { type: 'array', label: 'Quotes', arrayFields: { quote: area('Quote'), name: text('Name'), role: text('Role'), photo: { ...loomImageField, label: 'Face' }, rating: { type: 'number', label: 'Stars (1 to 5)', min: 1, max: 5 } } },
    stats: { type: 'array', label: 'Figures (quote beside figures only)', hint: 'Real numbers only.', arrayFields: { value: text('Number'), label: text('What it counts') } },
  }, ProofBlock),
  [ROLES.faq.type]: role('faq', {
    ...head,
    live: yesNo('Use the Space\'s own questions'),
    items: { type: 'array', label: 'Questions', hint: 'Used when the Space has no questions of its own.', arrayFields: { question: text('Question'), answer: area('Answer') } },
  }, FaqBlock),
  [ROLES.cta.type]: role('cta', {
    ...head,
    primaryLabel: text('Main button'), primaryHref: text('Main button: where it goes', LINK_HINT),
    secondaryLabel: text('Second button'), secondaryHref: text('Second button: where it goes', LINK_HINT),
  }, CtaBlock),
  [ROLES.statement.type]: role('statement', {
    eyebrow: text('Small label'), title: area('Statement', VOICE_HINT), lead: area('Line under the statement'),
    items: { type: 'array', label: 'Short phrases (line layout only)', arrayFields: { text: text('Phrase') } },
    primaryLabel: text('Main button'), primaryHref: text('Main button: where it goes', LINK_HINT),
    secondaryLabel: text('Second button'), secondaryHref: text('Second button: where it goes', LINK_HINT),
  }, StatementBlock),
  [ROLES.letter.type]: role('letter', {
    eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), lead: area('Line under the heading'),
    primaryLabel: text('Button'), primaryHref: text('Button: where it goes', LINK_HINT),
    note: text('Small print under the button'),
  }, LetterBlock),
  [ROLES.contact.type]: role('contact', {
    ...head,
    items: { type: 'array', label: 'Details', hint: 'An email address in a link goes through the site\'s own contact page when it has one.', arrayFields: { label: text('Label'), value: text('Detail'), href: text('Link', LINK_HINT) } },
    primaryLabel: text('Main button'), primaryHref: text('Main button: where it goes', LINK_HINT),
    secondaryLabel: text('Second button'), secondaryHref: text('Second button: where it goes', LINK_HINT),
    note: text('Small print'),
  }, ContactBlock),
  [ROLES.stats.type]: role('stats', {
    live: yesNo('Use the Space\'s own figures'),
    ...head,
    items: { type: 'array', label: 'Figures', hint: 'Real numbers only.', arrayFields: { value: text('Number'), label: text('What it counts'), note: text('Small line') } },
  }, StatsBlock),
  [ROLES.shop.type]: role('shop', {
    ...head, ...action,
    items: { type: 'array', label: 'Products', arrayFields: { image, name: text('Name'), price: text('Price'), badge: text('Badge'), href: text('Link', LINK_HINT) } },
  }, ShopBlock),
  [ROLES.library.type]: role('library', {
    ...head, ...action,
    items: { type: 'array', label: 'Things to watch, read or do', arrayFields: { image, title: text('Name'), kind: text('Kind'), meta: text('Length or detail'), href: text('Link', LINK_HINT) } },
  }, LibraryBlock),
  [ROLES.people.type]: role('people', {
    live: yesNo('Use the Space\'s own team'),
    ...head,
    items: { type: 'array', label: 'People', hint: 'The one-person layout shows the first.', arrayFields: { photo: { ...loomImageField, label: 'Photo' }, name: text('Name'), role: text('Role'), bio: area('A few words'), href: text('Link', LINK_HINT) } },
  }, PeopleBlock),
  [ROLES.gallery.type]: role('gallery', {
    ...head, ...action,
    items: { type: 'array', label: 'Photos', arrayFields: { image, alt: text('Photo description', 'For screen readers.'), caption: text('Caption') } },
  }, GalleryBlock),
  [ROLES.chapters.type]: role('chapters', {
    live: yesNo('Use the Space\'s own chapters'),
    ...head, ...action,
    items: { type: 'array', label: 'Groups', arrayFields: { image, name: text('Name'), place: text('Place'), body: area('Line under the name'), href: text('Link', LINK_HINT) } },
  }, ChaptersBlock),
  [ROLES.firstvisit.type]: role('firstvisit', {
    ...head,
    items: { type: 'array', label: 'Steps of a first visit', hint: 'Who is there, how long, what to bring, what happens at the door.', arrayFields: { title: text('Name'), body: area('Words') } },
  }, FirstVisitBlock),
  [ROLES.booking.type]: role('booking', {
    ...head, ...action,
    items: { type: 'array', label: 'Open times', hint: 'Type the times that have room. They are your words until the Space\'s own openings are connected.', arrayFields: { day: text('Day'), time: text('Time'), title: text('Name'), note: text('Small line'), href: text('Link', LINK_HINT) } },
  }, BookingBlock),
  [ROLES.locations.type]: role('locations', {
    ...head,
    live: yesNo('Use the Space\'s own address, hours and contact lines'),
    address: text('Address'),
    items: { type: 'array', label: 'Details', arrayFields: { label: text('Label'), value: text('Detail') } },
    areas: area('Neighbourhoods people come from'),
    image, alt: text('Photo description', 'For screen readers.'),
    primaryLabel: text('Button'), primaryHref: text('Button: where it goes', LINK_HINT),
  }, LocationsBlock),
  [ROLES.business.type]: role('business', {
    ...head,
    items: { type: 'array', label: 'Tools', arrayFields: { name: text('Name'), body: area('Line under the name') } },
  }, BusinessBlock),
  [ROLES.story.type]: role('story', {
    ...head,
    items: { type: 'array', label: 'Lines of the story', arrayFields: { text: area('Words') } },
    quote: area('The line by the door'),
    image, alt: text('Photo description', 'For screen readers.'),
  }, StoryBlock),
}

export const ROLE_CATEGORY_COMPONENTS = Object.keys(rolesComponents)

/** True when the Space has its own rows for this role (the same readers the live render uses). */
export function roleHasSpaceRows(id: RoleId, metadata: Props | undefined, now: Date): boolean {
  switch (id) {
    case 'gatherings': return liveEvents(metadata, now, 1).length > 0
    case 'faq': { const faqs = (metadata?.space as { faqs?: unknown } | undefined)?.faqs; return Array.isArray(faqs) && faqs.some((f) => !!f && !!str((f as Props).question)) }
    case 'offerings': return liveOfferings(metadata).length > 0
    case 'proof': return liveReviews(metadata).length > 0
    case 'stats': return liveStats(metadata).length > 0
    case 'people': return liveTeam(metadata).length > 0
    case 'chapters': return liveChapters(metadata).length > 0
    case 'booking': return liveBooking(metadata).length > 0
    case 'locations': return liveLocation(metadata) !== null
    default: return false
  }
}

/** The visitor gate as one question (BLD-304): does this role block draw nothing for a visitor? True for the sample copy
 *  of a live role on a live page when the Space has no rows of its own to put in its place (the `emptyLive` rule every
 *  live role renderer applies). The host still sees it on the canvas, flagged as sample. */
export function roleDrawsNothingForVisitor(id: RoleId, props: Props, metadata: Props | undefined, now = new Date()): boolean {
  return emptyLive(props, metadata, roleHasSpaceRows(id, metadata, now))
}

/** The metadata an Add-sheet preview renders with (BLD-202): the Space's own rows when this role is live and the Space has
 *  some, else no Space at all, so the block draws its flagged sample instead of an empty live section. */
export function rolePreviewMetadata(id: RoleId, metadata: Props | undefined, now = new Date()): Props | undefined {
  if (ROLES[id].live && roleHasSpaceRows(id, metadata, now)) return metadata
  if (!metadata || !('space' in metadata)) return metadata
  const { space: _space, ...rest } = metadata
  return rest
}

/** The rows a role would send in an email (BLD-302): the Space's own rows when the role is live and the Space has some,
 *  else the rows the owner wrote. The same precedence the send-time data-block resolver uses (a live value wins, the
 *  stored snapshot stays when the row is gone), read once so the email lens shows what the send will fix. */
export function roleRowsAtSend(id: RoleId, p: Props, metadata: Props | undefined, now = new Date()): Props[] {
  const stored = arr(p.items)
  if (!ROLES[id].live || !liveAsked(p)) return stored
  const live: Props[] = (() => {
    switch (id) {
      case 'gatherings': return liveEvents(metadata, now, Math.max(1, Math.min(12, Number(p.count) || 6)))
      case 'offerings': return liveOfferings(metadata)
      case 'proof': return liveReviews(metadata)
      case 'stats': return liveStats(metadata)
      case 'people': return liveTeam(metadata)
      case 'chapters': return liveChapters(metadata)
      default: return []
    }
  })()
  return live.length ? live : stored
}
