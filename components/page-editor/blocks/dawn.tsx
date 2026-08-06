// DAWN 2 marketing block library — the screen-pass compositions as reusable,
// general-purpose page-editor blocks (owner directive: every marketing page is
// Puck + our custom blocks, styled to the DAWN reference).
//
// Keys:  PhotoBeat | PhotoTrio | StoryBeats | ValueBand | BuildTimeline |
//        PhotoCardRow | PlanBand | PillarNav | DawnHowToSteps
// Categories: Media (PhotoBeat, PhotoTrio, PhotoCardRow) · Content (StoryBeats)
//             · Sections (ValueBand, BuildTimeline, PlanBand, PillarNav,
//               DawnHowToSteps)
//
// Every block WRAPS the marketing kit (components/marketing/marketing-ui.tsx:
// PhotoBeat, PhotoTrio, Section, SectionHeading, Lead, Body, Card, PillarNav)
// rather than duplicating its markup, and follows the frozen kit contract
// (fields → defaultProps → render). The plan-card lockup in PlanBand mirrors the
// page-local card on app/(marketing)/pricing/page.tsx (the kit carries no on-ink
// card/CTA yet — promote it there when a third surface needs it). DAWN semantic
// tokens only; copy defaults come from the rebuilt coded pages and obey
// docs/NAMING.md + docs/CONTENT-VOICE.md (no em dashes, sentence case, honest at
// day zero).

import Link from 'next/link'
import {
  Compass,
  Users,
  HandHeart,
  Home,
  Heart,
  Shield,
  Sparkles,
  Flame,
  Sun,
  Leaf,
  Coffee,
  Handshake,
  MapPin,
  Star,
  Zap,
  Gem,
  Trophy,
  Repeat,
  DoorOpen,
  CalendarDays,
  LineChart,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  PhotoBeat,
  PhotoTrio,
  Section,
  SectionHeading,
  Lead,
  Body,
  Card,
  PillarNav,
} from '@/components/marketing/marketing-ui'
import { SiteImage } from '@/components/marketing/site-image'
import { Reveal } from '@/components/marketing/motion'
import { JsonLd } from '@/components/json-ld'
import { productSchema, howToSchema } from '@/lib/jsonld'
import { richParagraphs, richPlainText, safeHref } from '@/lib/page-editor/richtext'
import { focalField, focalClass } from '@/lib/page-editor/image-controls'
import { imgField } from '@/lib/page-editor/fields'
import type { LivePricing } from '@/lib/page-editor/live-pricing'
import {
  accentize,
  toneField,
  layoutField,
  layoutDefault,
  padClass,
  visClass,
  isInk,
  type LayoutValue,
  type ComponentConfig,
} from './kit'

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

type SectionTone = 'surface' | 'canvas' | 'ink'

// The marketing `Section` paints three tones; the editor's fourth ('none') maps
// to the plain white surface.
function sectionTone(tone?: string): SectionTone {
  return tone === 'canvas' || tone === 'ink' ? tone : 'surface'
}

// Icon chips for the value cards — a curated lucide set, DAWN-toned by the card.
// The first fourteen carry the community/principles register (About, The Lab); the
// trailing seven were added when The Quest (the game's currencies and keepsakes) and
// Spaces (the operator's front door, calendar, and growth) needed a vocabulary the
// original set could not name. Curated, not open-ended: an editor picks from this list.
const VALUE_ICONS: Record<string, LucideIcon> = {
  Compass,
  Users,
  HandHeart,
  Home,
  Heart,
  Shield,
  Sparkles,
  Flame,
  Sun,
  Leaf,
  Coffee,
  Handshake,
  MapPin,
  Star,
  Zap,
  Gem,
  Trophy,
  Repeat,
  DoorOpen,
  CalendarDays,
  LineChart,
}
const valueIconField = {
  type: 'select' as const,
  label: 'Icon',
  options: Object.keys(VALUE_ICONS).map((name) => ({ label: name, value: name })),
}

