import type { ReactNode } from 'react'
import {
  ArrowRight,
  CalendarCheck,
  Compass,
  Footprints,
  GraduationCap,
  Hammer,
  LifeBuoy,
  ListChecks,
  Map as MapIcon,
  MessageSquare,
  Repeat,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { safeImageSrc } from '@/lib/safe-image-src'
import { safeImageUrl } from '@/lib/entity-blocks/block-content'
import { siteLocalHref, type SiteLinkMap } from '@/lib/sites/house-theme'
import { MENSWORK_SEASON_INFO } from '@/lib/theme/menswork'
import {
  dateLabel,
  imageFocus,
  lines,
  mdOf,
  moduleLine,
  monthDay,
  MW_SEASON_ORDER,
  seasonAt,
  seasonNamed,
  signAt,
  signOn,
  type MwBlock,
  type MwPlan,
  type MwSeason,
} from '@/lib/sites/menswork-page'
import type { MwCircle, MwEvent, MwJourney, MwLive } from '@/lib/sites/menswork-data'
import { InlineText } from './inline-text'
import { MwBeats, MwCircleFinder, MwYearWheel, type MwCircleCard } from './menswork-live'

// A MENSWORK WEBSITE PAGE, drawn (owner ask 2026-10-07: "all the pages dialed in... all the elements from the
// entire design system"). lib/sites/menswork-page.ts plans which design section draws each block the owner
// placed; this file draws them from the block's own fields and the Space's own rows. A block the theme does
// not know is handed back to `renderOther`, the Space page's own render, so nothing placed ever disappears.
// Links follow the stand-alone rule: an owner's link becomes a link on the website (siteLocalHref), and the
// only links to Frequency are the ones labelled as such (View on Frequency, RSVP on Frequency).

type Props = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const arr = (v: unknown): Props[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Props[]) : [])
const imgOf = (v: unknown) => {
  const f = imageFocus(safeImageSrc(safeImageUrl(v) || null))
  return { src: f.src, position: f.position }
}

const ICONS: Record<string, LucideIcon> = {
  users: Users,
  repeat: Repeat,
  compass: Compass,
  flame: Compass,
  calendar: CalendarCheck,
  'calendar-check': CalendarCheck,
  'list-checks': ListChecks,
  'graduation-cap': GraduationCap,
  hammer: Hammer,
  footprints: Footprints,
  map: MapIcon,
  'message-square': MessageSquare,
  'life-buoy': LifeBuoy,
}

export interface MensworkPageInput {
  blocks: MwBlock[]
  plan: MwPlan[]
  live: MwLive
  links: SiteLinkMap
  /** The app origin, for the labelled Frequency links. */
  origin: string
  /** The page's title, used for the h1 when no block leads with one. */
  pageTitle: string
  renderOther: (block: MwBlock) => ReactNode
  now?: Date
  wrapSection?: (node: ReactNode, indexes: number[]) => ReactNode
}

