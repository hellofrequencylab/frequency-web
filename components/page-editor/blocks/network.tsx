import type { ReactNode } from 'react'
import type { ComponentConfig } from '@/lib/page-editor/types'
import { layoutField, layoutDefault, padClass, visClass, type LayoutValue } from '@/lib/page-editor/layout'
import { safeImageSrc } from '@/lib/safe-image-src'
import { safeImageUrl, safeUrl } from '@/lib/entity-blocks/block-content'
import { siteLocalHref, type SiteLinkMap } from '@/lib/sites/house-theme'
import { dateLabel } from '@/lib/sites/menswork-page'
import { InlineText } from '@/components/sites/inline-text'
import { NetworkCountdown } from '@/components/sites/network-countdown'
import { NetworkEventsExplorer } from '@/components/sites/network-events-explorer'
import { networkChapterLabel } from '@/lib/sites/network-events'
import { loomImageField } from '@/lib/page-editor/loom-image-field'
import { countdownParts, wallClockInstant } from '@/lib/time/wall-clock'
import {
  ArrowRight, Briefcase, Building2, CalendarDays, Camera, Check, Clock, Coffee, Compass, Eye, Flag, Gift, HandHeart, Heart, Lightbulb,
  Mail, MapPin, Mic, Mountain, Music, Phone, Play, Rocket, Sparkles, Sprout, Star, Sun, Users, Video, Waves, Wind, type LucideIcon,
} from 'lucide-react'

// ── The Network block family (The Group's design handoff, 2026-10-13) ───────────────────────────────────
// Every section of the handoff's Homepage that no generic block can carry is one registered block here:
// the hero with its "This Friday" card, the stat tiles, the photo split with facts, the accent band with a
// countdown, the events list beside its calendar, numbered steps, the dark chapters band, circles, the
// founder and team, membership tiers, priced offerings, the dark media band, social posts, merch cards and
// the coffee card. Server Components; the one island is the countdown (components/sites/network-countdown.tsx).
//
// Dates are the Space's own events (`puck.metadata.space.events`, the channel the Space blocks read). Every
// default word is the THEME's, generic: a Space's own words ride its props. The blocks read `--nw-*` and DAWN
// tokens through classes in components/sites/network-css.ts; on another theme they fall back to its tokens.

type Props = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const arr = (v: unknown): Props[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Props[]) : [])
const img = (v: unknown) => safeImageSrc(safeImageUrl(v) || null)
const cls = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')
const layoutOf = (layout: unknown) => ({ pad: padClass(layout as LayoutValue), vis: visClass(layout as LayoutValue) })
const lines = (v: unknown) => str(v).split('\n').map((s) => s.trim()).filter(Boolean)

/** The icons a Network block may name, Lucide at the handoff's 1.75 stroke. */
const ICONS: Record<string, LucideIcon> = {
  users: Users, calendar: CalendarDays, eye: Eye, pin: MapPin, clock: Clock, sun: Sun, waves: Waves, building: Building2, compass: Compass,
  mountain: Mountain, flag: Flag, mic: Mic, coffee: Coffee, heart: Heart, wind: Wind, music: Music, spark: Sparkles, video: Video, camera: Camera,
  sprout: Sprout, rocket: Rocket, idea: Lightbulb, support: HandHeart, star: Star, gift: Gift, check: Check, mail: Mail, phone: Phone,
  briefcase: Briefcase, play: Play,
}
const ICON_OPTIONS = [{ label: 'None', value: '' }, ...Object.keys(ICONS).map((k) => ({ label: k[0].toUpperCase() + k.slice(1), value: k }))]
const iconField = { type: 'select', label: 'Icon', options: ICON_OPTIONS } as const

function Icon({ name, className }: { name: string; className?: string }) {
  const I = ICONS[name]
  return I ? <I className={cls('nw-i', className)} strokeWidth={1.75} aria-hidden /> : null
}