const GRID_COLS: Record<string, string> = {
  '2': 'sm:grid-cols-2',
  '3': 'sm:grid-cols-3',
  '4': 'sm:grid-cols-2 lg:grid-cols-4',
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PhotoBeat — a full-bleed photograph carrying one sentence (wraps kit PhotoBeat)
// ─────────────────────────────────────────────────────────────────────────────

export function PhotoBeatBlock({
  image,
  alt,
  eyebrow,
  line,
  lineAccent,
  note,
  focal,
  vis,
}: {
  image?: string
  alt?: string
  eyebrow?: string
  line?: string
  lineAccent?: string
  note?: string
  focal?: string
  vis?: string
}) {
  return (
    <div className={vis ?? ''}>
      <PhotoBeat
        image={image || '/images/site/adult-playground-parachute.jpg'}
        alt={alt ?? ''}
        eyebrow={eyebrow || undefined}
        // PhotoBeat lays its copy on an ink gradient (--color-ink at 82%), so the
        // accent word keeps the brand amber wherever the block is placed.
        line={accentize(line, lineAccent, true)}
        note={note || undefined}
        focal={focalClass(focal)}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PhotoTrio — the framed figure row, with the optional arc shoulder + dot grid
// ─────────────────────────────────────────────────────────────────────────────

type TrioItem = { image?: string; alt?: string; title?: string; caption?: string }

export function PhotoTrioBlock({
  eyebrow,
  title,
  titleAccent,
  kicker,
  intro,
  items,
  footnote,
  tone,
  shape,
  texture,
  pad,
  vis,
}: {
  eyebrow?: string
  title?: string
  titleAccent?: string
  kicker?: string
  intro?: string
  items?: TrioItem[]
  footnote?: string
  tone?: string
  /** 'arc' rises the band out of the section above on the DAWN arc shoulder. */
  shape?: 'flat' | 'arc'
  /** 'dots' lays the schematic dot-grid texture behind the figures. */
  texture?: 'none' | 'dots'
  pad?: string
  vis?: string
}) {
  const t = sectionTone(tone)
  const ink = t === 'ink'
  const figures = (items ?? [])
    .filter((i) => i.image)
    .map((i) => ({ img: i.image!, alt: i.alt ?? '', title: i.title ?? '', caption: i.caption ?? '' }))
  const chrome = [
    shape === 'arc' ? 'arc-top mk-arc -mt-px' : '',
    texture === 'dots' ? 'dot-grid' : '',
    'relative overflow-hidden',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <Section tone={t} width="wide" className={chrome} pad={pad} vis={vis}>
      <div className="relative z-10">
        {(eyebrow || title || kicker) && (
          <SectionHeading
            tone={ink ? 'ink' : 'light'}
            align="center"
            eyebrow={eyebrow || undefined}
            title={accentize(title, titleAccent, ink)}
            kicker={kicker || undefined}
          />
        )}
        {intro && (
          <div
            className={`mx-auto max-w-2xl text-center text-body-lg leading-relaxed [&>p+p]:mt-4 ${
              ink ? 'text-on-ink-muted' : 'text-muted'
            }`}
          >
            {richParagraphs(intro)}
          </div>
        )}
        {figures.length > 0 && <PhotoTrio items={figures} />}
        {footnote && (
          <Reveal>
            <div
              className={`mx-auto mt-9 max-w-2xl text-center text-body leading-relaxed [&_a]:font-semibold [&_a]:no-underline hover:[&_a]:underline ${
                ink ? 'text-on-ink-muted' : 'text-muted'
              }`}
            >
              {richParagraphs(footnote)}
            </div>
          </Reveal>
        )}
      </div>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. StoryBeats — display heading + prose on the reading measure, beats separated
//    by the warm hairline (prose deserves a rule, not a box — DAWN about.html)
// ─────────────────────────────────────────────────────────────────────────────

type StoryBeat = { title?: string; body?: string }

export function StoryBeatsBlock({
  eyebrow,
  kicker,
  items,
  tone,
  flow,
  pad,
  vis,
}: {
  /** Eyebrow + kicker dress the FIRST beat only (the movement's opening). */
  eyebrow?: string
  kicker?: string
  items?: StoryBeat[]
  tone?: string
  /** 'cont' continues the band above at the same tone (no top padding). */
  flow?: 'beat' | 'cont'
  pad?: string
  vis?: string
}) {
  const t = sectionTone(tone)
  const beats = (items ?? []).filter((b) => b.title || b.body)
  return (
    <Section tone={t} role={flow === 'cont' ? 'cont' : 'beat'} pad={pad} vis={vis}>
      {beats.map((beat, i) => (
        <Reveal key={i}>
          {/* .rule-amber is unlayered CSS carrying margin: 0, so it would beat a my-*
              utility; the rhythm lives on this wrapper instead. */}
          {i > 0 && (
            <div className="my-10">
              <hr className="rule-amber" />
            </div>
          )}
          {beat.title && (
            <SectionHeading
              eyebrow={i === 0 ? eyebrow || undefined : undefined}
              title={beat.title}
              kicker={i === 0 ? kicker || undefined : undefined}
            />
          )}
          {(beat.body ?? '')
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p, j) => (i === 0 && j === 0 ? <Lead key={j}>{p}</Lead> : <Body key={j}>{p}</Body>))}
        </Reveal>
      ))}
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ValueBand — the ink principles band: icon-chip cards with the sheen pass
// ─────────────────────────────────────────────────────────────────────────────

type ValueItem = { icon?: string; title?: string; body?: string }

export function ValueBandBlock({
  eyebrow,
  title,
  titleAccent,
  kicker,
  columns,
  items,
  pad,
  vis,
}: {
  eyebrow?: string
  title?: string
  titleAccent?: string
  kicker?: string
  columns?: string
  items?: ValueItem[]
  pad?: string
  vis?: string
}) {
  const cols = columns === '3' ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'
  return (
    <Section tone="ink" width="wide" className="spot relative overflow-hidden" pad={pad} vis={vis}>
      <div className="relative z-10">
        {(eyebrow || title || kicker) && (
          <SectionHeading
            tone="ink"
            align="center"
            eyebrow={eyebrow || undefined}
            title={accentize(title, titleAccent, true)}
            kicker={kicker || undefined}
          />
        )}
        <div className={`stagger mt-10 grid gap-4 ${cols}`}>
          {(items ?? []).map((item, i) => {
            const Icon = VALUE_ICONS[item.icon ?? ''] ?? Compass
            return (
              <Reveal
                as="article"
                key={i}
                className="sheen rounded-card border border-on-ink/10 bg-on-ink/5 p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-primary/20 text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="text-body-lg font-bold text-on-ink">{item.title}</h3>
                </div>
                {item.body && (
                  <p className="mt-3 text-body leading-relaxed text-on-ink-muted">{item.body}</p>
                )}
              </Reveal>
            )
          })}
        </div>
      </div>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. BuildTimeline — numbered / dated milestone cards (big display numeral over a
//    surface card; the one CHOSEN card wears the highlight tone). Covers both the
//    "what we hand you" asks (01/02/03) and the Now → 2027 → 2028 build plan.
// ─────────────────────────────────────────────────────────────────────────────

type TimelineItem = {
  label?: string
  title?: string
  /** Short qualifier riding the title (e.g. "One Journey done"). Optional; omitted renders nothing. */
  tag?: string
  body?: string
  highlight?: 'normal' | 'chosen'
}

export function BuildTimelineBlock({
  eyebrow,
  title,
  titleAccent,
  kicker,
  intro,
  items,
  footnote,
  tone,
  texture,
  flow,
  pad,
  vis,
}: {
  eyebrow?: string
  title?: string
  titleAccent?: string
  kicker?: string
  /** Optional lead paragraph under the heading, on the reading measure. */
  intro?: string
  items?: TimelineItem[]
  /** Renders under the warm rule — the honest fine print of a plan. */
  footnote?: string
  tone?: string
  texture?: 'none' | 'dots'
  /** 'soft' opens with half the beat's top padding (the mk-cont-soft rhythm). */
  flow?: 'beat' | 'soft'
  pad?: string
  vis?: string
}) {
  const t = sectionTone(tone)
  const shown = (items ?? []).filter((i) => i.label || i.title || i.body)
  const cols = GRID_COLS[String(Math.min(Math.max(shown.length, 2), 4))] ?? GRID_COLS['3']
  // Numeral color, per the DAWN reference pair: in a set with NO chosen card the
  // numerals carry the accent (about's 01/02/03); in a set WITH one, only the
  // chosen card's numeral does (the-lab's Now/2027/2028).
  const hasChosen = shown.some((i) => i.highlight === 'chosen')
  const chrome = texture === 'dots' ? 'dot-grid relative overflow-hidden' : ''
  return (
    <Section
      tone={t}
      width="wide"
      className={chrome}
      pad={pad}
      role={flow === 'soft' ? 'cont-soft' : undefined}
      vis={vis}
    >
      <div className="relative z-10">
        {(eyebrow || title || kicker) && (
          <SectionHeading
            // This heading alone never received a tone, unlike the four identical
            // SectionHeadings elsewhere in this file, so an operator who set the
            // band to ink got warm text on slat. It follows the band now.
            tone={t === 'ink' ? 'ink' : 'light'}
            align="center"
            eyebrow={eyebrow || undefined}
            title={accentize(title, titleAccent, t === 'ink')}
            kicker={kicker || undefined}
          />
        )}
        {intro && (
          <div className="mx-auto max-w-2xl text-center text-body-lg leading-relaxed text-muted [&>p+p]:mt-4">
            {richParagraphs(intro)}
          </div>
        )}
        <div className={`stagger mt-10 grid gap-5 ${cols}`}>
          {shown.map((item, i) => {
            const chosen = item.highlight === 'chosen'
            return (
              <Reveal key={i}>
                <Card tone={chosen ? 'highlight' : 'feature'} className="lift-2 h-full">
                  <span
                    className={`font-display text-4xl leading-none sm:text-5xl ${
                      chosen || !hasChosen ? 'text-primary-strong' : 'text-text'
                    }`}
                  >
                    {item.label || String(i + 1).padStart(2, '0')}
                  </span>
                  {(item.title || item.tag) && (
                    <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      {item.title && <h3 className="text-body-lg font-bold text-text">{item.title}</h3>}
                      {item.tag && (
                        <span className="text-3xs font-bold uppercase tracking-widest text-primary-strong">
                          {item.tag}
                        </span>
                      )}
                    </div>
                  )}
                  {item.body && (
                    <p className="mt-2 text-body leading-relaxed text-muted">{item.body}</p>
                  )}
                </Card>
              </Reveal>
            )
          })}
        </div>
        {footnote && (
          <div className="mx-auto mt-10 max-w-2xl">
            <hr className="rule-amber" />
            <p className="mt-6 text-center text-body-sm leading-relaxed text-subtle">{footnote}</p>
          </div>
        )}
      </div>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. PhotoCardRow — numbered photo panels with an honesty overline (the DAWN
//    "Reference, not our room" grammar). Ink band by default with the spot wash.
// ─────────────────────────────────────────────────────────────────────────────

type PhotoCard = { image?: string; alt?: string; label?: string; title?: string; body?: string }

export function PhotoCardRowBlock({
  eyebrow,
  title,
  titleAccent,
  kicker,
  tag,
  items,
  tone,
  pad,
  vis,
}: {
  eyebrow?: string
  title?: string
  titleAccent?: string
  kicker?: string
  /** The overline on every card (e.g. "Reference, not our room"). Keeps concept photography honest. */
  tag?: string
  items?: PhotoCard[]
  tone?: string
  pad?: string
  vis?: string
}) {
  const t = sectionTone(tone)
  const ink = t === 'ink'
  const shown = (items ?? []).filter((i) => i.image || i.title)
  const cols = GRID_COLS[String(Math.min(Math.max(shown.length, 2), 4))] ?? GRID_COLS['3']
  return (
    <Section
      tone={t}
      width="wide"
      className={ink ? 'spot relative overflow-hidden' : 'relative overflow-hidden'}
      pad={pad}
      vis={vis}
    >
      <div className="relative z-10">
        {(eyebrow || title || kicker) && (
          <SectionHeading
            tone={ink ? 'ink' : 'light'}
            align="center"
            eyebrow={eyebrow || undefined}
            title={accentize(title, titleAccent, ink)}
            kicker={kicker || undefined}
          />
        )}
        <div className={`stagger grid gap-5 ${cols}`}>
          {shown.map((card, i) => (
            <Reveal
              as="article"
              key={i}
              className={`lift-2 h-full overflow-hidden rounded-card border ${
                ink ? 'border-on-ink/10 bg-on-ink/5' : 'border-border bg-surface'
              }`}
            >
              <div className="relative">
                <SiteImage
                  src={card.image || '/images/site/lab-concept.jpg'}
                  alt={card.alt ?? ''}
                  aspect="16/10"
                  sizes="(min-width: 640px) 22rem, 100vw"
                />
                <span
                  aria-hidden
                  className="absolute -bottom-4 left-5 flex h-9 w-9 items-center justify-center rounded-pill bg-primary font-display text-body-sm text-on-primary"
                >
                  {card.label || String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <div className="p-6 pt-8">
                {tag && (
                  <p
                    className={`text-3xs font-bold uppercase tracking-widest ${
                      ink ? 'text-on-ink-subtle' : 'text-subtle'
                    }`}
                  >
                    {tag}
                  </p>
                )}
                {card.title && (
                  <h3
                    className={`mt-2 font-display uppercase text-page-title ${ink ? 'text-on-ink' : 'text-text'}`}
                  >
                    {card.title}
                  </h3>
                )}
                {card.body && (
                  <p
                    className={`mt-2 text-body leading-relaxed ${
                      ink ? 'text-on-ink-muted' : 'text-muted'
                    }`}
                  >
                    {card.body}
                  </p>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. PlanBand — the DAWN two-band plan cards. Figures BIND to the live pricing
//    config (ADR-918: a janitor edits the words, the numbers stay derived); the
//    typed price fields are the fail-safe that renders only when the binding
//    cannot resolve. Optionally emits Product/Offer JSON-LD from the resolved
//    live figures so a published page keeps its price schema.
// ─────────────────────────────────────────────────────────────────────────────

type PlanItem = {
  /** Offering id to bind (member, crew, free, business, collective, nonprofit, independent). */
  livePriceKey?: string
  name?: string
  tagline?: string
  price?: string
  strikePrice?: string
  yearly?: string
  billing?: string
  trial?: string
  forWho?: string
  /** Fallback rate sentence ("<your own>, <the network's>") when unbound. */
  rate?: string
  featured?: 'normal' | 'featured'
  ctaLabel?: string
  ctaHref?: string
}

type ResolvedPlan = {
  name: string
  tagline?: string
  price: string
  strikePrice?: string
  yearly?: string
  billing?: string
  trial?: string
  forWho?: string
  rate?: string
  featured: boolean
  ctaLabel?: string
  ctaHref?: string
  monthlyCents?: number
}

function resolvePlan(raw: PlanItem, live?: LivePricing): ResolvedPlan {
  const bound = raw.livePriceKey ? live?.[raw.livePriceKey] : undefined
  return {
    name: raw.name || bound?.label || '',
    tagline: raw.tagline || undefined,
    // Fail-safe in the editorial direction: the typed text renders when a key
    // does not resolve, so a config read failure softens the page, never blanks it.
    price: bound?.price ?? raw.price ?? '',
    strikePrice: (bound ? (bound.strikePrice ?? undefined) : raw.strikePrice) || undefined,
    yearly: (bound ? (bound.yearly ?? undefined) : raw.yearly) || undefined,
    billing: raw.billing || undefined,
    trial: raw.trial || undefined,
    forWho: raw.forWho || undefined,
    rate: (bound?.takeRate ?? raw.rate) || undefined,
    featured: raw.featured === 'featured',
    ctaLabel: raw.ctaLabel || undefined,
    ctaHref: raw.ctaHref || undefined,
    monthlyCents: bound?.monthlyCents,
  }
}

/** The rate line: the lead promise carries the weight, the network half stays quiet
 *  beside it (same "<own>, <network>" split the coded /pricing page reads). */
function PlanRateLine({ rate, ink }: { rate?: string; ink: boolean }) {
  if (!rate) return null
  const [own, ...rest] = rate.split(', ')
  const network = rest.join(', ')
  return (
    <p
      className={`mt-4 border-t pt-3 text-body-sm leading-relaxed ${
        ink ? 'border-on-ink/10' : 'border-border'
      }`}
    >
      <span className={`font-semibold ${ink ? 'text-on-ink' : 'text-text'}`}>{own}</span>
      {network && <span className={ink ? 'text-on-ink-subtle' : 'text-subtle'}>, {network}</span>}
    </p>
  )
}

/** The single-figure price lockup: struck list anchor + "Beta price" tag when the
 *  offering genuinely carries one, the monthly headline, the yearly beside it. */
function PlanPrice({ plan, ink }: { plan: ResolvedPlan; ink: boolean }) {
  const long = plan.price.length > 8
  const size = plan.featured
    ? long
      ? 'text-3xl sm:text-4xl'
      : 'text-5xl sm:text-6xl'
    : long
      ? 'text-3xl'
      : 'text-4xl'
  return (
    <div className="mt-4">
      {plan.strikePrice && (
        <span className="flex items-baseline gap-2">
          <span className={`text-body-sm line-through ${ink ? 'text-on-ink-subtle' : 'text-subtle'}`}>
            {plan.strikePrice}/mo
          </span>
          <span
            className={`text-3xs font-black uppercase tracking-wider ${
              ink ? 'text-primary' : 'text-primary-strong'
            }`}
          >
            Beta price
          </span>
        </span>
      )}
      <span
        className={`mt-1 block font-display leading-none ${size} ${ink ? 'text-on-ink' : 'text-text'}`}
      >
        {plan.price}
      </span>
      {plan.yearly && (
        <span className={`mt-1.5 block text-body-sm ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>
          or {plan.yearly}
        </span>
      )}
    </div>
  )
}

function PlanCta({ plan, ink }: { plan: ResolvedPlan; ink: boolean }) {
  if (!plan.ctaLabel || !plan.ctaHref) return null
  const href = safeHref(plan.ctaHref) ?? '#'
  if (plan.featured) {
    return (
      <Link
        href={href}
        className="text-emboss mt-5 inline-flex w-full items-center justify-center gap-2 rounded-control bg-primary px-8 py-3.5 text-body font-bold text-on-primary shadow-pop transition-colors hover:bg-primary-hover"
      >
        {plan.ctaLabel}
      </Link>
    )
  }
  return (
    <Link
      href={href}
      className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-control px-8 py-3.5 text-body font-bold transition-colors ${
        ink
          ? 'border border-on-ink/20 bg-on-ink/10 text-on-ink hover:bg-on-ink/15'
          : 'border border-border bg-surface text-text hover:bg-surface-elevated'
      }`}
    >
      {plan.ctaLabel}
    </Link>
  )
}

/** One plan card. `featured` is the row's floating middle card (lift-2, primary
 *  border, the badge, taller via the negative block margin). */
function PlanCard({ plan, ink }: { plan: ResolvedPlan; ink: boolean }) {
  const shell = plan.featured
    ? `lift-2 border-2 border-primary p-7 sm:p-8 lg:-my-4 ${
        ink ? 'bg-on-ink/5' : 'bg-surface ring-4 ring-primary-bg'
      }`
    : `lift-1 border p-6 ${ink ? 'border-on-ink/10 bg-on-ink/5' : 'border-border bg-surface'}`
  return (
    <Reveal as="article" className={`relative flex flex-col rounded-card ${shell}`}>
      {plan.featured && (
        <span className="absolute -top-3 left-6 rounded-md bg-primary px-2 py-0.5 text-3xs font-black uppercase tracking-wider text-on-primary">
          Most chosen
        </span>
      )}
      <h3
        className={`font-display uppercase ${plan.featured ? 'text-3xl' : 'text-page-title'} ${
          ink ? 'text-on-ink' : 'text-text'
        }`}
      >
        {plan.name}
      </h3>
      {plan.tagline && (
        <p className={`mt-1 text-body-sm font-semibold ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>
          {plan.tagline}
        </p>
      )}
      <PlanPrice plan={plan} ink={ink} />
      {plan.billing && (
        <p className={`mt-3 text-body-sm ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>{plan.billing}</p>
      )}
      {plan.trial && (
        <p className={`mt-1 text-body-sm font-semibold ${ink ? 'text-on-ink' : 'text-text'}`}>
          {plan.trial}
        </p>
      )}
      {plan.forWho && (
        <p className={`mt-3 flex-1 text-body-sm leading-relaxed ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>
          {plan.forWho}
        </p>
      )}
      <PlanRateLine rate={plan.rate} ink={ink} />
      <PlanCta plan={plan} ink={ink} />
    </Reveal>
  )
}

/** The quiet full-width strip under a row (the reference hands Independent one line). */
function PlanStrip({ plan, ink }: { plan: ResolvedPlan; ink: boolean }) {
  return (
    <Reveal
      as="article"
      className={`lift-1 mt-8 flex flex-col gap-5 rounded-card border p-6 sm:flex-row sm:items-center sm:justify-between ${
        ink ? 'border-on-ink/10 bg-on-ink/5' : 'border-border bg-surface'
      }`}
    >
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className={`font-display uppercase text-page-title ${ink ? 'text-on-ink' : 'text-text'}`}>
            {plan.name}
          </h3>
          <span className={`font-display text-lead ${ink ? 'text-primary' : 'text-primary-strong'}`}>
            {plan.price}
          </span>
          {plan.yearly && (
            <span className={`text-body-sm ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>
              or {plan.yearly}
            </span>
          )}
        </div>
        {plan.tagline && (
          <p className={`mt-1 text-body-sm font-semibold ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>
            {plan.tagline}
          </p>
        )}
        {plan.forWho && (
          <p
            className={`mt-2 max-w-2xl text-body-sm leading-relaxed ${
              ink ? 'text-on-ink-muted' : 'text-muted'
            }`}
          >
            {plan.forWho}
          </p>
        )}
        {plan.rate && (
          <p className={`mt-2 text-body-sm ${ink ? 'text-on-ink-subtle' : 'text-subtle'}`}>{plan.rate}</p>
        )}
      </div>
      {plan.ctaLabel && plan.ctaHref && (
        <div className="shrink-0">
          <Link
            href={safeHref(plan.ctaHref) ?? '#'}
            className={`inline-flex items-center justify-center gap-2 rounded-control px-8 py-3.5 text-body font-bold transition-colors ${
              ink
                ? 'border border-on-ink/20 bg-on-ink/10 text-on-ink hover:bg-on-ink/15'
                : 'border border-border bg-surface text-text hover:bg-surface-elevated'
            }`}
          >
            {plan.ctaLabel}
          </Link>
        </div>
      )}
    </Reveal>
  )
}

export function PlanBandBlock({
  eyebrow,
  title,
  titleAccent,
  kicker,
  plans,
  strip,
  footnote,
  tone,
  priceSchema,
  schemaPath,
  livePricing,
  pad,
  vis,
}: {
  eyebrow?: string
  title?: string
  titleAccent?: string
  kicker?: string
  plans?: PlanItem[]
  strip?: PlanItem[]
  footnote?: string
  tone?: string
  priceSchema?: 'on' | 'off'
  schemaPath?: string
  livePricing?: LivePricing
  pad?: string
  vis?: string
}) {
  const t = sectionTone(tone)
  const ink = t === 'ink'
  const row = (plans ?? []).slice(0, 3).map((p) => resolvePlan(p, livePricing))
  const strips = (strip ?? []).map((p) => resolvePlan(p, livePricing))
  // The reference silhouette: the middle card floats wider (1.2fr) when the row is
  // a full trio; shorter rows fall back to an even grid.
  const grid =
    row.length === 3
      ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]'
      : row.length === 2
        ? 'sm:grid-cols-2'
        : ''
  // Product/Offer JSON-LD from the RESOLVED live figures (bound, paid plans only —
  // a $0 Product reads as spam to answer engines). Off by default: routes like
  // /pricing already hoist page-level price schema on both branches; switch this on
  // when the block is the page's only price surface.
  const schema =
    priceSchema === 'on'
      ? [...row, ...strips]
          .filter((p) => typeof p.monthlyCents === 'number' && p.monthlyCents! > 0)
          .map((p) =>
            productSchema({
              title: `Frequency ${p.name}`,
              description: p.forWho ?? p.tagline ?? null,
              priceCents: p.monthlyCents,
              currency: 'usd',
              billingPeriodCode: 'MON',
              path: schemaPath || '/pricing',
              sellerName: 'Frequency',
            }),
          )
      : []
  return (
    <Section
      tone={t}
      width="wide"
      className={ink ? 'spot relative overflow-hidden' : ''}
      pad={pad}
      vis={vis}
    >
      <div className="relative z-10">
        {schema.length > 0 && <JsonLd data={schema} />}
        {(eyebrow || title || kicker) && (
          <SectionHeading
            tone={ink ? 'ink' : 'light'}
            align="center"
            eyebrow={eyebrow || undefined}
            title={accentize(title, titleAccent, ink)}
            kicker={kicker || undefined}
          />
        )}
        {row.length > 0 && (
          <div className={`stagger grid items-center gap-5 ${grid}`}>
            {row.map((plan, i) => (
              <PlanCard key={i} plan={plan} ink={ink} />
            ))}
          </div>
        )}
        {strips.map((plan, i) => (
          <PlanStrip key={i} plan={plan} ink={ink} />
        ))}
        {footnote && (
          <p
            className={`mx-auto mt-10 max-w-2xl text-center text-body leading-relaxed ${
              ink ? 'text-on-ink-muted' : 'text-muted'
            }`}
          >
            {footnote}
          </p>
        )}
      </div>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. DawnHowToSteps — an ordered how-to that OWNS its structured data.
//
//    The block emits schema.org/HowTo from ITS OWN fields, exactly the way the
//    Accordion block emits FAQPage from its own Q/A pairs (blocks/collections.tsx):
//    same <JsonLd> component (so the same `<` escaping guard), same placement (the
//    first child of the block's root, before any visible markup), and the same
//    fail-closed rule — a node is emitted only when the data is genuinely valid,
//    never a half-formed one, because an answer engine silently discards a
//    malformed node and we would have paid the SEO cost for nothing.
//
//    Validity, per Google's HowTo requirements:
//      • `name` is required, and at least one step with BOTH a name and text.
//      • Every step is a HowToStep with a position, so the order is machine-read.
//      • `totalTime` is emitted ONLY if it parses as an ISO 8601 duration — a
//        janitor typing "about 30 minutes" must not poison the node.
//      • Schema text is plain (markdown stripped) so the structured data mirrors
//        the visible copy word for word.
//    This is the gating dependency for converting the seeker articles: those pages
//    are the highest-intent SEO surface, and converting them without HowTo would be
//    a net loss (UX-MATURITY-PLAN Lift 5d).
// ─────────────────────────────────────────────────────────────────────────────

type HowToStepItem = { name?: string; text?: string; image?: string; alt?: string }

// ISO 8601 duration, the only form schema.org accepts for totalTime (e.g. PT30M,
// PT1H30M, P2D). Anything else is dropped rather than emitted invalid.
const ISO_8601_DURATION = /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/

/** The block's structured data, or `null` when the fields cannot make a valid HowTo.
 *  Pure and exported so the schema contract is unit-testable without a render. */
export function howToStepsSchema({
  name,
  intro,
  totalTime,
  steps,
}: {
  name?: string
  intro?: string
  totalTime?: string
  steps?: HowToStepItem[]
}): object | null {
  const guide = (name ?? '').trim()
  // Only well-formed steps qualify (Google requires a name AND text on each), and
  // markdown is stripped so the schema matches the rendered sentence.
  const valid = (steps ?? [])
    .map((s) => ({ name: (s.name ?? '').trim(), text: richPlainText(s.text).trim(), image: s.image }))
    .filter((s) => s.name && s.text)
  if (!guide || valid.length === 0) return null
  const lead = richPlainText(intro).trim()
  const duration = (totalTime ?? '').trim()
  const firstImage = valid.find((s) => s.image)?.image
  return howToSchema({
    name: guide,
    description: lead || null,
    image: firstImage || null,
    totalTime: ISO_8601_DURATION.test(duration) ? duration : null,
    steps: valid.map((s) => ({ name: s.name, text: s.text })),
  })
}

export function DawnHowToStepsBlock({
  eyebrow,
  name,
  nameAccent,
  kicker,
  intro,
  totalTime,
  totalTimeLabel,
  steps,
  tone,
  pad,
  vis,
}: {
  eyebrow?: string
  /** The guide's name: the visible heading AND the HowTo `name`. */
  name?: string
  nameAccent?: string
  kicker?: string
  /** Lead paragraph under the heading; also the HowTo `description`. */
  intro?: string
  /** ISO 8601 duration for the whole guide (e.g. PT30M). Schema only. */
  totalTime?: string
  /** How the time reads to a human (e.g. "About 30 minutes"). Visible only. */
  totalTimeLabel?: string
  steps?: HowToStepItem[]
  tone?: string
  pad?: string
  vis?: string
}) {
  const t = sectionTone(tone)
  const ink = t === 'ink'
  const shown = (steps ?? []).filter((s) => s.name || s.text)
  const schema = howToStepsSchema({ name, intro, totalTime, steps })
  return (
    <Section
      tone={t}
      className={ink ? 'spot relative overflow-hidden' : ''}
      pad={pad}
      vis={vis}
    >
      {/* Placed first, exactly like the Accordion's FAQPage node, so the structured
          data travels with the block whichever surface renders the document. */}
      {schema && <JsonLd data={schema} />}
      <div className="relative z-10">
        {(eyebrow || name || kicker) && (
          <SectionHeading
            tone={ink ? 'ink' : 'light'}
            eyebrow={eyebrow || undefined}
            title={accentize(name, nameAccent, ink)}
            kicker={kicker || undefined}
          />
        )}
        {intro && (
          <div
            className={`text-body-lg leading-relaxed [&>p+p]:mt-4 ${ink ? 'text-on-ink-muted' : 'text-muted'}`}
          >
            {richParagraphs(intro)}
          </div>
        )}
        {totalTimeLabel && (
          <p
            className={`mt-5 text-3xs font-bold uppercase tracking-widest ${
              ink ? 'text-on-ink-subtle' : 'text-subtle'
            }`}
          >
            {totalTimeLabel}
          </p>
        )}
        <ol className="stagger mt-9 space-y-5">
          {shown.map((step, i) => (
            <Reveal
              as="li"
              key={i}
              className={`lift-1 overflow-hidden rounded-card border ${
                ink ? 'border-on-ink/10 bg-on-ink/5' : 'border-border bg-surface'
              }`}
            >
              {step.image && (
                <SiteImage
                  src={step.image}
                  alt={step.alt ?? ''}
                  aspect="16/10"
                  sizes="(min-width: 768px) 44rem, 100vw"
                />
              )}
              <div className="p-6">
                <span
                  className={`font-display text-4xl leading-none sm:text-5xl ${
                    ink ? 'text-primary' : 'text-primary-strong'
                  }`}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                {step.name && (
                  <h3 className={`mt-2 text-body-lg font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>
                    {step.name}
                  </h3>
                )}
                {step.text && (
                  <div
                    className={`mt-2 text-body leading-relaxed [&>p+p]:mt-3 ${
                      ink ? 'text-on-ink-muted' : 'text-muted'
                    }`}
                  >
                    {richParagraphs(step.text)}
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ComponentConfig map — exported as dawnComponents
// ─────────────────────────────────────────────────────────────────────────────

const planArrayFields = {
  livePriceKey: {
    type: 'text' as const,
    label: 'Live price key (member, crew, free, business, collective, nonprofit, independent)',
  },
  name: { type: 'text' as const, label: 'Name (falls back to the live label)' },
  tagline: { type: 'textarea' as const, label: 'Tagline' },
  price: { type: 'text' as const, label: 'Price (fallback when unbound)' },
  strikePrice: { type: 'text' as const, label: 'Struck list price (fallback when unbound)' },
  yearly: { type: 'text' as const, label: 'Yearly line (fallback when unbound)' },
  billing: { type: 'textarea' as const, label: 'Billing line (optional)' },
  trial: { type: 'text' as const, label: 'Trial line (optional)' },
  forWho: { type: 'textarea' as const, label: 'Who it is for' },
  rate: { type: 'textarea' as const, label: 'Rate sentence (fallback when unbound)' },
  featured: {
    type: 'radio' as const,
    label: 'Featured',
    options: [
      { label: 'Normal', value: 'normal' },
      { label: 'Featured (floats)', value: 'featured' },
    ],
  },
  ctaLabel: { type: 'text' as const, label: 'Button label' },
  ctaHref: { type: 'text' as const, label: 'Button link' },
}

export const dawnComponents: Record<string, ComponentConfig> = {
  // ── PhotoBeat ────────────────────────────────────────────────────────────────
  PhotoBeat: {
    label: 'Photo beat (full-bleed line)',
    fields: {
      image: imgField,
      alt: { type: 'text', label: 'Alt text' },
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      line: { type: 'textarea', label: 'The one sentence' },
      lineAccent: { type: 'text', label: 'Accent phrase (optional)' },
      note: { type: 'textarea', label: 'Supporting note (optional)' },
      focal: focalField,
      layout: layoutField,
    },
    defaultProps: {
      image: '/images/site/adult-playground-parachute.jpg',
      alt: 'Adults holding the edges of a parachute together on a sunny lawn',
      eyebrow: 'Why we exist',
      line: 'Somewhere to belong, near you.',
      lineAccent: 'near you',
      note: "We think the answer to the loneliest era in history is a folding chair with your name on it. We're not building a following. We're building infrastructure.",
      focal: 'center',
      layout: layoutDefault,
    },
    render: ({ image, alt, eyebrow, line, lineAccent, note, focal, layout }) => (
      <PhotoBeatBlock
        image={(image as string) || undefined}
        alt={(alt as string) || undefined}
        eyebrow={(eyebrow as string) || undefined}
        line={(line as string) || undefined}
        lineAccent={(lineAccent as string) || undefined}
        note={(note as string) || undefined}
        focal={focal as string}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },

  // ── PhotoTrio ────────────────────────────────────────────────────────────────
  PhotoTrio: {
    label: 'Photo trio (figure row)',
    fields: {
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      title: { type: 'textarea', label: 'Heading (optional)' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      kicker: { type: 'textarea', label: 'Italic kicker (optional)' },
      intro: { type: 'textarea', label: 'Intro paragraph (optional, [link](/path) works)' },
      items: {
        type: 'array',
        label: 'Figures (3)',
        arrayFields: {
          image: imgField,
          alt: { type: 'text', label: 'Alt text' },
          title: { type: 'textarea', label: 'Title' },
          caption: { type: 'textarea', label: 'Caption' },
        },
        getItemSummary: (item: TrioItem) => item.title || 'Figure',
      },
      footnote: { type: 'textarea', label: 'Footnote (optional, [link](/path) works)' },
      shape: {
        type: 'radio',
        label: 'Shape',
        options: [
          { label: 'Flat', value: 'flat' },
          { label: 'Arc shoulder', value: 'arc' },
        ],
      },
      texture: {
        type: 'radio',
        label: 'Texture',
        options: [
          { label: 'None', value: 'none' },
          { label: 'Dot grid', value: 'dots' },
        ],
      },
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: {
      eyebrow: 'The arc',
      title: 'From a beach to your city.',
      titleAccent: '',
      kicker: 'One circle at a time, the way it always spread.',
      intro: '',
      items: [
        {
          image: '/images/site/moonlight-2.jpg',
          alt: 'A gathering on the bluffs at Moonlight Beach at sunrise',
          title: '2020 · A cliff at Moonlight Beach',
          caption:
            'A handful of people start meeting at dawn to breathe and reconnect. No brand, no plan, just a standing time and a place to be.',
        },
        {
          image: '/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg',
          alt: 'People in a quiet moment of breathwork together outdoors at golden hour',
          title: '2021 · A thousand people, no home',
          caption:
            "Word of mouth carries it to nearly a thousand. It proves the hunger is real, and proves that without a home, even the most beautiful thing can't hold.",
        },
        {
          image: '/images/site/lab-storefront.jpg',
          alt: 'The storefront of the first Frequency Lab taking shape',
          title: 'Today · The first Circles',
          caption:
            'The blueprint becomes real: the tools handed to anyone who wants to start a Circle, and a model that keeps the doors open to everyone.',
        },
      ],
      footnote: '',
      shape: 'arc',
      texture: 'none',
      tone: 'surface',
      layout: layoutDefault,
    },
    render: ({ eyebrow, title, titleAccent, kicker, intro, items, footnote, shape, texture, tone, layout }) => (
      <PhotoTrioBlock
        eyebrow={(eyebrow as string) || undefined}
        title={(title as string) || undefined}
        titleAccent={(titleAccent as string) || undefined}
        kicker={(kicker as string) || undefined}
        intro={(intro as string) || undefined}
        items={items as TrioItem[]}
        footnote={(footnote as string) || undefined}
        shape={shape as 'flat' | 'arc'}
        texture={texture as 'none' | 'dots'}
        tone={tone as string}
        pad={padClass(layout as LayoutValue)}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },

  // ── StoryBeats ───────────────────────────────────────────────────────────────
  StoryBeats: {
    label: 'Story beats (ruled prose)',
    fields: {
      eyebrow: { type: 'textarea', label: 'Eyebrow (first beat)' },
      kicker: { type: 'textarea', label: 'Italic kicker (first beat)' },
      items: {
        type: 'array',
        label: 'Beats',
        arrayFields: {
          title: { type: 'textarea', label: 'Heading' },
          body: { type: 'textarea', label: 'Paragraphs (blank line between)' },
        },
        getItemSummary: (item: StoryBeat) => item.title || 'Beat',
      },
      flow: {
        type: 'radio',
        label: 'Rhythm',
        options: [
          { label: 'Standard beat', value: 'beat' },
          { label: 'Continue the section above', value: 'cont' },
        ],
      },
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: {
      eyebrow: 'Where it comes from',
      kicker: 'Most of a generation feels it. Almost nobody has a word for it.',
      items: [
        {
          title: 'A hunger nobody could name.',
          body: "We didn't set out to start a company. We set out to find each other, and discovered that the places built to hold people had quietly disappeared.",
        },
      ],
      flow: 'beat',
      tone: 'canvas',
      layout: layoutDefault,
    },
    render: ({ eyebrow, kicker, items, flow, tone, layout }) => (
      <StoryBeatsBlock
        eyebrow={(eyebrow as string) || undefined}
        kicker={(kicker as string) || undefined}
        items={items as StoryBeat[]}
        flow={flow as 'beat' | 'cont'}
        tone={tone as string}
        pad={padClass(layout as LayoutValue)}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },

  // ── ValueBand ────────────────────────────────────────────────────────────────
  ValueBand: {
    label: 'Value band (ink principles)',
    fields: {
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      title: { type: 'textarea', label: 'Heading' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      kicker: { type: 'textarea', label: 'Italic kicker (optional)' },
      columns: {
        type: 'radio',
        label: 'Columns',
        options: [
          { label: '2', value: '2' },
          { label: '3', value: '3' },
        ],
      },
      items: {
        type: 'array',
        label: 'Values',
        arrayFields: {
          icon: valueIconField,
          title: { type: 'text', label: 'Title' },
          body: { type: 'textarea', label: 'Body' },
        },
        getItemSummary: (item: ValueItem) => item.title || 'Value',
      },
      layout: layoutField,
    },
    defaultProps: {
      eyebrow: 'What we believe',
      title: "The principles we won't trade away.",
      titleAccent: '',
      kicker: 'Four hard rules, learned the hard way.',
      columns: '2',
      items: [
        {
          icon: 'Compass',
          title: 'Guru-free',
          body: 'No charismatic founder to follow, no one to put on a pedestal. The community is the point, not any single voice at the front of the room.',
        },
        {
          icon: 'Users',
          title: 'Leaderful, not leader-dependent',
          body: 'Everyone holds a piece of it. Leaders rise from the people who keep showing up. Designed to outlast any one person.',
        },
        {
          icon: 'HandHeart',
          title: 'One honest price',
          body: 'Zero percent on your own bookings, always, and taking money is never behind a plan. One price, no surprise invoices.',
        },
        {
          icon: 'Home',
          title: 'A third place',
          body: "Not home, not work: a real place to exhale, reset, and be missed when you don't show up.",
        },
      ],
      layout: layoutDefault,
    },
    render: ({ eyebrow, title, titleAccent, kicker, columns, items, layout }) => (
      <ValueBandBlock
        eyebrow={(eyebrow as string) || undefined}
        title={(title as string) || undefined}
        titleAccent={(titleAccent as string) || undefined}
        kicker={(kicker as string) || undefined}
        columns={columns as string}
        items={items as ValueItem[]}
        pad={padClass(layout as LayoutValue)}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },

  // ── BuildTimeline ────────────────────────────────────────────────────────────
  BuildTimeline: {
    label: 'Build timeline (numbered cards)',
    fields: {
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      title: { type: 'textarea', label: 'Heading' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      kicker: { type: 'textarea', label: 'Italic kicker (optional)' },
      intro: { type: 'textarea', label: 'Intro paragraph (optional)' },
      items: {
        type: 'array',
        label: 'Cards',
        arrayFields: {
          label: { type: 'text', label: 'Numeral or date (e.g. 01, Now, 2028)' },
          title: { type: 'text', label: 'Title' },
          tag: { type: 'text', label: 'Short qualifier beside the title (optional)' },
          body: { type: 'textarea', label: 'Body' },
          highlight: {
            type: 'radio',
            label: 'Highlight',
            options: [
              { label: 'Normal', value: 'normal' },
              { label: 'Chosen (highlight)', value: 'chosen' },
            ],
          },
        },
        getItemSummary: (item: TimelineItem) => item.title || item.label || 'Card',
      },
      footnote: { type: 'textarea', label: 'Fine print under the warm rule (optional)' },
      texture: {
        type: 'radio',
        label: 'Texture',
        options: [
          { label: 'None', value: 'none' },
          { label: 'Dot grid', value: 'dots' },
        ],
      },
      flow: {
        type: 'radio',
        label: 'Rhythm',
        options: [
          { label: 'Standard beat', value: 'beat' },
          { label: 'Soft open (half top padding)', value: 'soft' },
        ],
      },
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: {
      eyebrow: 'Where this actually is',
      title: 'Community first, building second.',
      titleAccent: '',
      kicker: "Most third places sign a lease, then go looking for the people. We're doing it the other way round.",
      intro: '',
      items: [
        {
          label: 'Now',
          title: 'Circles, in borrowed rooms',
          body: 'Circles are meeting weekly in parks, living rooms, and rented studios. The community is real; the building is not.',
          highlight: 'normal',
        },
        {
          label: '2027',
          title: 'Site and permits',
          body: 'A shortlist, then the slow unglamorous part: a site, zoning, and the plumbing a sauna and a cold pool need.',
          highlight: 'normal',
        },
        {
          label: '2028',
          title: 'The first Lab opens',
          body: 'One building, built from day one to be repeatable. If the first room works, the second is a template instead of an experiment.',
          highlight: 'chosen',
        },
      ],
      footnote: '',
      texture: 'dots',
      flow: 'beat',
      tone: 'canvas',
      layout: layoutDefault,
    },
    render: ({ eyebrow, title, titleAccent, kicker, intro, items, footnote, texture, flow, tone, layout }) => (
      <BuildTimelineBlock
        eyebrow={(eyebrow as string) || undefined}
        title={(title as string) || undefined}
        titleAccent={(titleAccent as string) || undefined}
        kicker={(kicker as string) || undefined}
        intro={(intro as string) || undefined}
        items={items as TimelineItem[]}
        footnote={(footnote as string) || undefined}
        texture={texture as 'none' | 'dots'}
        flow={flow as 'beat' | 'soft'}
        tone={tone as string}
        pad={padClass(layout as LayoutValue)}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },

  // ── PhotoCardRow ─────────────────────────────────────────────────────────────
  PhotoCardRow: {
    label: 'Photo cards (numbered, honest tag)',
    fields: {
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      title: { type: 'textarea', label: 'Heading' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      kicker: { type: 'textarea', label: 'Italic kicker (optional)' },
      tag: { type: 'text', label: 'Overline on every card (e.g. Reference, not our room)' },
      items: {
        type: 'array',
        label: 'Cards',
        arrayFields: {
          image: imgField,
          alt: { type: 'text', label: 'Alt text' },
          label: { type: 'text', label: 'Numeral (blank = auto)' },
          title: { type: 'text', label: 'Title' },
          body: { type: 'textarea', label: 'Body' },
        },
        getItemSummary: (item: PhotoCard) => item.title || 'Card',
      },
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: {
      eyebrow: 'Three rooms, intended',
      title: 'What we mean to build.',
      titleAccent: '',
      kicker: "A specification we're working to, not a facility you can visit.",
      tag: 'Reference, not our room',
      items: [
        {
          image: '/images/site/lab-thermal.jpg',
          alt: 'Reference photograph: low amber light across a cedar sauna',
          label: '01',
          title: 'The thermal circuit',
          body: 'Cedar sauna and steam, hot enough to quiet the mind. The first half of the loop that resets you to baseline.',
        },
        {
          image: '/images/site/lab-pool.jpg',
          alt: 'Reference photograph: a cold plunge pool, still water under low light',
          label: '02',
          title: 'The cold pool',
          body: 'A plunge that shocks everything loose. Do it alone and it’s a habit; do it with your Circle and it’s a ritual.',
        },
        {
          image: '/images/site/lab-concept.jpg',
          alt: 'Reference photograph: a warm, plant-filled movement studio lit for an evening class',
          label: '03',
          title: 'Movement studios',
          body: 'Breathwork at sunrise, ecstatic dance after dark, strength in between. Programmed to help you calm down, not to chase a mirror.',
        },
      ],
      tone: 'ink',
      layout: layoutDefault,
    },
    render: ({ eyebrow, title, titleAccent, kicker, tag, items, tone, layout }) => (
      <PhotoCardRowBlock
        eyebrow={(eyebrow as string) || undefined}
        title={(title as string) || undefined}
        titleAccent={(titleAccent as string) || undefined}
        kicker={(kicker as string) || undefined}
        tag={(tag as string) || undefined}
        items={items as PhotoCard[]}
        tone={tone as string}
        pad={padClass(layout as LayoutValue)}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },

  // ── PlanBand ─────────────────────────────────────────────────────────────────
  PlanBand: {
    label: 'Plan band (live pricing)',
    fields: {
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      title: { type: 'textarea', label: 'Heading (optional)' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      kicker: { type: 'textarea', label: 'Italic kicker (optional)' },
      plans: {
        type: 'array',
        label: 'Plans (up to 3; middle featured floats)',
        arrayFields: planArrayFields,
        getItemSummary: (item: PlanItem) => item.name || item.livePriceKey || 'Plan',
      },
      strip: {
        type: 'array',
        label: 'Quiet full-width strip (optional)',
        arrayFields: planArrayFields,
        getItemSummary: (item: PlanItem) => item.name || item.livePriceKey || 'Plan',
      },
      footnote: { type: 'textarea', label: 'Footnote (optional)' },
      priceSchema: {
        type: 'radio',
        label: 'Price schema (Product/Offer JSON-LD from live figures)',
        options: [
          { label: 'Off (the page emits its own)', value: 'off' },
          { label: 'On', value: 'on' },
        ],
      },
      schemaPath: { type: 'text', label: 'Canonical path for the price schema' },
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: {
      eyebrow: 'The plans',
      title: 'Pick the plan that fits.',
      titleAccent: '',
      kicker:
        'Two ladders. One for you as a member, one for the Space you run. Every rung on both sells, so the only thing that moves down the ladder is the rate.',
      plans: [
        {
          livePriceKey: 'member',
          name: 'Member',
          tagline: 'Belong to everything.',
          price: 'Free',
          strikePrice: '',
          yearly: '',
          billing: 'Free forever. No card.',
          trial: '',
          forWho: 'Anyone who wants to find their people, go to things, and join Circles.',
          rate: '',
          featured: 'normal',
          ctaLabel: 'Join free',
          ctaHref: '/join',
        },
        {
          livePriceKey: 'crew',
          name: 'Crew',
          tagline: 'The whole member experience, at a price you pick.',
          price: '',
          strikePrice: '',
          yearly: '',
          billing: 'Monthly or yearly.',
          trial: '',
          forWho: 'Members who want the full game, unlimited Vera, and the tools that build a list.',
          rate: '',
          featured: 'featured',
          ctaLabel: 'Join Crew',
          ctaHref: '/upgrade',
        },
        {
          livePriceKey: 'free',
          name: 'Space',
          tagline: 'Put your business on the map.',
          price: 'Free',
          strikePrice: '',
          yearly: '',
          billing: 'Free forever. No card.',
          trial: '',
          forWho: 'Anyone standing something up, for as long as they want. No card, no clock.',
          rate: '',
          featured: 'normal',
          ctaLabel: 'Start a Space',
          ctaHref: '/spaces',
        },
      ],
      strip: [],
      footnote: '',
      priceSchema: 'off',
      schemaPath: '/pricing',
      tone: 'canvas',
      layout: layoutDefault,
    },
    render: ({ eyebrow, title, titleAccent, kicker, plans, strip, footnote, priceSchema, schemaPath, tone, layout, puck }) => (
      <PlanBandBlock
        eyebrow={(eyebrow as string) || undefined}
        title={(title as string) || undefined}
        titleAccent={(titleAccent as string) || undefined}
        kicker={(kicker as string) || undefined}
        plans={plans as PlanItem[]}
        strip={strip as PlanItem[]}
        footnote={(footnote as string) || undefined}
        priceSchema={priceSchema as 'on' | 'off'}
        schemaPath={(schemaPath as string) || undefined}
        livePricing={(puck?.metadata?.live as { pricing?: LivePricing } | undefined)?.pricing}
        tone={tone as string}
        pad={padClass(layout as LayoutValue)}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },

  // ── PillarNav ────────────────────────────────────────────────────────────────
  PillarNav: {
    label: 'Pillar nav (the triptych)',
    fields: {
      current: {
        type: 'select',
        label: 'This page',
        options: [
          { label: 'The Lab', value: '/the-lab' },
          { label: 'The Community', value: '/the-community' },
          { label: 'The Quest', value: '/the-quest' },
        ],
      },
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: {
      current: '/the-lab',
      tone: 'surface',
      layout: layoutDefault,
    },
    render: ({ current, tone, layout }) => (
      <div className={visClass(layout as LayoutValue)}>
        <PillarNav
          current={current as '/the-lab' | '/the-community' | '/the-quest'}
          tone={isInk(tone as string) ? 'ink' : tone === 'canvas' ? 'canvas' : 'surface'}
        />
      </div>
    ),
  },

  // ── DawnHowToSteps ───────────────────────────────────────────────────────────
  DawnHowToSteps: {
    label: 'How-to steps (ordered, owns HowTo schema)',
    fields: {
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      name: { type: 'textarea', label: 'Guide name (the heading AND the HowTo name)' },
      nameAccent: { type: 'text', label: 'Accent word (optional)' },
      kicker: { type: 'textarea', label: 'Italic kicker (optional)' },
      intro: { type: 'textarea', label: 'Intro paragraph (also the HowTo description)' },
      totalTimeLabel: { type: 'text', label: 'Time it takes, in words (e.g. About 30 minutes)' },
      totalTime: {
        type: 'text',
        label: 'Time it takes, ISO 8601 for search engines (e.g. PT30M). Blank is fine.',
      },
      steps: {
        type: 'array',
        label: 'Steps (in order)',
        arrayFields: {
          name: { type: 'text', label: 'Step name' },
          text: { type: 'textarea', label: 'What to do (**bold**, *italic*, [link](/path))' },
          image: imgField,
          alt: { type: 'text', label: 'Alt text' },
        },
        getItemSummary: (item: HowToStepItem) => item.name || 'Step',
      },
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: {
      eyebrow: 'How to',
      name: 'How to start a Circle',
      nameAccent: '',
      kicker: '',
      intro: 'Four steps, a standing time, and a few people. That is the whole thing.',
      totalTimeLabel: '',
      totalTime: '',
      steps: [
        {
          name: 'Pick what you gather around',
          text: 'A class, a walk, a supper table, a sit. One thing, named plainly, so the right people know it is for them.',
          image: '',
          alt: '',
        },
        {
          name: 'Pick a standing time',
          text: 'Same day, same hour, every week. A standing time is what turns a plan into a habit.',
          image: '',
          alt: '',
        },
        {
          name: 'Invite the few you already know',
          text: 'Three people is a Circle. Ask them directly, not with a post, and tell them the time.',
          image: '',
          alt: '',
        },
        {
          name: 'Hold the door, week after week',
          text: 'Show up even on the quiet weeks. The room is built by the people who keep coming back.',
          image: '',
          alt: '',
        },
      ],
      tone: 'surface',
      layout: layoutDefault,
    },
    render: ({
      eyebrow,
      name,
      nameAccent,
      kicker,
      intro,
      totalTime,
      totalTimeLabel,
      steps,
      tone,
      layout,
    }) => (
      <DawnHowToStepsBlock
        eyebrow={(eyebrow as string) || undefined}
        name={(name as string) || undefined}
        nameAccent={(nameAccent as string) || undefined}
        kicker={(kicker as string) || undefined}
        intro={(intro as string) || undefined}
        totalTime={(totalTime as string) || undefined}
        totalTimeLabel={(totalTimeLabel as string) || undefined}
        steps={steps as HowToStepItem[]}
        tone={tone as string}
        pad={padClass(layout as LayoutValue)}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },
}