export function MensworkPage({ blocks, plan, live, links, origin, pageTitle, renderOther, now = new Date(), wrapSection }: MensworkPageInput) {
  // One h1 per page: a leading hero owns it, else the first heading-type text block, else a hidden page title.
  const leadsWithHero = plan[0]?.kind === 'hero'
  const headAt = plan.find((p) => p.kind === 'text' && HEADING_TYPES.has(blocks[p.at].type))
  const ctx: Ctx = { links, origin, live, now, h1At: leadsWithHero || !headAt || Array.isArray(headAt.at) ? null : headAt.at }
  return (
    <div className="mw-page">
      {!leadsWithHero && ctx.h1At === null && <h1 className="sr-only">{pageTitle}</h1>}
      {plan.map((p, i) => {
        const at = Array.isArray(p.at) ? p.at[0] : p.at
        const key = `${p.kind}-${at}`
        const section = (() => {
        if (p.kind === 'year') return <Year key={key} blocks={p.at.map((n) => blocks[n].props)} ctx={ctx} />
        const props = blocks[p.at].props
        const first = i === 0
        switch (p.kind) {
          case 'hero':
            return <Hero key={key} p={props} ctx={ctx} first={first} />
          case 'head':
            return <Head key={key} p={props} />
          case 'facts':
            return <Facts key={key} p={props} type={blocks[p.at].type} />
          case 'faq':
            return <Faq key={key} p={props} />
          case 'beats':
            return <Beats key={key} p={props} />
          case 'path':
            return <Path key={key} p={props} grid={p.grid} />
          case 'parts':
            return <Parts key={key} p={props} />
          case 'lists':
            return <Lists key={key} p={props} />
          case 'photos':
            return <Photos key={key} p={props} type={blocks[p.at].type} />
          case 'quotes':
            return <Quotes key={key} p={props} />
          case 'story':
            return <Story key={key} p={props} ctx={ctx} />
          case 'closing':
            return <Closing key={key} p={props} ctx={ctx} />
          case 'strip':
            return <Strip key={key} p={props} ctx={ctx} />
          case 'note':
            return <Note key={key} p={props} />
          case 'checklist':
            return <Checklist key={key} p={props} />
          case 'text':
            return <TextBlock key={key} p={props} type={blocks[p.at].type} h1={ctx.h1At === p.at} />
          case 'band':
            return <div key={key} className="mw-wrap mw-band" aria-hidden />
          case 'events':
            return <Events key={key} p={props} ctx={ctx} />
          case 'circles':
            return <Circles key={key} p={props} ctx={ctx} />
          case 'journeys':
            return <Journeys key={key} p={props} ctx={ctx} />
          default:
            return (
              <div key={key} className="mw-wrap mw-other">
                {renderOther(blocks[p.at])}
              </div>
            )
        }
        })()
        return wrapSection ? wrapSection(section, Array.isArray(p.at) ? p.at : [p.at]) : section
      })}
    </div>
  )
}

interface Ctx {
  links: SiteLinkMap
  origin: string
  live: MwLive
  now: Date
  /** The block index whose heading is the page h1, when no hero leads. */
  h1At: number | null
}

// ── Shared pieces ────────────────────────────────────────────────────────────────────────────────────────

const HEADING_TYPES = new Set(['DisplayHeading', 'Heading', 'SpaceSectionTitle'])

function Title({ text, accent, as: El = 'h2', size = 'm' }: { text: string; accent?: string; as?: 'h1' | 'h2' | 'h3'; size?: 'xl' | 'l' | 'm' | 's' | 'xs' }) {
  if (!text) return null
  return (
    <El className={`mw-display mw-${size}`}>
      <InlineText text={text} accentStars accentWord={accent ?? ''} />
    </El>
  )
}