/** A link through the site's link map when the page has one (a website page); kept as written otherwise. */
function hrefOf(raw: string, metadata: Props | undefined): string | null {
  if (!raw) return null
  if (raw.startsWith('#')) return raw
  const links = metadata?.links as SiteLinkMap | undefined
  // A Space path the website has no page for (Memberships, Shop, Calendar) opens on Frequency itself.
  if (links) return siteLocalHref(raw, links)?.href ?? (/^\/(?:spaces|circles|events|market)(?:\/|[?#]|$)|^\/sign-in(?:[?#]|$)/.test(raw) ? `${links.origin}${raw}` : null)
  return safeUrl(raw) || (raw.startsWith('/') ? raw : null)
}
const external = (href: string) => /^https?:\/\//.test(href)

function Btn({ label, href, kind = 'primary', metadata, arrow = false, className }: { label: string; href: string; kind?: 'primary' | 'soft' | 'ink' | 'light'; metadata?: Props; arrow?: boolean; className?: string }) {
  const to = label ? hrefOf(href, metadata) : null
  if (!to) return null
  return (
    <a className={cls('hs-btn', kind === 'primary' ? 'hs-btn-primary' : kind === 'soft' ? 'hs-btn-soft' : `nw-btn-${kind}`, className)} href={to} {...(external(to) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {label}
      {arrow && <ArrowRight className="nw-arr" strokeWidth={2} aria-hidden />}
    </a>
  )
}

function Eyebrow({ text, className }: { text: string; className?: string }) {
  return text ? (
    <span className={cls('nw-eyebrow', className)}>
      <i aria-hidden />
      {text}
    </span>
  ) : null
}

function Title({ text, as: El = 'h2', className }: { text: string; as?: 'h1' | 'h2' | 'h3'; className?: string }) {
  return text ? (
    <El className={cls('nw-title', className)}>
      <InlineText text={text} accentStars />
    </El>
  ) : null
}

function Head({ eyebrow, title, lead, action, actionHref, metadata, as }: { eyebrow?: string; title?: string; lead?: string; action?: string; actionHref?: string; metadata?: Props; as?: 'h1' | 'h2' }) {
  if (!eyebrow && !title && !lead) return null
  const button = action ? <Btn label={action} href={actionHref ?? ''} kind="soft" metadata={metadata} arrow /> : null
  return (
    <div className={cls('nw-head', button && 'nw-head-row')}>
      <div>
        <Eyebrow text={eyebrow ?? ''} />
        <Title text={title ?? ''} as={as} />
        {lead && <p className="nw-lead">{lead}</p>}
      </div>
      {button}
    </div>
  )
}

function Section({ name, pad, vis, band, children, id }: { name: string; pad?: string; vis?: string; band?: 'ink' | 'sand' | ''; children: ReactNode; id?: string }) {
  return (
    <section id={id || undefined} data-nw-island="" className={cls('nw-block', `nw-block-${name}`, band && `nw-band nw-band-${band}`, pad, vis)}>
      <div className="nw-wrap">{children}</div>
    </section>
  )
}

// ── Events, from the Space's own rows ────────────────────────────────────────────────────────────────

interface EventRow {
  id: string
  slug?: string
  title: string
  startsAt: string
  endsAt?: string | null
  timeZone?: string | null
  location?: string | null
  description?: string | null
  priceLabel?: string | null
  isCancelled?: boolean
  hostingSpaceId?: string | null
}
const isRow = (e: unknown): e is EventRow => !!e && typeof (e as EventRow).id === 'string' && typeof (e as EventRow).title === 'string' && typeof (e as EventRow).startsAt === 'string'
const dayOf = (iso: string) => iso.slice(0, 10)
const todayIn = (now: Date, tz: string) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}
const ZONE = 'America/Los_Angeles'

/** The Space's upcoming events, soonest first from today in the Space's zone, cancelled rows dropped. */
function upcoming(metadata: Props | undefined, now: Date): EventRow[] {
  const space = metadata?.space as { events?: unknown } | undefined
  const rows = Array.isArray(space?.events) ? space.events.filter(isRow) : []
  const today = todayIn(now, rows[0]?.timeZone || ZONE)
  return rows.filter((e) => !e.isCancelled && dayOf(e.startsAt) >= today).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

function eventHref(e: EventRow, metadata: Props | undefined): string | null {
  if (!e.slug) return null
  const origin = (metadata?.links as SiteLinkMap | undefined)?.origin
  return origin ? `${origin}/events/${e.slug}` : `/events/${e.slug}`
}

const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const utc = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)))

/** The date tile: the weekday over the day of the month, in the sand counterpoint. */
function DateTile({ iso, className }: { iso: string; className?: string }) {
  const d = utc(iso)
  return (
    <span className={cls('nw-date', className)} aria-hidden>
      <small>{WEEKDAY[d.getUTCDay()]}</small>
      <b>{d.getUTCDate()}</b>
    </span>
  )
}

function timeRange(e: EventRow): string {
  const a = dateLabel(e.startsAt).time
  const b = e.endsAt ? dateLabel(e.endsAt).time : null
  if (!a) return ''
  if (!b) return a
  const [ta, pa] = a.split(' ')
  const [tb, pb] = b.split(' ')
  return pa === pb ? `${ta}–${tb} ${pb}` : `${a}–${b}`
}

/** "Today", "Tomorrow", a weekday this week, else "Thu, Oct 22": the handoff's day headings. */
function relDay(iso: string, today: string): string {
  const n = Math.round((utc(iso).getTime() - utc(today).getTime()) / 864e5)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  const d = utc(iso)
  if (n > 1 && n < 7) return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()]
  return dateLabel(iso).day.replace(' ', ', ')
}

/** The declared hosting Space, with a unique title/place match for legacy documents. */
const chapterOf = networkChapterLabel

/** A tag's color: the hero color first, then the theme's five tag colors. */
const tone = (i: number) => (i <= 0 ? 'var(--color-primary)' : `var(--nw-tag-${((i - 1) % 5) + 1})`)
const toneOf = (label: string | null, chapters: { label: string }[]) => tone(label ? chapters.findIndex((c) => c.label === label) : 0)

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// 1. Hero: words on one side, the leaf-cropped photo on the other with the next featured event pinned to it.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function NetworkHeroBlock({ p, metadata, now = new Date(), pad, vis }: { p: Props; metadata?: Props; now?: Date; pad?: string; vis?: string }) {
  const image = img(p.image)
  const match = str(p.featureMatch).toLowerCase()
  const next = match ? upcoming(metadata, now).find((e) => e.title.toLowerCase().includes(match)) ?? null : null
  const faces = arr(p.faces).map((f) => img(f.image)).filter((s): s is string => !!s).slice(0, 4)
  const href = next ? eventHref(next, metadata) : null
  return (
    <section data-nw-island="" className={cls('nw-block nw-block-hero', pad, vis)}>
      <div className="nw-wrap nw-hero" data-crop={str(p.crop) || 'leaf'}>
        <div className="nw-hero-copy">
          <Eyebrow text={str(p.eyebrow)} />
          <Title text={str(p.title)} as="h1" className="nw-display" />
          {str(p.lead) && <p className="nw-lead">{str(p.lead)}</p>}
          <div className="nw-actions">
            <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} metadata={metadata} arrow />
            <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind="soft" metadata={metadata} />
          </div>
          {(faces.length > 0 || str(p.proof)) && (
            <div className="nw-proof">
              {faces.length > 0 && (
                <span className="nw-faces" aria-hidden>
                  {faces.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
                    <img key={src} src={src} alt="" />
                  ))}
                  <span>+</span>
                </span>
              )}
              <span>
                <b>{str(p.proof)}</b>
                {str(p.proofNote) && <small>{str(p.proofNote)}</small>}
              </span>
            </div>
          )}
        </div>
        {image && (
          <div className="nw-hero-photo nw-graded">
            {/* eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host */}
            <img src={image} alt={str(p.alt)} loading="eager" style={str(p.focus) ? { objectPosition: str(p.focus) } : undefined} />
            {next && (
              <div className="nw-ev">
                <DateTile iso={next.startsAt} />
                <span className="nw-ev-text">
                  <b>{next.title}</b>
                  <small>{[timeRange(next), str(p.featureNote)].filter(Boolean).join(' · ')}</small>
                </span>
                {href && <a className="hs-btn hs-btn-primary nw-ev-btn" href={href}>{str(p.featureCta) || 'RSVP'}</a>}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

// 2. Stats: big numbers on the tonal fill, each with its icon.
export function NetworkStatsBlock({ p, pad, vis }: { p: Props; pad?: string; vis?: string }) {
  const items = arr(p.items).map((s) => ({ icon: str(s.icon), value: str(s.value), label: str(s.label) })).filter((s) => s.value)
  if (items.length === 0) return null
  return (
    <Section name="stats" pad={pad} vis={vis}>
      <dl className="nw-stats">
        {items.map((s, i) => (
          <div key={i} className="nw-stat" data-tone={i % 3}>
            <span className="nw-blip nw-blip-1" aria-hidden />
            <span className="nw-blip nw-blip-2" aria-hidden />
            <span className="nw-blip nw-blip-3" aria-hidden />
            {s.icon && <span className="nw-stat-i"><Icon name={s.icon} /></span>}
            <dd>{s.value}</dd>
            <dt>{s.label}</dt>
          </div>
        ))}
      </dl>
    </Section>
  )
}

// 3. Split: a photo panel beside the words, two fact tiles and two buttons.
export function NetworkSplitBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const image = img(p.image)
  const facts = arr(p.facts).map((f) => ({ icon: str(f.icon), label: str(f.label), value: str(f.value), note: str(f.note) })).filter((f) => f.value)
  return (
    <Section name="split" pad={pad} vis={vis} band={str(p.band) === 'sand' ? 'sand' : str(p.band) === 'ink' ? 'ink' : ''} id={str(p.anchor)}>
      <div className={cls('nw-split', str(p.mediaSide) === 'right' && 'nw-split-right')}>
        {image && (
          <div className="nw-photo nw-graded">
            {/* eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host */}
            <img src={image} alt={str(p.alt)} loading="lazy" />
          </div>
        )}
        <div className="nw-split-copy">
          <Eyebrow text={str(p.eyebrow)} />
          <Title text={str(p.title)} />
          {lines(p.body).map((t, i) => <p key={i} className={i === 0 ? 'nw-lead' : 'nw-body'}>{t}</p>)}
          {facts.length > 0 && (
            <div className="nw-facts">
              {facts.map((f, i) => (
                <div key={i} className="nw-fact">
                  <small><Icon name={f.icon} />{f.label}</small>
                  <b>{f.value}</b>
                  {f.note && <span>{f.note}</span>}
                </div>
              ))}
            </div>
          )}
          {str(p.quote) && (
            <blockquote className="nw-pull">
              <p>{str(p.quote)}</p>
              {str(p.quoteBy) && <cite>{str(p.quoteBy)}</cite>}
            </blockquote>
          )}
          <div className="nw-actions">
            <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} metadata={metadata} arrow />
            <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind="soft" metadata={metadata} />
          </div>
        </div>
      </div>
    </Section>
  )
}

// 4. Accent band: the one solid hero-color band, with a countdown and a photo.
export function NetworkBandBlock({ p, metadata, now = new Date(), pad, vis }: { p: Props; metadata?: Props; now?: Date; pad?: string; vis?: string }) {
  const image = img(p.image)
  const at = str(p.countdownTo)
  const tz = str(p.timeZone) || ZONE
  const target = at ? wallClockInstant(at, tz) : Number.NaN
  const live = Number.isFinite(target) && target > now.getTime()
  return (
    <Section name="accent" pad={pad} vis={vis} id={str(p.anchor)}>
      <div className={cls('nw-accent-band', !image && 'nw-accent-solo')}>
        <div className="nw-accent-copy">
          <Eyebrow text={str(p.eyebrow)} className="nw-eyebrow-on" />
          <Title text={str(p.title)} />
          {str(p.body) && <p>{str(p.body)}</p>}
          {live && <NetworkCountdown startsAt={at} timeZone={tz} initial={countdownParts(target, now.getTime())} label={str(p.countdownLabel) || 'Time until it starts'} />}
          <div className="nw-actions">
            <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} kind="ink" metadata={metadata} />
            <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind="light" metadata={metadata} />
          </div>
        </div>
        {image && (
          <div className="nw-accent-photo nw-graded">
            {/* eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host */}
            <img src={image} alt={str(p.alt)} loading="lazy" />
          </div>
        )}
      </div>
    </Section>
  )
}

// 5. Events: live public cards, chapter/date filters, and a calendar beside the next matching event.
export function NetworkEventsBlock({ p, metadata, now = new Date(), pad, vis }: { p: Props; metadata?: Props; now?: Date; pad?: string; vis?: string }) {
  const rows = upcoming(metadata, now)
  const max = Math.max(1, Math.min(24, Number(p.max) || 6))
  const chapters = arr(p.chapters).map((c) => ({ label: str(c.label), spaceId: str(c.spaceId), match: str(c.match).toLowerCase().split('|').map((s) => s.trim()) })).filter((c) => c.label)
  const today = todayIn(now, rows[0]?.timeZone || ZONE)
  const items = rows.map((e) => {
    const href = eventHref(e, metadata)
    const chapter = chapterOf(e, chapters)
    const target = wallClockInstant(e.startsAt, e.timeZone || ZONE)
    const end = e.endsAt ? wallClockInstant(e.endsAt, e.timeZone || ZONE) : Number.NaN
    return {
      id: e.id, day: dayOf(e.startsAt), chapter, title: e.title, time: timeRange(e), href,
      startsAt: e.startsAt, timeZone: e.timeZone || ZONE,
      startsAtInstant: Number.isFinite(target) ? target : null, endsAtInstant: Number.isFinite(end) ? end : null,
      countdown: Number.isFinite(target) ? countdownParts(target, now.getTime()) : null,
      card: <li key={e.id} className="nw-erow" style={{ ['--c' as string]: toneOf(chapter, chapters) }}>
        <DateTile iso={e.startsAt} />
        <span className="nw-erow-text">
          <b>{e.title}</b>
          <small><span><Icon name="clock" />{timeRange(e)}</span>{e.location && <span><Icon name="pin" />{e.location}</span>}</small>
          {(chapter || e.priceLabel) && <span className="nw-tags">{chapter && <span className="nw-tag nw-tag-ch"><i aria-hidden />{chapter}</span>}{e.priceLabel && <span className="nw-tag nw-tag-quiet">{e.priceLabel}</span>}</span>}
        </span>
        {href && <a className="hs-btn hs-btn-primary nw-erow-btn" href={href} aria-label={`RSVP to ${e.title}`}>RSVP</a>}
      </li>,
    }
  })
  return <Section name="events" pad={pad} vis={vis} id={str(p.anchor)}>
    <Head eyebrow={str(p.eyebrow)} title={str(p.title)} lead={str(p.lead)} action={str(p.actionLabel)} actionHref={str(p.actionHref)} metadata={metadata} />
    {rows.length === 0 ? <p className="nw-empty">{str(p.empty) || 'Nothing on the calendar yet. Check back soon.'}</p> : <NetworkEventsExplorer
      items={items} chapters={chapters.map((c) => ({ label: c.label, tone: toneOf(c.label, chapters) }))} today={today} initialNow={now.getTime()} max={max}
      allLabel={str(p.allLabel) || 'All chapters'} empty={str(p.empty) || 'Nothing scheduled for these filters. Try another day or chapter.'}
      moreHref={hrefOf(str(p.moreHref), metadata)} moreLabel={str(p.moreLabel) || 'See more events'}
    />}
  </Section>
}

// 6. Steps: numbered cards, the last may carry a button.
export function NetworkStepsBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const steps = arr(p.steps).map((s) => ({ title: str(s.title), body: str(s.body), cta: str(s.ctaLabel), href: str(s.ctaHref) })).filter((s) => s.title)
  if (steps.length === 0) return null
  return (
    <Section name="steps" pad={pad} vis={vis} id={str(p.anchor)}>
      <Head eyebrow={str(p.eyebrow)} title={str(p.title)} lead={str(p.lead)} />
      <ol className="nw-steps">
        {steps.map((s, i) => (
          <li key={i} className="nw-card">
            <span className="nw-step-n" aria-hidden>{i + 1}</span>
            <h3>{s.title}</h3>
            {s.body && <p>{s.body}</p>}
            {s.cta && <Btn label={s.cta} href={s.href} metadata={metadata} className="nw-step-btn" />}
          </li>
        ))}
      </ol>
    </Section>
  )
}

