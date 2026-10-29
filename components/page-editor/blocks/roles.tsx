import type { ReactNode } from 'react'
import type { ComponentConfig } from '@/lib/page-editor/types'
import { layoutField, layoutDefault, type LayoutValue } from '@/lib/page-editor/layout'
import { loomImageField } from '@/lib/page-editor/loom-image-field'
import { safeImageSrc } from '@/lib/safe-image-src'
import { safeImageUrl, safeUrl } from '@/lib/entity-blocks/block-content'
import { siteLocalHref, type SiteLinkMap } from '@/lib/sites/house-theme'
import { storedWallClock } from '@/lib/sites/site-events'
import { InlineText } from '@/components/sites/inline-text'
import { ROLES, roleVariant, type RoleId } from '@/lib/blocks/roles/roles'

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
  const variant = roleVariant('hero', p.variant)
  const src = img(p.image)
  const media = <Media src={src} alt={str(p.alt)} />
  return (
    <Frame role="hero" p={p} variant={variant} media={!!src}>
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

function StepsBlock({ p }: Ctx) {
  const variant = roleVariant('steps', p.variant)
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
  const variant = roleVariant('offerings', p.variant)
  const items = arr(p.items).filter((s) => str(s.title))
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

// ── Gatherings ─────────────────────────────────────────────────────────────────────────────

interface EventRow { id: string; slug?: string; title: string; startsAt: string; location?: string | null; isCancelled?: boolean }
const isRow = (e: unknown): e is EventRow => !!e && typeof (e as EventRow).id === 'string' && typeof (e as EventRow).title === 'string' && typeof (e as EventRow).startsAt === 'string'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const clock = (d: Date) => `${d.getUTCHours() % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')}${d.getUTCHours() < 12 ? 'am' : 'pm'}`

/** The Space's upcoming events as rows, soonest first, each start read as the stored wall clock. */
function liveEvents(metadata: Props | undefined, now: Date, count: number) {
  const raw = (metadata?.space as { events?: unknown } | undefined)?.events
  if (!Array.isArray(raw)) return []
  const today = now.toISOString().slice(0, 10)
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
  const variant = roleVariant('gatherings', p.variant)
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
  return (
    <Frame role="gatherings" p={p} variant={variant} media={!!src}>
      <Heading p={p}>{str(p.actionLabel) && <div data-part="actions"><Cta label={str(p.actionLabel)} href={str(p.actionHref)} kind="secondary" metadata={metadata} /></div>}</Heading>
      <div data-part="side">
        <Media src={src} alt={str(p.alt)} />
        {rows.length ? list : str(p.empty) ? <p data-part="empty">{str(p.empty)}</p> : null}
      </div>
    </Frame>
  )
}

// ── Membership ─────────────────────────────────────────────────────────────────────────────

function MembershipBlock({ p, metadata }: Ctx) {
  const variant = roleVariant('membership', p.variant)
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

function ProofBlock({ p }: Ctx) {
  const variant = roleVariant('proof', p.variant)
  const all = arr(p.items).filter((q) => str(q.quote))
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
  const variant = roleVariant('faq', p.variant)
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
  const variant = roleVariant('cta', p.variant)
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
  const variant = roleVariant('statement', p.variant)
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
  const variant = roleVariant('letter', p.variant)
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
  const variant = roleVariant('contact', p.variant)
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

function StatsBlock({ p }: Ctx) {
  const variant = roleVariant('stats', p.variant)
  const items = arr(p.items).filter((s) => str(s.value) && str(s.label)).slice(0, 6)
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
  const variant = roleVariant('shop', p.variant)
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
  const variant = roleVariant('library', p.variant)
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
  const variant = roleVariant('people', p.variant)
  const all = arr(p.items).filter((s) => str(s.name))
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
  const variant = roleVariant('gallery', p.variant)
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
  const variant = roleVariant('chapters', p.variant)
  const items = arr(p.items).filter((s) => str(s.name))
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
    ...head,
    items: { type: 'array', label: 'People', hint: 'The one-person layout shows the first.', arrayFields: { photo: { ...loomImageField, label: 'Photo' }, name: text('Name'), role: text('Role'), bio: area('A few words'), href: text('Link', LINK_HINT) } },
  }, PeopleBlock),
  [ROLES.gallery.type]: role('gallery', {
    ...head, ...action,
    items: { type: 'array', label: 'Photos', arrayFields: { image, alt: text('Photo description', 'For screen readers.'), caption: text('Caption') } },
  }, GalleryBlock),
  [ROLES.chapters.type]: role('chapters', {
    ...head, ...action,
    items: { type: 'array', label: 'Groups', arrayFields: { image, name: text('Name'), place: text('Place'), body: area('Line under the name'), href: text('Link', LINK_HINT) } },
  }, ChaptersBlock),
}

export const ROLE_CATEGORY_COMPONENTS = Object.keys(rolesComponents)