function Kicker({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="mw-kicker">{children}</p>
}

function Paras({ text, className = 'mw-body' }: { text: unknown; className?: string }) {
  const ps = str(text)
    .split(/\n\s*\n|<\/p>\s*<p[^>]*>/i)
    .map((p) => p.trim())
    .filter(Boolean)
  if (ps.length === 0) return null
  return (
    <>
      {ps.map((t, i) => (
        <p key={i} className={className}>
          <InlineText text={t} />
        </p>
      ))}
    </>
  )
}

function Photo({ v, alt, className, eager }: { v: unknown; alt?: string; className?: string; eager?: boolean }) {
  const { src, position } = imgOf(v)
  if (!src) return null
  return (
    <figure className={`mw-photo ${className ?? ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host */}
      <img src={src} alt={alt ?? ''} loading={eager ? 'eager' : 'lazy'} style={position ? { objectPosition: position } : undefined} />
    </figure>
  )
}

function Btn({ label, href, ctx, kind = 'primary' }: { label: string; href: string; ctx: Ctx; kind?: 'primary' | 'secondary' | 'ghost' }) {
  const to = siteLocalHref(href, ctx.links)
  if (!label || !to) return null
  const cls = kind === 'primary' ? 'hs-btn hs-btn-primary' : kind === 'secondary' ? 'hs-btn hs-btn-soft' : 'mw-textlink'
  return (
    <a href={to.href} className={cls} {...(to.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {label}
      {kind === 'primary' && <ArrowRight className="h-4 w-4" aria-hidden />}
    </a>
  )
}

function Chevrons({ items, tone = 'teal' }: { items: string[]; tone?: 'teal' | 'quiet' }) {
  if (items.length === 0) return null
  return (
    <ul className={`mw-chevlist mw-chevlist-${tone}`}>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  )
}

/** A Frequency path on the app origin, for the labelled Frequency links only. */
const app = (ctx: Ctx, path: string) => `${ctx.origin}${path}`

// ── Sections ─────────────────────────────────────────────────────────────────────────────────────────────

function Hero({ p, ctx, first }: { p: Props; ctx: Ctx; first: boolean }) {
  const title = str(p.title) || str(p.heading)
  const display = str(p.display)
  const variant = str(p.variant)
  const hasImage = variant !== 'text-only' && !!imgOf(p.image ?? p.imageUrl).src
  const layout = !hasImage ? 'text' : display === 'beside' ? 'split' : 'stack'
  const copy = (
    <div className="mw-hero-copy">
      <Kicker>{str(p.eyebrow)}</Kicker>
      <Title text={title} accent={str(p.accentWord)} as={first ? 'h1' : 'h2'} size="xl" />
      <Paras text={p.subtitle ?? p.body} className="mw-lead" />
      <div className="mw-actions">
        <Btn label={str(p.actionPrimaryLabel)} href={str(p.actionPrimaryHref)} ctx={ctx} />
        <Btn label={str(p.actionSecondaryLabel)} href={str(p.actionSecondaryHref)} ctx={ctx} kind="secondary" />
      </div>
    </div>
  )
  return (
    <section className={`mw-hero mw-hero-${layout}`}>
      <div className="mw-wrap mw-hero-inner">
        {copy}
        {layout === 'split' && <Photo v={p.image} alt={str(p.alt)} className="mw-chamfer" eager />}
      </div>
      {layout === 'stack' && <Photo v={p.image ?? p.imageUrl} alt={str(p.alt)} className="mw-hero-photo" eager />}
    </section>
  )
}

function Head({ p }: { p: Props }) {
  const card = p.surface === 'soft-card'
  return (
    <section className="mw-wrap mw-sec">
      <div className={card ? 'mw-frame mw-head mw-head-card' : 'mw-head'}>
        <div className="mw-head-title">
          <Kicker>{str(p.eyebrow)}</Kicker>
          <Title text={str(p.title)} accent={str(p.accentWord)} />
          {str(p.kicker) && <p className="mw-label mw-head-aside">{str(p.kicker)}</p>}
        </div>
        <div className="mw-head-text">
          <Paras text={p.lead ?? p.body} className="mw-lead" />
        </div>
      </div>
    </section>
  )
}

function Facts({ p, type }: { p: Props; type: string }) {
  const items = arr(type === 'EditorialSection' ? p.stats : p.items)
    .map((s) => ({ value: str(s.value), label: str(s.label) }))
    .filter((s) => s.value || s.label)
  if (items.length === 0) return null
  return (
    <section className="mw-wrap mw-sec">
      {(str(p.eyebrow) || str(p.title)) && (
        <div className="mw-sec-head">
          <Kicker>{str(p.eyebrow)}</Kicker>
          <Title text={str(p.title)} accent={str(p.accentWord) || str(p.titleAccent)} size="s" />
        </div>
      )}
      <dl className="mw-grid mw-facts">
        {items.map((s, i) => (
          <div key={i}>
            <dt className="mw-label">{s.label}</dt>
            <dd className="mw-fact-v">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Faq({ p }: { p: Props }) {
  const items = arr(p.faqs ?? p.items)
    .map((q) => ({ q: str(q.q ?? q.question), a: str(q.a ?? q.answer) }))
    .filter((q) => q.q)
  if (items.length === 0) return null
  return (
    <section className="mw-wrap mw-sec">
      <div className="mw-sec-head">
        <Kicker>{str(p.eyebrow)}</Kicker>
        <Title text={str(p.title)} accent={str(p.accentWord) || str(p.titleAccent)} size="s" />
      </div>
      <div className="mw-faqs">
        {items.map((q, i) => (
          <details key={i} className="hs-faq">
            <summary>{q.q}</summary>
            <div className="hs-faq-a">
              <Paras text={q.a} />
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

function SecHead({ p, right }: { p: Props; right?: ReactNode }) {
  if (!str(p.eyebrow) && !str(p.title) && !right) return null
  return (
    <div className="mw-sec-head mw-sec-head-row">
      <div>
        <Kicker>{str(p.eyebrow)}</Kicker>
        <Title text={str(p.title)} accent={str(p.accentWord) || str(p.titleAccent)} size="s" />
      </div>
      {right}
    </div>
  )
}

function Beats({ p }: { p: Props }) {
  const beats = arr(p.cards).map((c) => ({ letter: str(c.icon).toUpperCase(), word: str(c.title), body: str(c.body) }))
  return (
    <section className="mw-wrap mw-sec">
      <SecHead p={p} right={str(p.browseLabel) ? <span className="mw-freqtag">{str(p.browseLabel)}</span> : undefined} />
      <MwBeats beats={beats} start={Math.floor(beats.length / 2)} />
    </section>
  )
}

function stepN(icon: unknown, i: number) {
  const t = str(icon)
  return /^\d{1,2}$/.test(t) ? t.padStart(2, '0') : String(i + 1).padStart(2, '0')
}

function Path({ p, grid }: { p: Props; grid: boolean }) {
  const steps = arr(p.cards).map((c, i) => ({ n: stepN(c.icon, i), title: str(c.title), body: str(c.body) }))
  if (steps.length === 0) return null
  return (
    <section className="mw-wrap mw-sec">
      <SecHead p={p} />
      {grid ? (
        <ol className="mw-grid mw-grid-3 mw-path-grid">
          {steps.map((s) => (
            <li key={s.n}>
              <span className="mw-tag-chev">{s.n}</span>
              <h3 className="mw-display mw-xs">{s.title}</h3>
              <Paras text={s.body} className="mw-small" />
            </li>
          ))}
        </ol>
      ) : (
        <ol className="mw-path">
          {steps.map((s) => (
            <li key={s.n}>
              <span className="mw-path-n">{s.n}</span>
              <h3 className="mw-display mw-xs">{s.title}</h3>
              <p className="mw-small">{s.body}</p>
            </li>
          ))}
        </ol>
      )}
      <div className="mw-band" aria-hidden />
    </section>
  )
}

function Parts({ p }: { p: Props }) {
  const cards = arr(p.cards).map((c, i) => ({ n: String(i + 1).padStart(2, '0'), icon: ICONS[str(c.icon).toLowerCase()], title: str(c.title), body: str(c.body) }))
  if (cards.length === 0) return null
  // Whole rows only: six cards sit 3 by 2, never 5 and 1.
  const n = cards.length
  const cols = n <= 4 ? n : n % 4 === 0 ? 4 : 3
  return (
    <section className="mw-wrap mw-sec mw-parts-sec">
      <SecHead p={p} />
      <ul className={`mw-grid mw-parts mw-cols-${cols}`}>
        {cards.map((c) => (
          <li key={c.n}>
            <span className="mw-parts-top">
              <span className="mw-label">{c.n}</span>
              {c.icon && <c.icon className="h-5 w-5 mw-icon" aria-hidden />}
            </span>
            <h3 className="mw-display mw-xs">{c.title}</h3>
            <Paras text={c.body} className="mw-small" />
          </li>
        ))}
      </ul>
    </section>
  )
}

function Lists({ p }: { p: Props }) {
  const cols = arr(p.cards).map((c) => ({ title: str(c.title), items: lines(c.body) }))
  if (cols.length === 0) return null
  return (
    <section className="mw-wrap mw-sec">
      <SecHead p={p} />
      <div className="mw-lists">
        {cols.map((c, i) => (
          <div key={i}>
            {c.title && <p className="mw-label mw-label-strong">{c.title}</p>}
            <Chevrons items={c.items} tone={i === 0 ? 'teal' : 'quiet'} />
          </div>
        ))}
      </div>
    </section>
  )
}

function Photos({ p, type }: { p: Props; type: string }) {
  const items =
    type === 'Image'
      ? [p.image, ...arr(p.images).map((x) => x.image ?? x)].map((v) => ({ v, alt: str(p.alt), title: '' }))
      : arr(p.items ?? p.cards ?? p.images).map((x) => ({ v: x.image ?? x.src ?? x.url, alt: str(x.alt) || str(x.title), title: str(x.title) }))
  const shown = items.filter((x) => imgOf(x.v).src)
  if (shown.length === 0) return null
  return (
    <section className="mw-wrap mw-sec">
      <SecHead p={{ eyebrow: p.eyebrow, title: p.title ?? p.heading, accentWord: p.accentWord }} />
      <div className="mw-photos" style={{ gridTemplateColumns: `repeat(auto-fit,minmax(min(100%,${shown.length > 2 ? 240 : 320}px),1fr))` }}>
        {shown.map((x, i) => (
          <div key={i} className="mw-photos-item">
            <Photo v={x.v} alt={x.alt} className={i === shown.length - 1 ? 'mw-chamfer' : ''} />
            {x.title && <p className="mw-label">{x.title}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}

function Quotes({ p }: { p: Props }) {
  const qs = arr(p.cards).map((c) => ({ body: str(c.body), by: str(c.by) || str(c.title) })).filter((q) => q.body)
  if (qs.length === 0) return null
  return (
    <section className="mw-wrap mw-sec">
      <SecHead p={p} />
      <div className="mw-grid mw-grid-3">
        {qs.map((q, i) => (
          <figure key={i} className="mw-quote">
            <blockquote>{q.body}</blockquote>
            {q.by && <figcaption className="mw-label">{q.by}</figcaption>}
          </figure>
        ))}
      </div>
    </section>
  )
}

function Story({ p, ctx }: { p: Props; ctx: Ctx }) {
  const items = arr(p.items).map((x) => str(x.text)).filter(Boolean)
  const right = p.mediaSide === 'right'
  const hasPhoto = !!imgOf(p.image).src
  return (
    <section className={`mw-wrap mw-sec mw-story${right ? ' mw-story-right' : ''}${hasPhoto ? '' : ' mw-story-solo'}`}>
      {hasPhoto && <Photo v={p.image} alt={str(p.alt)} className="mw-chamfer mw-story-photo" />}
      <div className="mw-story-copy">
        <Kicker>{str(p.eyebrow)}</Kicker>
        <Title text={str(p.title)} accent={str(p.accentWord)} />
        {p.body === 'quote' ? (
          <figure className="mw-quote">
            <blockquote>{str(p.lead)}</blockquote>
            {str(p.quoteBy) && <figcaption className="mw-label">{str(p.quoteBy)}</figcaption>}
          </figure>
        ) : (
          <Paras text={p.lead} className="mw-lead" />
        )}
        {p.body === 'list' && <Chevrons items={items} />}
        {str(p.ctaLabel) && (
          <div>
            <Btn label={`${str(p.ctaLabel)} →`} href={str(p.ctaHref)} ctx={ctx} kind="ghost" />
          </div>
        )}
      </div>
    </section>
  )
}

function Closing({ p, ctx }: { p: Props; ctx: Ctx }) {
  const title = str(p.title) || str(p.heading)
  if (!title) return null
  return (
    <section className="mw-wrap mw-sec mw-closing">
      <div>
        <Kicker>{str(p.eyebrow)}</Kicker>
        <Title text={title} accent={str(p.accentWord)} size="m" />
        <Paras text={p.body} className="mw-body" />
      </div>
      <div className="mw-actions">
        <Btn label={str(p.ctaLabel) || str(p.buttonLabel)} href={str(p.ctaHref) || str(p.buttonHref)} ctx={ctx} />
      </div>
    </section>
  )
}

function Strip({ p, ctx }: { p: Props; ctx: Ctx }) {
  const to = siteLocalHref(str(p.ctaHref), ctx.links)
  const inner = (
    <>
      <span className="mw-strip-chev" aria-hidden />
      <span className="mw-strip-text">
        {str(p.eyebrow) && <span className="mw-label">{str(p.eyebrow)}</span>}
        <span className="mw-display mw-xs">{str(p.title)}</span>
      </span>
      <span className="mw-label mw-strip-end">
        {str(p.ctaLabel) || str(p.body)} {'→'}
      </span>
    </>
  )
  return (
    <section className="mw-wrap mw-sec">
      {to ? (
        <a href={to.href} className="mw-strip" {...(to.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {inner}
        </a>
      ) : (
        <div className="mw-strip">{inner}</div>
      )}
    </section>
  )
}

function Note({ p }: { p: Props }) {
  return (
    <section className="mw-wrap mw-sec">
      <div className="mw-note">
        <LifeBuoy className="h-6 w-6 mw-icon" aria-hidden />
        <span>
          <strong>{str(p.title)}</strong>
          <Paras text={p.body} className="mw-small" />
        </span>
        {str(p.eyebrow) && <span className="mw-badge mw-badge-full">{str(p.eyebrow)}</span>}
      </div>
    </section>
  )
}

function Checklist({ p }: { p: Props }) {
  const items = arr(p.items).map((x) => str(x.text)).filter(Boolean)
  if (items.length === 0) return null
  return (
    <section className="mw-wrap mw-sec">
      <SecHead p={{ title: p.title, titleAccent: p.titleAccent }} />
      <div className="mw-checklist">
        <Chevrons items={items} />
      </div>
    </section>
  )
}

function TextBlock({ p, type, h1 }: { p: Props; type: string; h1: boolean }) {
  if (HEADING_TYPES.has(type)) {
    const text = str(p.text) || str(p.title) || str(p.heading)
    return (
      <section className="mw-wrap mw-sec mw-text-head">
        <Kicker>{str(p.eyebrow)}</Kicker>
        <Title text={text} accent={str(p.accentWord) || str(p.titleAccent)} as={h1 ? 'h1' : 'h2'} size="l" />
        {str(p.kicker) && <p className="mw-lead">{str(p.kicker)}</p>}
      </section>
    )
  }
  return (
    <section className="mw-wrap mw-sec mw-text">
      <Paras text={p.text ?? p.body} className="mw-lead" />
    </section>
  )
}

// ── Live sections: the Space's own events, circles and journeys ─────────────────────────────────────────

const isCircleNight = (e: MwEvent) => /circle night/i.test(e.title)
// Opening-course weeks are listed under their module, so key dates skip them.
const isSession = (e: MwEvent) => /\bweek \d+\b/i.test(e.title)
const eventHref = (ctx: Ctx, e: MwEvent) => app(ctx, `/events/${e.slug}`)

function EventRow({ e, ctx }: { e: MwEvent; ctx: Ctx }) {
  const start = dateLabel(e.startsAt)
  const end = e.endsAt ? dateLabel(e.endsAt) : null
  const day = end && end.day !== start.day ? `${start.day} to ${end.day.replace(/^\w+ /, '')}` : start.day
  return (
    <li className="mw-date-row">
      <span className="mw-date-mark" data-kind={isCircleNight(e) ? 'circle' : /retreat/i.test(e.title) ? 'retreat' : 'event'} aria-hidden />
      <span className="mw-label mw-label-strong">
        {day}
        {start.time && !end?.day ? ` · ${start.time}` : start.time && end?.day === start.day ? ` · ${start.time}` : ''}
      </span>
      <span className="mw-date-text">
        <strong>{e.title}</strong>
        {(e.location || e.description) && <span className="mw-small">{[e.location, e.description?.split('\n')[0]].filter(Boolean).join(' · ')}</span>}
      </span>
      <a href={eventHref(ctx, e)} className="mw-textlink" target="_blank" rel="noopener noreferrer">
        RSVP on Frequency
      </a>
    </li>
  )
}

function Events({ p, ctx }: { p: Props; ctx: Ctx }) {
  const max = Number(p.max) > 0 ? Number(p.max) : 6
  // Circle Nights and course weeks have their own homes (season bar, The year); this list leads with the rest.
  const key = ctx.live.events.filter((e) => !isCircleNight(e) && !isSession(e))
  const events = (key.length > 0 ? key : ctx.live.events).slice(0, max)
  if (events.length === 0) return null
  return (
    <section className="mw-wrap mw-sec">
      <SecHead p={{ eyebrow: p.eyebrow, title: p.heading }} />
      <ol className="mw-dates">
        {events.map((e) => (
          <EventRow key={e.id} e={e} ctx={ctx} />
        ))}
      </ol>
    </section>
  )
}

function circleStatus(c: MwCircle): MwCircleCard['status'] {
  if (c.status === 'forming') return 'forming'
  return c.memberCap > 0 && c.memberCount >= c.memberCap ? 'full' : 'open'
}

function Circles({ p, ctx }: { p: Props; ctx: Ctx }) {
  if (ctx.live.circles.length === 0) return null
  const sign = signOn(ctx.now)
  const visit = siteLocalHref(`/spaces/${ctx.links.slug}/contact`, ctx.links)
  const cards: MwCircleCard[] = ctx.live.circles.map((c) => ({
    id: c.id,
    name: c.name,
    where: c.neighborhood,
    meets: c.meets,
    about: c.about,
    status: circleStatus(c),
    members: c.memberCount,
    cap: c.memberCap,
    imageUrl: safeImageSrc(c.imageUrl),
    host: c.host,
    hostAvatar: safeImageSrc(c.hostAvatar),
    module: `${sign.name}, same as every circle`,
    visitHref: visit?.href ?? null,
    frequencyHref: app(ctx, `/circles/${c.slug}`),
  }))
  return (
    <section className="mw-wrap mw-sec">
      <SecHead p={{ eyebrow: p.eyebrow, title: p.heading }} />
      <MwCircleFinder circles={cards} />
    </section>
  )
}

function Journeys({ p, ctx }: { p: Props; ctx: Ctx }) {
  const journeys = ctx.live.journeys
  if (journeys.length === 0) return null
  return (
    <section className="mw-wrap mw-sec">
      <SecHead p={{ eyebrow: p.eyebrow, title: p.heading }} />
      <div className="mw-journeys">
        {journeys.map((j) => (
          <JourneyCard key={j.id} j={j} ctx={ctx} />
        ))}
      </div>
    </section>
  )
}

/** One journey: its title and summary, and its first phase as the week list, each week dated from the
 *  Space's own events that carry the phase's name (the opening course's sessions). */
function JourneyCard({ j, ctx }: { j: MwJourney; ctx: Ctx }) {
  const first = j.phases.find((ph) => ph.steps.length > 0)
  const name = first?.title.toLowerCase() ?? ''
  const dated = name ? ctx.live.events.filter((e) => e.title.toLowerCase().includes(name)) : []
  const rest = j.phases.filter((ph) => ph !== first)
  return (
    <article className="mw-journey">
      <div className="mw-journey-head">
        <p className="mw-kicker mw-kicker-summer">Journey</p>
        <h3 className="mw-display mw-s">{j.title}</h3>
        {j.summary && <p className="mw-body">{j.summary}</p>}
        <a href={app(ctx, `/journeys/${j.slug}`)} className="mw-textlink" target="_blank" rel="noopener noreferrer">
          Start on Frequency
        </a>
      </div>
      {first && (
        <ol className="mw-weeks">
          {first.steps.map((t, i) => {
            const e = dated[i]
            return (
              <li key={i}>
                <span className="mw-week-tag">WK {String(i + 1).padStart(2, '0')}</span>
                <span className="mw-label">{e ? dateLabel(e.startsAt).day.replace(/^\w+ /, '') : ''}</span>
                <strong>{t}</strong>
              </li>
            )
          })}
          {rest.length > 0 && <li className="mw-weeks-more mw-label">{rest.map((ph) => ph.title).filter(Boolean).join(' · ')}</li>}
        </ol>
      )}
    </article>
  )
}

// ── The year ─────────────────────────────────────────────────────────────────────────────────────────────

function Year({ blocks, ctx }: { blocks: Props[]; ctx: Ctx }) {
  const seasons = blocks
    .map((p) => ({ p, id: seasonNamed(p.title) as MwSeason }))
    .sort((a, b) => MW_SEASON_ORDER.indexOf(a.id) - MW_SEASON_ORDER.indexOf(b.id))
  const events = ctx.live.events
  return (
    <section className="mw-wrap mw-sec mw-year">
      <MwYearWheel
        seasons={seasons.map(({ p, id }) => ({ id, name: MENSWORK_SEASON_INFO[id].name, range: MENSWORK_SEASON_INFO[id].range, arc: str(p.eyebrow) || null }))}
      />
      <div className="mw-year-seasons">
        {seasons.map(({ p, id }, i) => {
          const modules = arr(p.items)
            .map((x) => moduleLine(x.text))
            .filter((m): m is NonNullable<typeof m> => !!m)
          const inSeason = events.filter((e) => {
            const md = mdOf(e.startsAt)
            return md !== null && seasonAt(md) === id
          })
          const keyDates = inSeason.filter((e) => !isCircleNight(e) && !isSession(e))
          return (
            <article key={id} id={`season-${id}`} className="mw-season" data-season-mark={id}>
              <p className="mw-kicker mw-kicker-season">
                Season {String(i + 1).padStart(2, '0')} {'·'} {MENSWORK_SEASON_INFO[id].range}
              </p>
              <h2 className="mw-display mw-m mw-season-name">{MENSWORK_SEASON_INFO[id].name}</h2>
              {str(p.eyebrow) && <p className="mw-display mw-xs">{str(p.eyebrow)}</p>}
              <Paras text={p.lead} className="mw-lead" />
              <Photo v={p.image} alt={str(p.alt)} className="mw-chamfer mw-season-photo" />
              {modules.length > 0 && (
                <ul className="mw-modules">
                  {modules.map(({ sign, theme }) => {
                    const sessions = events.filter((e) => {
                      const md = mdOf(e.startsAt)
                      return md !== null && signAt(md).id === sign.id && (isCircleNight(e) || isSession(e))
                    })
                    return (
                      <li key={sign.id}>
                        <span className="mw-glyph" aria-hidden>
                          {`${sign.glyph}︎`}
                        </span>
                        <span className="mw-module-text">
                          <strong className="mw-display mw-xs">{sign.name}</strong>
                          <span className="mw-label">From {monthDay(sign.start)}</span>
                          <span className="mw-small">{theme}</span>
                        </span>
                        <span className="mw-module-dates">
                          {sessions.map((e) => (
                            <span key={e.id}>
                              <span className="mw-label mw-label-strong">{dateLabel(e.startsAt).day.replace(/^\w+ /, '')}</span>
                              <span className="mw-small">{e.title}</span>
                            </span>
                          ))}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
              {keyDates.length > 0 && (
                <div className="mw-keydates">
                  <p className="mw-label">Key dates</p>
                  <ol className="mw-dates">
                    {keyDates.map((e) => (
                      <EventRow key={e.id} e={e} ctx={ctx} />
                    ))}
                  </ol>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

/** The season bar's "now" line on a Menswork site: the season, the sign module, and that module's theme
 *  when the Space's own year page names it ("Libra: partnership, conflict, repair"). */
export function mensworkNowLine(pageDocs: unknown, now: Date): { module: string; theme: string | null } {
  const sign = signOn(now)
  let theme: string | null = null
  const docs = pageDocs && typeof pageDocs === 'object' ? Object.values(pageDocs as Record<string, unknown>) : []
  for (const d of docs) {
    const content = (d as { content?: unknown })?.content
    for (const b of Array.isArray(content) ? content : []) {
      const items = (b as { props?: { items?: unknown } })?.props?.items
      for (const it of Array.isArray(items) ? items : []) {
        const m = moduleLine((it as { text?: unknown })?.text)
        if (m && m.sign.id === sign.id) theme = m.theme
      }
    }
  }
  return { module: `${sign.name} module`, theme }
}