// 7. Chapters: the dark band. Chapter chips, photo cards, then icon cards.
export function NetworkChaptersBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const chips = arr(p.chips).map((c) => ({ icon: str(c.icon), name: str(c.name), line: str(c.line), when: str(c.when), href: str(c.href), on: c.on === true })).filter((c) => c.name)
  const cards = arr(p.cards).map((c) => ({ image: img(c.image), alt: str(c.alt), icon: str(c.icon), kicker: str(c.kicker), title: str(c.title), body: str(c.body), href: str(c.href) })).filter((c) => c.title)
  const notes = arr(p.notes).map((c) => ({ icon: str(c.icon), title: str(c.title), body: str(c.body) })).filter((c) => c.title)
  return (
    <Section name="chapters" pad={pad} vis={vis} band="ink" id={str(p.anchor)}>
      <Head eyebrow={str(p.eyebrow)} title={str(p.title)} lead={str(p.lead)} />
      {chips.length > 0 && (
        <ul className="nw-chips">
          {chips.map((c) => {
            const to = hrefOf(c.href, metadata)
            const body = (
              <>
                <span className="nw-chip-i"><Icon name={c.icon || 'pin'} /></span>
                <b>{c.name}</b>
                {c.line && <span>{c.line}</span>}
                {c.when && <small>{c.when}</small>}
              </>
            )
            return <li key={c.name} className="nw-chip" data-on={c.on || undefined} style={{ ['--c' as string]: tone(chips.indexOf(c)) }}>{to ? <a href={to}>{body}</a> : <div>{body}</div>}</li>
          })}
        </ul>
      )}
      {cards.length > 0 && (
        <ul className="nw-cards">
          {cards.map((c) => {
            const to = hrefOf(c.href, metadata)
            const body = (
              <>
                {c.image && (
                  <span className="nw-card-im nw-graded">
                    {/* eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host */}
                    <img src={c.image} alt={c.alt} loading="lazy" />
                  </span>
                )}
                <span className="nw-card-b">
                  {c.kicker && <span className="nw-card-k"><Icon name={c.icon} />{c.kicker}</span>}
                  <h3>{c.title}</h3>
                  {c.body && <p>{c.body}</p>}
                </span>
              </>
            )
            return <li key={c.title} className="nw-card nw-card-photo">{to ? <a href={to}>{body}</a> : body}</li>
          })}
        </ul>
      )}
      {notes.length > 0 && (
        <ul className="nw-notes">
          {notes.map((n) => (
            <li key={n.title} className="nw-note">
              <span className="nw-note-i"><Icon name={n.icon || 'spark'} /></span>
              <h3>{n.title}</h3>
              {n.body && <p>{n.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

const CIRCLE_TONES = ['var(--color-primary)', 'var(--nw-pop)', 'var(--nw-pop2)', 'var(--nw-pop3)']

// 8. Circles: member-led groups as cards, each with its next date from the Space's own events.
export function NetworkCirclesBlock({ p, metadata, now = new Date(), pad, vis }: { p: Props; metadata?: Props; now?: Date; pad?: string; vis?: string }) {
  const rows = upcoming(metadata, now)
  const community = arr((metadata?.space as Props | undefined)?.community)
  const origin = (metadata?.links as SiteLinkMap | undefined)?.origin ?? ''
  const today = todayIn(now, rows[0]?.timeZone || ZONE)
  const cards = arr(p.circles).map((c) => {
    const title = str(c.title)
    const match = (str(c.match) || title).toLowerCase()
    const next = rows.find((e) => e.title.toLowerCase().includes(match)) ?? null
    // The public community bag is capped and covers this Space, not every chapter. An authored
    // slug therefore remains a valid door when its circle is absent from that partial list.
    // Old documents can still resolve an exact name against the public rows already loaded.
    const circleSlug = str(c.circleSlug) || str(community.find((circle) => str(circle.name).toLowerCase() === title.toLowerCase())?.slug)
    const circleHref = circleSlug ? `${origin}/circles/${encodeURIComponent(circleSlug)}` : null
    return { icon: str(c.icon), title, body: str(c.body), when: str(c.when), where: str(c.where), next, href: next ? eventHref(next, metadata) : null, circleHref }
  }).filter((c) => c.title)
  if (cards.length === 0) return null
  return (
    <Section name="circles" pad={pad} vis={vis} band="sand" id={str(p.anchor)}>
      <Head eyebrow={str(p.eyebrow)} title={str(p.title)} lead={str(p.lead)} action={str(p.actionLabel)} actionHref={str(p.actionHref)} metadata={metadata} />
      <ul className="nw-circles">
        {cards.map((c) => (
          <li key={c.title} className="nw-card nw-circle" style={{ ['--c' as string]: CIRCLE_TONES[cards.indexOf(c) % CIRCLE_TONES.length] }}>
            <span className="nw-circle-i"><Icon name={c.icon || 'users'} /></span>
            <h3>{c.title}</h3>
            {c.body && <p>{c.body}</p>}
            {c.when && <small>{c.when}</small>}
            {c.where && <small>{c.where}</small>}
            {c.circleHref && <a className="nw-next" href={c.circleHref}>View circle<ArrowRight className="nw-arr" strokeWidth={2} aria-hidden /></a>}
            {c.next && c.href ? (
              <a className="nw-next" href={c.href}>Next: {relDay(dayOf(c.next.startsAt), today)}<ArrowRight className="nw-arr" strokeWidth={2} aria-hidden /></a>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  )
}

// 9. Founder: a portrait beside the founder's words and the hosts.
export function NetworkFounderBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const image = img(p.image)
  const hosts = arr(p.hosts).map((h) => ({ image: img(h.image), name: str(h.name), role: str(h.role) })).filter((h) => h.name)
  return (
    <Section name="founder" pad={pad} vis={vis} id={str(p.anchor)}>
      <div className="nw-founder">
        {image && (
          <div className="nw-photo nw-photo-tall nw-graded">
            {/* eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host */}
            <img src={image} alt={str(p.alt)} loading="lazy" />
          </div>
        )}
        <div>
          <Eyebrow text={str(p.eyebrow)} />
          {str(p.quote) && (
            <blockquote className="nw-founder-q">
              <InlineText text={str(p.quote)} accentStars />
            </blockquote>
          )}
          {str(p.body) && <p className="nw-body">{str(p.body)}</p>}
          {hosts.length > 0 && (
            <ul className="nw-hosts">
              {hosts.map((h) => (
                <li key={h.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host */}
                  {h.image && <img src={h.image} alt="" />}
                  <span>
                    <b>{h.name}</b>
                    {h.role && <small>{h.role}</small>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="nw-actions">
            <Btn label={str(p.ctaLabel)} href={str(p.ctaHref)} metadata={metadata} arrow />
          </div>
        </div>
      </div>
    </Section>
  )
}

// 10. Team: a group photo beside the team's words, three pillars and a closing quote.
export function NetworkTeamBlock({ p, pad, vis }: { p: Props; pad?: string; vis?: string }) {
  const image = img(p.image)
  const pillars = arr(p.pillars).map((x) => ({ title: str(x.title), body: str(x.body) })).filter((x) => x.title)
  return (
    <Section name="team" pad={pad} vis={vis} id={str(p.anchor)}>
      <div className="nw-split">
        {image && (
          <div className="nw-photo nw-graded">
            {/* eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host */}
            <img src={image} alt={str(p.alt)} loading="lazy" />
          </div>
        )}
        <div className="nw-split-copy">
          <Eyebrow text={str(p.eyebrow)} />
          <Title text={str(p.title)} />
          {str(p.lead) && <p className="nw-lead">{str(p.lead)}</p>}
          {str(p.note) && <p className="nw-small">{str(p.note)}</p>}
        </div>
      </div>
      {pillars.length > 0 && (
        <ul className="nw-pillars">
          {pillars.map((x) => (
            <li key={x.title}>
              <h3>{x.title}</h3>
              {x.body && <p>{x.body}</p>}
            </li>
          ))}
        </ul>
      )}
      {str(p.quote) && (
        <figure className="nw-quote">
          <blockquote>{str(p.quote)}</blockquote>
          {str(p.quoteBy) && <figcaption>{str(p.quoteBy)}</figcaption>}
        </figure>
      )}
    </Section>
  )
}

// 11. Tiers: three membership cards, the featured one raised in ink.
export function NetworkTiersBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const tiers = arr(p.tiers).map((t) => ({ icon: str(t.icon), name: str(t.name), price: str(t.price), cadence: str(t.cadence), tagline: str(t.tagline), features: lines(t.features), cta: str(t.ctaLabel), href: str(t.ctaHref), badge: str(t.badge), featured: t.featured === true })).filter((t) => t.name)
  if (tiers.length === 0) return null
  return (
    <Section name="tiers" pad={pad} vis={vis} id={str(p.anchor)}>
      <div className="nw-mem">
        <Head eyebrow={str(p.eyebrow)} title={str(p.title)} lead={str(p.lead)} />
        <ul className="nw-tiers">
          {tiers.map((t) => (
            <li key={t.name} className="nw-tier" data-featured={t.featured || undefined}>
              {t.badge && <span className="nw-badge">{t.badge}</span>}
              <span className="nw-tier-i"><Icon name={t.icon || 'users'} /></span>
              <h3>{t.name}</h3>
              <p className="nw-price">
                {t.price}
                {t.cadence && <small> {t.cadence}</small>}
              </p>
              {t.tagline && <p className="nw-tier-tag">{t.tagline}</p>}
              <ul className="nw-checks">
                {t.features.map((f) => (
                  <li key={f}><Check className="nw-i" strokeWidth={2} aria-hidden />{f}</li>
                ))}
              </ul>
              <Btn label={t.cta} href={t.href} kind={t.featured ? 'primary' : 'soft'} metadata={metadata} arrow={t.featured} className="nw-tier-btn" />
            </li>
          ))}
        </ul>
        {str(p.footnote) && <p className="nw-small nw-footnote">{str(p.footnote)}</p>}
      </div>
    </Section>
  )
}

// 12. Offerings: priced packages, the featured one in ink.
export function NetworkOfferingsBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const items = arr(p.items).map((t) => ({ title: str(t.title), price: str(t.price), unit: str(t.unit), body: str(t.body), cta: str(t.ctaLabel), href: str(t.ctaHref), featured: t.featured === true })).filter((t) => t.title)
  if (items.length === 0) return null
  return (
    <Section name="offerings" pad={pad} vis={vis} id={str(p.anchor)}>
      <Head eyebrow={str(p.eyebrow)} title={str(p.title)} lead={str(p.lead)} />
      <ul className="nw-offers">
        {items.map((t) => (
          <li key={t.title} className="nw-offer" data-featured={t.featured || undefined}>
            <h3>{t.title}</h3>
            <p className="nw-price">
              {t.price}
              {t.unit && <small> {t.unit}</small>}
            </p>
            {t.body && <p>{t.body}</p>}
            <Btn label={t.cta} href={t.href} kind={t.featured ? 'primary' : 'soft'} metadata={metadata} className="nw-offer-btn" />
          </li>
        ))}
      </ul>
    </Section>
  )
}

// 13. Media: the dark band of episodes (YouTube links by video id, or any link with a thumbnail).
const YT = /^[A-Za-z0-9_-]{11}$/
export function NetworkMediaBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const items = arr(p.items).map((x) => {
    const id = str(x.videoId)
    const ok = YT.test(id)
    return { title: str(x.title), href: ok ? `https://www.youtube.com/watch?v=${id}` : hrefOf(str(x.href), metadata), image: ok ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : img(x.image) }
  }).filter((x) => x.href)
  return (
    <Section name="media" pad={pad} vis={vis} band="ink" id={str(p.anchor)}>
      <Head eyebrow={str(p.eyebrow)} title={str(p.title)} lead={str(p.lead)} action={str(p.actionLabel)} actionHref={str(p.actionHref)} metadata={metadata} />
      {items.length > 0 && (
        <ul className="nw-pods">
          {items.map((x, i) => (
            <li key={i} className="nw-pod">
              <a href={x.href!} target="_blank" rel="noopener noreferrer" aria-label={x.title ? `Watch ${x.title}` : 'Watch the episode'}>
                <span className="nw-pod-im">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the episode's own thumbnail */}
                  {x.image && <img src={x.image} alt="" loading="lazy" />}
                  <span className="nw-play" aria-hidden />
                </span>
                {x.title && <b>{x.title}</b>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

// 14. Social: recent posts as captioned cards, each a link to the account.
export function NetworkSocialBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const href = hrefOf(str(p.actionHref), metadata)
  const posts = arr(p.posts).map((x) => ({ image: img(x.image), caption: str(x.caption) })).filter((x) => x.caption || x.image)
  return (
    <Section name="social" pad={pad} vis={vis} band="sand" id={str(p.anchor)}>
      <Head eyebrow={str(p.eyebrow)} title={str(p.title)} lead={str(p.lead)} action={str(p.actionLabel)} actionHref={str(p.actionHref)} metadata={metadata} />
      {posts.length > 0 && (
        <ul className="nw-posts">
          {posts.map((x, i) => {
            const body = (
              <>
                {x.image ? (
                  <span className="nw-post-im">
                    {/* eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host */}
                    <img src={x.image} alt="" loading="lazy" />
                  </span>
                ) : (
                  <span className="nw-post-mark" aria-hidden><Camera className="nw-i" strokeWidth={1.75} /></span>
                )}
                {x.caption && <p>{x.caption}</p>}
              </>
            )
            return <li key={i} className="nw-card nw-post">{href ? <a href={href} target="_blank" rel="noopener noreferrer">{body}</a> : body}</li>
          })}
        </ul>
      )}
    </Section>
  )
}

// 15. Merch: product cards with their price and a link to buy.
export function NetworkMerchBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const items = arr(p.products).map((x) => ({ image: img(x.image), title: str(x.title), note: str(x.note), price: str(x.price), href: hrefOf(str(x.href), metadata) })).filter((x) => x.title)
  if (items.length === 0) return null
  return (
    <Section name="merch" pad={pad} vis={vis} id={str(p.anchor)}>
      <Head eyebrow={str(p.eyebrow)} title={str(p.title)} lead={str(p.lead)} action={str(p.actionLabel)} actionHref={str(p.actionHref)} metadata={metadata} />
      <ul className="nw-merch">
        {items.map((x) => (
          <li key={x.title} className="nw-card nw-product">
            <span className="nw-product-im">
              {/* eslint-disable-next-line @next/next/no-img-element -- the product's own photo */}
              {x.image && <img src={x.image} alt={x.title} loading="lazy" />}
            </span>
            <span className="nw-product-b">
              <b>{x.title}</b>
              {x.note && <small>{x.note}</small>}
              {x.price && <span className="nw-product-price">{x.price}</span>}
              {x.href && <a className="hs-btn hs-btn-primary nw-product-btn" href={x.href} {...(external(x.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{str(p.buyLabel) || 'Buy'}</a>}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

// 16. Coffee: the golden-rule card (photo, a signature line, the ask) beside the ways to reach the Space.
export function NetworkCoffeeBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const image = img(p.image)
  const email = str(p.email)
  const phone = str(p.phone)
  const routes = [
    email && { icon: 'mail', label: email, href: `mailto:${email}` },
    phone && { icon: 'phone', label: phone, href: `tel:${phone.replace(/[^\d+]/g, '')}` },
    ...arr(p.links).map((l) => ({ icon: str(l.icon) || 'spark', label: str(l.label), href: hrefOf(str(l.href), metadata) ?? '' })),
  ].filter((r): r is { icon: string; label: string; href: string } => !!r && !!r.label && !!r.href)
  return (
    <Section name="coffee" pad={pad} vis={vis} band="sand" id={str(p.anchor)}>
      <div className="nw-coffee">
        <div className="nw-card nw-coffee-card">
          {image && (
            <div className="nw-photo nw-graded">
              {/* eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host */}
              <img src={image} alt={str(p.alt)} loading="lazy" />
            </div>
          )}
          {str(p.signature) && <p className="nw-hand">{str(p.signature)}</p>}
          <Title text={str(p.title)} />
          {str(p.body) && <p className="nw-body">{str(p.body)}</p>}
          <div className="nw-actions">
            <Btn label={str(p.ctaLabel)} href={str(p.ctaHref)} metadata={metadata} arrow />
          </div>
        </div>
        <div className="nw-card nw-reach">
          <Title text={str(p.reachTitle)} as="h3" />
          {str(p.reachBody) && <p className="nw-body">{str(p.reachBody)}</p>}
          <ul className="nw-routes">
            {routes.map((r) => (
              <li key={r.href}>
                <a href={r.href} {...(external(r.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                  <span className="nw-route-i"><Icon name={r.icon} /></span>
                  {r.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="nw-actions">
            <Btn label={str(p.messageLabel)} href={str(p.messageHref)} kind="soft" metadata={metadata} arrow />
          </div>
        </div>
      </div>
    </Section>
  )
}

// ── Registry ────────────────────────────────────────────────────────────────────────────────────────────

// Field labels are names, in the order the words appear on the page; the how-to lives in a `hint` under the
// label (components/page-editor/mobile/field-form.tsx). The link anchor is technical, so `block()` files it
// last, after the section's own copy and controls.
const text = (label: string, hint?: string) => ({ type: 'text', label, ...(hint ? { hint } : {}) }) as const
const area = (label: string, hint?: string) => ({ type: 'textarea', label, ...(hint ? { hint } : {}) }) as const
// The Loom picker (the one image picker an operator sees). Spread, never referenced whole: on the server a
// client module's export is a reference, and a spread of it reads as a plain `{ label }` (profile.tsx's pattern).
const image = { ...loomImageField, label: 'Photo' }
const VOICE_HINT = 'Wrap words in *stars* to set them in the accent italic.'
const anchor = text('Link anchor', 'Optional. Lets a menu item jump here, like #fridays.')
const buttons = { primaryLabel: text('Main button'), primaryHref: text('Main button link'), secondaryLabel: text('Second button'), secondaryHref: text('Second button link') }
const head = { eyebrow: text('Small label', 'The short line above the heading.'), title: area('Heading', VOICE_HINT), lead: area('Intro') }
const action = { actionLabel: text('Link beside the heading'), actionHref: text('Link beside the heading: where it goes') }

function block<P extends Props>(label: string, fields: Record<string, unknown>, defaults: P, Comp: (args: { p: Props; metadata?: Props; pad?: string; vis?: string }) => ReactNode): ComponentConfig {
  return {
    label,
    fields: (({ anchor: anchorField, ...rest }) => ({ ...rest, ...(anchorField ? { anchor: anchorField } : {}), layout: layoutField }))(fields),
    defaultProps: { ...defaults, layout: layoutDefault },
    render: (props: Props & { puck?: { metadata?: Props } }) => <Comp p={props} metadata={props.puck?.metadata} {...layoutOf(props.layout)} />,
  } as unknown as ComponentConfig
}

export const networkComponents: Record<string, ComponentConfig> = {
  NetworkHero: block('Hero with the next event', {
    ...head, ...buttons,
    image, alt: text('Photo description', 'For screen readers.'), focus: text('Photo focus point', 'Optional. Where the photo centres when cropped, like 50% 30%.'),
    crop: { type: 'select', label: 'Photo crop', options: [{ label: 'Leaf', value: 'leaf' }, { label: 'Arch', value: 'arch' }, { label: 'Soft', value: 'soft' }] },
    featureMatch: text('Pinned event', 'The next event whose title contains these words, like Feel Good Friday.'), featureNote: text('Pinned event note'), featureCta: text('Pinned event button'),
    proof: text('Social proof', 'Like 8,500+ members.'), proofNote: text('Social proof note'), faces: { type: 'array', label: 'Member faces', arrayFields: { image } },
  }, { eyebrow: 'Every week', title: 'Come find *your people.*', lead: 'No pressure. No pitch. Just good people and good conversation.', primaryLabel: 'Join a group', primaryHref: '', secondaryLabel: '', secondaryHref: '', image: '', alt: '', focus: '', crop: 'leaf', featureMatch: '', featureNote: '', featureCta: 'RSVP', proof: '', proofNote: '', faces: [] }, NetworkHeroBlock),
  NetworkStats: block('Stat tiles', { items: { type: 'array', label: 'Stats', arrayFields: { icon: iconField, value: text('Number'), label: text('Label') } } }, { items: [{ icon: 'users', value: '100+', label: 'members' }] }, NetworkStatsBlock),
  NetworkSplit: block('Photo split with facts', {
    anchor, ...head, body: area('Body text', 'Each new line starts a paragraph.'), image, alt: text('Photo description', 'For screen readers.'),
    mediaSide: { type: 'select', label: 'Photo side', options: [{ label: 'Left', value: 'left' }, { label: 'Right', value: 'right' }] },
    band: { type: 'select', label: 'Background', options: [{ label: 'Page', value: '' }, { label: 'Sand', value: 'sand' }, { label: 'Ink', value: 'ink' }] },
    facts: { type: 'array', label: 'Facts', arrayFields: { icon: iconField, label: text('Label'), value: text('Value'), note: text('Note') } },
    quote: area('Pull quote'), quoteBy: text('Quote by'), ...buttons,
  }, { anchor: '', eyebrow: '', title: '', lead: '', body: '', image: '', alt: '', mediaSide: 'left', band: '', facts: [], quote: '', quoteBy: '', primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '' }, NetworkSplitBlock),
  NetworkBand: block('Accent band with countdown', {
    anchor, eyebrow: head.eyebrow, title: head.title, body: area('Body text', 'Each new line starts a paragraph.'), countdownTo: text('Count down to', 'Local date and time, like 2026-10-21T17:30.'), timeZone: text('Time zone', 'Like America/Los_Angeles.'),
    countdownLabel: text('Countdown description', 'Read aloud by screen readers.'), image, alt: text('Photo description', 'For screen readers.'), ...buttons,
  }, { anchor: '', eyebrow: '', title: '', body: '', countdownTo: '', timeZone: 'America/Los_Angeles', countdownLabel: '', image: '', alt: '', primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '' }, NetworkBandBlock),
  NetworkEvents: block('Events list and calendar (live)', {
    anchor, ...head, ...action, max: { type: 'number', label: 'How many to list', min: 1, max: 24 },
    chapters: { type: 'array', label: 'Chapter filters', hint: 'Each becomes a filter chip over the list.', arrayFields: { label: text('Chapter'), spaceId: text('Hosting Space ID', 'Optional. Matches the event’s declared hosting Space before any title or place words.'), match: text('Matches events containing', 'Legacy match when no hosting Space mapping is available. Words in the title or place, separated by |.') } },
    moreLabel: text('More events link'), moreHref: text('More events link: where it goes'), empty: text('Message when nothing is scheduled'),
  }, { anchor: '', eyebrow: 'Events', title: 'Find a group. *Or fill one.*', lead: '', actionLabel: '', actionHref: '', max: 6, chapters: [], moreLabel: 'See more events', moreHref: '', empty: '' }, NetworkEventsBlock),
  NetworkSteps: block('Numbered steps', { anchor, ...head, steps: { type: 'array', label: 'Steps', arrayFields: { title: text('Title'), body: area('Body text'), ctaLabel: text('Button', 'Optional.'), ctaHref: text('Button link') } } }, { anchor: '', eyebrow: 'Your first visit', title: '', lead: '', steps: [] }, NetworkStepsBlock),
  NetworkChapters: block('Chapters band', {
    anchor, ...head,
    chips: { type: 'array', label: 'Chapters', arrayFields: { icon: iconField, name: text('Name'), line: text('What meets'), when: text('When'), href: text('Link'), on: { type: 'radio', label: 'Highlight', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] } } },
    cards: { type: 'array', label: 'Photo cards', arrayFields: { image, alt: text('Photo description', 'For screen readers.'), icon: iconField, kicker: text('Small label'), title: text('Title'), body: area('Body text'), href: text('Link') } },
    notes: { type: 'array', label: 'Icon cards', arrayFields: { icon: iconField, title: text('Title'), body: area('Body text') } },
  }, { anchor: '', eyebrow: 'Chapters', title: '', lead: '', chips: [], cards: [], notes: [] }, NetworkChaptersBlock),
  NetworkCircles: block('Circles (next dates live)', {
    anchor, ...head, ...action,
    circles: { type: 'array', label: 'Circles', arrayFields: { icon: iconField, title: text('Name'), body: area('Body text'), when: text('When'), where: text('Where'), circleSlug: text('Circle slug', 'The last part of its Frequency circle URL. Opens the circle even when no event is scheduled.'), match: text('Matches events titled', 'Optional. Defaults to the circle name.') } },
  }, { anchor: '', eyebrow: 'Circles', title: '', lead: '', actionLabel: '', actionHref: '', circles: [] }, NetworkCirclesBlock),
  NetworkFounder: block('Founder', {
    anchor, eyebrow: head.eyebrow, quote: area('Quote', VOICE_HINT), body: area('Body text', 'Each new line starts a paragraph.'), image, alt: text('Photo description', 'For screen readers.'),
    hosts: { type: 'array', label: 'Hosts', arrayFields: { image, name: text('Name'), role: text('Role') } }, ctaLabel: text('Button'), ctaHref: text('Button link'),
  }, { anchor: '', eyebrow: '', quote: '', body: '', image: '', alt: '', hosts: [], ctaLabel: '', ctaHref: '' }, NetworkFounderBlock),
  NetworkTeam: block('Team, pillars and a quote', {
    anchor, ...head, note: area('Note'), image, alt: text('Photo description', 'For screen readers.'),
    pillars: { type: 'array', label: 'Pillars', arrayFields: { title: text('Title'), body: area('Body text') } }, quote: area('Quote'), quoteBy: text('Quote by'),
  }, { anchor: '', eyebrow: '', title: '', lead: '', note: '', image: '', alt: '', pillars: [], quote: '', quoteBy: '' }, NetworkTeamBlock),
  NetworkTiers: block('Membership tiers', {
    anchor, ...head,
    tiers: { type: 'array', label: 'Tiers', arrayFields: { icon: iconField, name: text('Name'), price: text('Price'), cadence: text('Billing period', 'Like / mo.'), tagline: text('Tagline'), features: area('Features', 'One per line.'), ctaLabel: text('Button'), ctaHref: text('Button link'), badge: text('Badge', 'Optional, like Most members.'), featured: { type: 'radio', label: 'Featured', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] } } },
    footnote: text('Footnote'),
  }, { anchor: '', eyebrow: 'Membership', title: '', lead: '', tiers: [], footnote: '' }, NetworkTiersBlock),
  NetworkOfferings: block('Priced offerings', {
    anchor, ...head,
    items: { type: 'array', label: 'Offerings', arrayFields: { title: text('Title'), price: text('Price'), unit: text('Unit', 'Like / hour.'), body: area('Body text'), ctaLabel: text('Button'), ctaHref: text('Button link'), featured: { type: 'radio', label: 'Featured', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] } } },
  }, { anchor: '', eyebrow: '', title: '', lead: '', items: [] }, NetworkOfferingsBlock),
  NetworkMedia: block('Media band (episodes)', {
    anchor, ...head, ...action, items: { type: 'array', label: 'Episodes', arrayFields: { title: text('Title'), videoId: text('YouTube video', 'The id after watch?v=, like mGOSomOf9E4.'), href: text('Or a link instead'), image } },
  }, { anchor: '', eyebrow: '', title: '', lead: '', actionLabel: '', actionHref: '', items: [] }, NetworkMediaBlock),
  NetworkSocial: block('Social posts', { anchor, ...head, ...action, posts: { type: 'array', label: 'Posts', arrayFields: { image, caption: area('Caption') } } }, { anchor: '', eyebrow: '', title: '', lead: '', actionLabel: '', actionHref: '', posts: [] }, NetworkSocialBlock),
  NetworkMerch: block('Merch cards', {
    anchor, ...head, ...action, buyLabel: text('Card button label'), products: { type: 'array', label: 'Products', arrayFields: { image, title: text('Name'), note: text('Note'), price: text('Price'), href: text('Link') } },
  }, { anchor: '', eyebrow: '', title: '', lead: '', actionLabel: '', actionHref: '', buyLabel: 'Buy', products: [] }, NetworkMerchBlock),
  NetworkCoffee: block('Coffee card and ways to reach you', {
    anchor, signature: text('Signature line', 'Set in the handwritten face.'), title: area('Heading', VOICE_HINT), body: area('Body text'), ctaLabel: text('Button'), ctaHref: text('Button link'), image, alt: text('Photo description', 'For screen readers.'),
    reachTitle: text('Contact heading'), reachBody: area('Contact text'), email: text('Email'), phone: text('Phone'),
    links: { type: 'array', label: 'Other links', arrayFields: { icon: iconField, label: text('Label'), href: text('Link') } }, messageLabel: text('Message button'), messageHref: text('Message link'),
  }, { anchor: '', image: '', alt: '', signature: '', title: '', body: '', ctaLabel: '', ctaHref: '', reachTitle: 'Get in touch', reachBody: '', email: '', phone: '', links: [], messageLabel: 'Send a message', messageHref: '' }, NetworkCoffeeBlock),
}

export const NETWORK_CATEGORY_COMPONENTS = Object.keys(networkComponents)
