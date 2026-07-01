import Link from 'next/link'
import {
  Building2,
  MapPin,
  Clock,
  Phone,
  Mail,
  Link2,
  Calendar,
  CalendarCheck,
  ArrowUpRight,
  Users,
  Sparkles,
  CalendarDays,
  Package,
  Route,
} from 'lucide-react'
import type { ComponentConfig } from '@measured/puck'

import { getInitials } from '@/lib/utils'
import { focalClass } from '@/lib/page-editor/image-controls'
import { CtaButton } from '@/components/page-editor/blocks/kit'
import { loomImageField, loomSquareImageField } from '@/lib/page-editor/loom-image-field'
// TYPE-ONLY import: erased at build, so this NEVER drags the server reader (createAdminClient) into
// the client editor bundle. The Profile blocks read the shared identity + live counts off
// `puck.metadata.space`, injected by the RSC render paths (components/spaces/space-landing.tsx +
// the Spotlight render bridge). This is the build-trap boundary: a Profile block imports NOTHING
// server-only.
import type {
  SpaceIdentity,
  SpaceHighlight,
  SpaceStat,
  SpaceEventItem,
  SpaceBookingInfo,
  SpacePracticesData,
  SpacePracticeItem,
  SpaceCircleItem,
} from '@/lib/spaces/content-data'

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE BLOCKS (Puck content blocks, Phase 4). A profile-native block set styled
// like a Facebook business page but painted entirely from the app's DAWN design
// system (clean cards, semantic tokens, one consistent radius/spacing/type scale) --
// NOT the marketing display-type blocks. Each block is dual-purpose (editable in
// <Puck>, rendered by <Render>), operator-movable/removable, and reads the shared
// Space identity + live counts off `puck.metadata.space` where dynamic:
//   SpaceIdentityHeader - THE shared cover + logo + name + tagline + primary CTA
//                         header (renders the SAME on the space AND the Spotlight).
//   SpaceAbout          - a clean about / story card.
//   SpaceHighlights     - a calm, card-like stat strip (members / offerings / ...).
//   SpaceOfferings      - the services the space provides, as a card grid.
//   SpaceContact        - contact + hours as an info card.
//   SpaceTeam           - the people, as avatar cards.
//   SpaceCTA            - a tasteful conversion band (card + one button).
// The dynamic reads default to a placeholder in the editor canvas (no metadata) and to
// nothing on the live render when the space has no data, so a block never depends on
// live data and this module stays client-safe. Copy is CONTENT-VOICE: plain, no em
// dashes, never invented counts.
//
// UNIFORM + WHITE-LABEL (AGENTS.md D4/D6): every card uses the SAME semantic tokens +
// the SAME radius/spacing scale, so any space looks cohesive + best-practice out of the
// box, then themes to the space's brand accent at the render layer. No hardcoded hex,
// no text-[10/11px].
// ─────────────────────────────────────────────────────────────────────────────

type PuckArg = { metadata?: Record<string, unknown> } | undefined
function identityFrom(puck: PuckArg): SpaceIdentity | undefined {
  const space = puck?.metadata?.space as { identity?: SpaceIdentity } | undefined
  return space?.identity
}
function highlightsFrom(puck: PuckArg): SpaceHighlight[] {
  const space = puck?.metadata?.space as { highlights?: SpaceHighlight[] } | undefined
  return space?.highlights ?? []
}
function statsFrom(puck: PuckArg): SpaceStat[] {
  const space = puck?.metadata?.space as { stats?: SpaceStat[] } | undefined
  return space?.stats ?? []
}
function eventsFrom(puck: PuckArg): SpaceEventItem[] {
  const space = puck?.metadata?.space as { events?: SpaceEventItem[] } | undefined
  return space?.events ?? []
}
function bookingFrom(puck: PuckArg): SpaceBookingInfo | undefined {
  const space = puck?.metadata?.space as { booking?: SpaceBookingInfo } | undefined
  return space?.booking
}
function practicesFrom(puck: PuckArg): SpacePracticesData | undefined {
  const space = puck?.metadata?.space as { practices?: SpacePracticesData } | undefined
  return space?.practices
}
function communityFrom(puck: PuckArg): SpaceCircleItem[] | undefined {
  const space = puck?.metadata?.space as { community?: SpaceCircleItem[] } | undefined
  return space?.community
}

// Shown in the editor canvas (no live data) so a section stays visible + draggable there.
function EditorStub({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface/60 px-4 py-10 text-center text-sm text-muted">
      {label}
      <span className="mt-0.5 block text-2xs text-subtle">{hint}</span>
    </div>
  )
}

// One consistent card shell every Profile info card composes, so the set reads as ONE kit (matched
// radius, surface, padding). LIGHTENED: a barely-there surface with a hairline border and no shadow,
// so cards read as gentle groupings that blend into the page rather than hard boxes. `ink` swaps to
// the dark-band treatment for legibility. One radius/spacing/elevation rhythm across the whole set.
function InfoCard({ children, ink, className = '' }: { children: React.ReactNode; ink?: boolean; className?: string }) {
  return (
    <div
      className={`rounded-xl border ${ink ? 'border-white/10 bg-white/5' : 'border-border/60 bg-surface/60'} p-6 sm:p-7 ${className}`}
    >
      {children}
    </div>
  )
}

// A quiet card-title lockup (eyebrow + heading), calmer than the marketing DisplayHeading -- this set
// is a profile, not a landing page, so headings are plain bold, never full-bleed display type.
function CardTitle({ eyebrow, heading, ink }: { eyebrow?: string; heading?: string; ink?: boolean }) {
  if (!eyebrow && !heading) return null
  return (
    <div className="mb-5">
      {eyebrow && (
        <p className={`text-2xs font-bold uppercase tracking-[0.2em] ${ink ? 'text-primary' : 'text-primary-strong'}`}>
          {eyebrow}
        </p>
      )}
      {heading && (
        <h2 className={`mt-1 text-xl font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>{heading}</h2>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SpaceIdentityHeader -- THE shared cover + logo + name identity. FB-business-page
// layout: a cover band with the logo/name lockup overlapping it. Renders the SAME on
// the space landing AND a brand/space Spotlight (uniform by default). The operator can
// toggle it off or override the cover/logo per surface.
// ─────────────────────────────────────────────────────────────────────────────

// Cover heights per MODE. `header` is a compact identity band (shorter than the old default);
// `hero` is a tall, immersive cover with a taller floor. `height` re-selects within each mode.
const HEADER_COVER_HEIGHT: Record<string, string> = {
  short: 'h-28 sm:h-36',
  medium: 'h-36 sm:h-44',
  tall: 'h-48 sm:h-56',
}
const HERO_COVER_HEIGHT: Record<string, string> = {
  short: 'h-72 sm:h-96',
  medium: 'h-80 sm:h-[30rem]',
  tall: 'h-96 sm:h-[34rem]',
}

// The logo + name + type + tagline lockup, shared by both modes. `overlay` paints it for
// legibility on top of a hero cover image (on-ink tokens); otherwise it reads on the card surface.
function IdentityLockup({
  identity,
  logo,
  showFollow,
  overlay,
}: {
  identity: SpaceIdentity
  logo: string
  showFollow: boolean
  overlay?: boolean
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-end gap-4">
        <div className={`shrink-0 ${overlay ? '' : '-mt-10 sm:-mt-12'}`}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- operator-supplied logo URL
            <img
              src={logo}
              alt=""
              className="h-20 w-20 rounded-2xl border-4 border-surface bg-surface object-contain shadow-md sm:h-24 sm:w-24"
            />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-surface bg-surface-elevated text-2xl font-bold text-subtle shadow-md sm:h-24 sm:w-24">
              {getInitials(identity.name)}
            </span>
          )}
        </div>
        <div className="min-w-0 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              className={`min-w-0 break-words font-bold leading-tight ${
                overlay ? 'text-3xl text-on-ink sm:text-4xl' : 'text-2xl text-text'
              }`}
            >
              {identity.name}
            </h1>
            {identity.typeLabel && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-semibold ${
                  overlay ? 'bg-white/15 text-on-ink' : 'bg-primary-bg text-primary-strong'
                }`}
              >
                <Building2 className="h-3 w-3" aria-hidden />
                {identity.typeLabel}
              </span>
            )}
          </div>
          {identity.tagline && (
            <p className={`mt-1 max-w-2xl text-sm ${overlay ? 'text-on-ink-muted' : 'text-muted'}`}>
              {identity.tagline}
            </p>
          )}
        </div>
      </div>
      {(identity.primaryCta || showFollow) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 pb-1">
          {identity.primaryCta && (
            <Link
              href={identity.primaryCta.href || '#'}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-2.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover shadow-pop"
            >
              {identity.primaryCta.label}
            </Link>
          )}
          {showFollow && (
            <span
              className={`inline-flex items-center gap-2 rounded-2xl border px-6 py-2.5 text-sm font-bold ${
                overlay ? 'border-white/40 text-on-ink' : 'border-border-strong text-text'
              }`}
            >
              Follow
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function SpaceIdentityHeaderBlock({
  identity,
  coverOverride,
  logoOverride,
  focal,
  height,
  showFollow,
  style,
}: {
  identity: SpaceIdentity
  coverOverride?: string
  logoOverride?: string
  focal?: string
  height?: string
  showFollow?: boolean
  style?: string
}) {
  const cover = coverOverride || identity.coverUrl || ''
  const logo = logoOverride || identity.logoUrl || ''

  // ── HERO: full-width, taller, immersive. The cover breaks the card container (no max-w, no outer
  // border/radius) and reads edge-to-edge within the page content area, with the identity lockup
  // anchored to the bottom over a legibility scrim.
  if (style === 'hero') {
    const h = HERO_COVER_HEIGHT[height ?? 'medium'] ?? HERO_COVER_HEIGHT.medium
    return (
      <section className="w-full">
        <div
          className={`relative w-full overflow-hidden ${h} ${
            cover ? '' : 'bg-gradient-to-br from-primary-bg/40 via-surface-elevated to-surface'
          }`}
        >
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element -- operator-supplied cover URL, not a build-time asset
            <img src={cover} alt="" className={`h-full w-full object-cover ${focalClass(focal)}`} />
          )}
          {/* Legibility scrim so the overlaid lockup stays readable on any cover. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0">
            <div className="mx-auto w-full max-w-5xl px-6 pb-8">
              <IdentityLockup identity={identity} logo={logo} showFollow={!!showFollow} overlay />
            </div>
          </div>
        </div>
      </section>
    )
  }

  // ── HEADER (default): the contained business-page identity card, now a compact band (shorter
  // default cover than before), with the logo chip overlapping the cover.
  const h = HEADER_COVER_HEIGHT[height ?? 'medium'] ?? HEADER_COVER_HEIGHT.medium
  return (
    <section className="w-full pt-4">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-2xs">
        {/* Cover band. A neutral tinted fill when there is no uploaded cover, so the header still reads
            as an intentional identity card, never broken. */}
        <div className={`relative w-full ${h} ${cover ? '' : 'bg-gradient-to-br from-primary-bg/40 via-surface-elevated to-surface'}`}>
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element -- operator-supplied cover URL, not a build-time asset
            <img src={cover} alt="" className={`h-full w-full object-cover ${focalClass(focal)}`} />
          )}
        </div>
        {/* Identity lockup: the logo chip overlaps the cover (FB business page), name + type badge +
            tagline beside it, the primary action + follow trailing. */}
        <div className="px-6 pb-6">
          <IdentityLockup identity={identity} logo={logo} showFollow={!!showFollow} />
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SpaceAbout -- a clean about / story card.
// ─────────────────────────────────────────────────────────────────────────────

export function SpaceAboutBlock({
  eyebrow,
  heading,
  body,
  ink,
}: {
  eyebrow?: string
  heading?: string
  body?: string
  ink?: boolean
}) {
  if (!body && !heading) return null
  return (
    <InfoCard ink={ink}>
      <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
      {body && (
        <div className={`space-y-3 text-base leading-relaxed ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>
          {body.split('\n').filter(Boolean).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
    </InfoCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SpaceHighlights -- a calm, card-like stat strip (members / offerings / ...),
// NOT the marketing StatRow. Reads live counts off metadata; nothing when empty.
// ─────────────────────────────────────────────────────────────────────────────

export function SpaceHighlightsBlock({ highlights, ink }: { highlights: SpaceHighlight[]; ink?: boolean }) {
  if (highlights.length === 0) return null
  const shown = highlights.slice(0, 4)
  return (
    <div className="grid grid-cols-2 gap-4">
      {shown.map((s) => (
        <div
          key={s.label}
          className={`rounded-xl border p-6 text-center ${ink ? 'border-white/10 bg-white/5' : 'border-border/60 bg-surface/60'}`}
        >
          <div className={`text-2xl font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>{s.value.toLocaleString()}</div>
          <div className={`mt-0.5 text-2xs font-semibold uppercase tracking-wide ${ink ? 'text-on-ink-muted' : 'text-subtle'}`}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3b. SpaceStats -- the operator-CONFIGURABLE live stat band. Richer than the calm
// SpaceHighlights strip: the operator chooses WHICH metrics to show (from the resolved
// set) and can override each label. Still HONEST -- a metric that resolves to zero (or is
// absent from the resolved set) is dropped, never invented. Reads the full resolved stat
// set off metadata; renders nothing when nothing selected resolves to a positive count.
// ─────────────────────────────────────────────────────────────────────────────

/** One operator-chosen metric row: which metric + an optional label override. */
type StatChoice = { metric?: string; label?: string }

// The metrics the operator can surface, matching the resolver's metric keys. Icons + a plain default
// label; the block still hides any that resolve to zero (honest at day zero).
const STAT_METRIC_META: Record<string, { label: string; icon: React.ReactNode }> = {
  members: { label: 'Members', icon: <Users className="h-4 w-4" aria-hidden /> },
  clients: { label: 'Clients', icon: <Users className="h-4 w-4" aria-hidden /> },
  offerings: { label: 'Offerings', icon: <Package className="h-4 w-4" aria-hidden /> },
  sessions: { label: 'Upcoming sessions', icon: <CalendarDays className="h-4 w-4" aria-hidden /> },
  practices: { label: 'Practices', icon: <Sparkles className="h-4 w-4" aria-hidden /> },
  circles: { label: 'Circles', icon: <Users className="h-4 w-4" aria-hidden /> },
}

/** One resolved stat tile the SpaceStats block renders. PURE selection output (no JSX). */
export type SelectedStat = { metric: string; label: string; value: number }

/**
 * The operator's chosen metrics, resolved to their live values, in the operator's order. HONEST:
 * a metric that is not in the resolved set, or resolves to zero (or less), is DROPPED, so a
 * brand-new Space never shows an invented number. A blank label override falls back to the resolved
 * label, then the metric's default label, then the metric key. Pure + unit-testable.
 */
export function selectSpaceStats(choices: StatChoice[], stats: SpaceStat[]): SelectedStat[] {
  const byMetric = new Map(stats.map((s) => [s.metric, s]))
  const out: SelectedStat[] = []
  for (const c of choices) {
    const metric = c.metric
    if (!metric) continue
    const resolved = byMetric.get(metric as SpaceStat['metric'])
    if (!resolved || resolved.value <= 0) continue
    const label = c.label?.trim() || resolved.label || STAT_METRIC_META[metric]?.label || metric
    out.push({ metric, label, value: resolved.value })
  }
  return out
}

export function SpaceStatsBlock({
  eyebrow,
  heading,
  choices,
  stats,
  ink,
}: {
  eyebrow?: string
  heading?: string
  choices: StatChoice[]
  stats: SpaceStat[]
  ink?: boolean
}) {
  const shown = selectSpaceStats(choices, stats)
  if (shown.length === 0) return null
  const cols = shown.length >= 4 ? 'sm:grid-cols-4' : shown.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
  return (
    <div>
      <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
      <div className={`grid grid-cols-2 gap-4 ${cols}`}>
        {shown.map((s) => (
          <div
            key={s.metric}
            className={`rounded-xl border p-6 ${ink ? 'border-white/10 bg-white/5' : 'border-border/60 bg-surface/60'}`}
          >
            <span className={`inline-flex ${ink ? 'text-primary' : 'text-primary-strong'}`}>
              {STAT_METRIC_META[s.metric]?.icon}
            </span>
            <div className={`mt-2 text-2xl font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>
              {s.value.toLocaleString()}
            </div>
            <div className={`mt-0.5 text-2xs font-semibold uppercase tracking-wide ${ink ? 'text-on-ink-muted' : 'text-subtle'}`}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3c. SpaceQuickLinks -- an operator-authored list of labeled jump links (book, menu,
// socials, ...). Pure operator content; empty rows are dropped, and the block renders
// nothing on the live page when there are no valid links.
// ─────────────────────────────────────────────────────────────────────────────

type QuickLink = { label?: string; href?: string }

export function SpaceQuickLinksBlock({
  eyebrow,
  heading,
  links,
  ink,
}: {
  eyebrow?: string
  heading?: string
  links: QuickLink[]
  ink?: boolean
}) {
  const shown = links.filter((l) => (l.label || '').trim() && (l.href || '').trim())
  if (shown.length === 0) {
    return (
      <div>
        <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
        <EditorStub label="Quick links" hint="Add labeled links to booking, menus, or socials" />
      </div>
    )
  }
  const external = (href: string) => /^https?:\/\//i.test(href)
  return (
    <InfoCard ink={ink}>
      <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
      <ul className="grid gap-2 sm:grid-cols-2">
        {shown.map((l, i) => {
          const href = (l.href as string).trim()
          const isExt = external(href)
          return (
            <li key={i}>
              <a
                href={href}
                {...(isExt ? { target: '_blank', rel: 'noreferrer' } : {})}
                className={`group flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                  ink
                    ? 'border-white/10 bg-white/5 text-on-ink hover:bg-white/10'
                    : 'border-border/60 bg-surface/60 text-text hover:border-primary/40 hover:bg-primary-bg/20'
                }`}
              >
                <span className="min-w-0 truncate">{(l.label as string).trim()}</span>
                <ArrowUpRight
                  className={`h-4 w-4 shrink-0 ${ink ? 'text-primary' : 'text-primary-strong'}`}
                  aria-hidden
                />
              </a>
            </li>
          )
        })}
      </ul>
    </InfoCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3d. SpaceEvents -- the Space's UPCOMING events, live off metadata (listEventsForSpace).
// Operator sets a title + a max count; HONEST-empty when the Space has no upcoming events
// (renders nothing on the live page, a placeholder in the editor).
// ─────────────────────────────────────────────────────────────────────────────

export function SpaceEventsBlock({
  eyebrow,
  heading,
  events,
  max,
  ink,
}: {
  eyebrow?: string
  heading?: string
  events: SpaceEventItem[]
  max: number
  ink?: boolean
}) {
  const shown = events.slice(0, Math.max(1, max))
  if (shown.length === 0) return null
  return (
    <InfoCard ink={ink}>
      <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
      <ul className="space-y-3">
        {shown.map((e) => {
          const d = new Date(e.startsAt)
          const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
          const day = d.getDate()
          const when = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          return (
            <li key={e.id}>
              <Link
                href={`/events/${e.slug}`}
                className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition-colors ${
                  ink ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-border/60 bg-surface/60 hover:border-primary/40'
                }`}
              >
                <span
                  className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ${
                    ink ? 'bg-white/10' : 'bg-primary-bg'
                  }`}
                >
                  <span className={`text-3xs font-bold leading-none ${ink ? 'text-primary' : 'text-primary-strong'}`}>{month}</span>
                  <span className={`text-base font-bold leading-tight ${ink ? 'text-on-ink' : 'text-primary-strong'}`}>{day}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>{e.title}</span>
                  <span className={`block text-2xs ${ink ? 'text-on-ink-muted' : 'text-subtle'}`}>{when}</span>
                </span>
                <Calendar className={`h-4 w-4 shrink-0 ${ink ? 'text-primary' : 'text-primary-strong'}`} aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
    </InfoCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3f. SpacePractices -- the Space's LIVE practices + journeys (block parity with the
// entity-practices module). Reads both lists off metadata (listPracticesForSpace +
// listJourneyPlansForSpace); renders "Practices to start" and "Journeys to begin" as
// linked card rows. HONEST-empty: a group with no rows is dropped, and the whole block
// renders nothing on the live page when the Space has neither.
// ─────────────────────────────────────────────────────────────────────────────

/** One linked practice/journey row: an emoji chip, the title + summary, and an optional adopted count. */
function PracticeRow({ item, hrefBase, fallbackEmoji, ink }: { item: SpacePracticeItem; hrefBase: string; fallbackEmoji: string; ink?: boolean }) {
  return (
    <li>
      <Link
        href={`/${hrefBase}/${item.slug}`}
        className={`flex items-start gap-4 rounded-xl border px-4 py-3 transition-colors ${
          ink ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-border/60 bg-surface/60 hover:border-primary/40'
        }`}
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${ink ? 'bg-white/10' : 'bg-primary-bg'}`}
          aria-hidden
        >
          {item.emoji || fallbackEmoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>{item.title}</span>
          {item.summary && (
            <span className={`mt-0.5 block line-clamp-2 text-2xs ${ink ? 'text-on-ink-muted' : 'text-subtle'}`}>{item.summary}</span>
          )}
          {item.adoptCount > 0 && (
            <span className={`mt-1 block text-3xs font-semibold uppercase tracking-wide ${ink ? 'text-on-ink-muted' : 'text-subtle'}`}>
              {item.adoptCount.toLocaleString()} adopted
            </span>
          )}
        </span>
      </Link>
    </li>
  )
}

export function SpacePracticesBlock({
  eyebrow,
  heading,
  practicesHeading,
  journeysHeading,
  data,
  ink,
}: {
  eyebrow?: string
  heading?: string
  practicesHeading?: string
  journeysHeading?: string
  data: SpacePracticesData
  ink?: boolean
}) {
  const practices = data.practices ?? []
  const journeys = data.journeys ?? []
  if (practices.length === 0 && journeys.length === 0) return null
  return (
    <InfoCard ink={ink}>
      <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
      <div className="space-y-6">
        {practices.length > 0 && (
          <div>
            {practicesHeading && (
              <h3 className={`mb-3 inline-flex items-center gap-2 text-sm font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>
                <Sparkles className={`h-4 w-4 ${ink ? 'text-primary' : 'text-primary-strong'}`} aria-hidden />
                {practicesHeading}
              </h3>
            )}
            <ul className="space-y-3">
              {practices.map((p) => (
                <PracticeRow key={p.id} item={p} hrefBase="practices" fallbackEmoji="🌀" ink={ink} />
              ))}
            </ul>
          </div>
        )}
        {journeys.length > 0 && (
          <div>
            {journeysHeading && (
              <h3 className={`mb-3 inline-flex items-center gap-2 text-sm font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>
                <Route className={`h-4 w-4 ${ink ? 'text-primary' : 'text-primary-strong'}`} aria-hidden />
                {journeysHeading}
              </h3>
            )}
            <ul className="space-y-3">
              {journeys.map((j) => (
                <PracticeRow key={j.id} item={j} hrefBase="journeys" fallbackEmoji="🧭" ink={ink} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </InfoCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3g. SpaceCommunity -- the Space's LIVE Circles (block parity with the entity-community
// module). Reads the active circles off metadata (listCirclesForSpace); renders each as a
// linked card with its member count. HONEST-empty: nothing on the live page when the Space
// runs no active circles.
// ─────────────────────────────────────────────────────────────────────────────

export function SpaceCommunityBlock({
  eyebrow,
  heading,
  circles,
  ink,
}: {
  eyebrow?: string
  heading?: string
  circles: SpaceCircleItem[]
  ink?: boolean
}) {
  if (circles.length === 0) return null
  return (
    <InfoCard ink={ink}>
      <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {circles.map((c) => (
          <li key={c.id}>
            <Link
              href={`/circles/${c.slug}`}
              className={`flex h-full flex-col rounded-xl border px-4 py-3 transition-colors ${
                ink ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-border/60 bg-surface/60 hover:border-primary/40'
              }`}
            >
              <span className={`truncate text-sm font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>{c.name}</span>
              {c.about && (
                <span className={`mt-1 line-clamp-2 text-2xs ${ink ? 'text-on-ink-muted' : 'text-subtle'}`}>{c.about}</span>
              )}
              <span className={`mt-2 inline-flex items-center gap-1.5 text-2xs font-semibold ${ink ? 'text-on-ink-muted' : 'text-subtle'}`}>
                <Users className={`h-3.5 w-3.5 ${ink ? 'text-primary' : 'text-primary-strong'}`} aria-hidden />
                {c.memberCount.toLocaleString()} {c.memberCount === 1 ? 'member' : 'members'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </InfoCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3e. SpaceBooking -- a booking entry card. Reads the Space's booking capability off
// metadata: when the Space publishes availability it surfaces a plain "book a time" CTA to
// the book tab; when booking is off it renders NOTHING on the live page (honest, never an
// empty promise). The editor shows a placeholder either way so the operator can place it.
// ─────────────────────────────────────────────────────────────────────────────

export function SpaceBookingBlock({
  heading,
  body,
  ctaLabel,
  booking,
  ink,
  accent,
}: {
  heading?: string
  body?: string
  ctaLabel?: string
  booking?: SpaceBookingInfo
  ink?: boolean
  accent?: boolean
}) {
  // Honest: without a live booking capability (availability published), render nothing on the page.
  if (!booking?.enabled || !booking.href) return null
  return (
    <InfoCard ink={ink} className={accent && !ink ? 'border-primary/30 bg-primary-bg/30' : ''}>
      <div className="flex items-start gap-4">
        <span className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${ink ? 'bg-white/10 text-primary' : 'bg-primary-bg text-primary-strong'}`}>
          <CalendarCheck className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          {heading && <h2 className={`text-lg font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>{heading}</h2>}
          {body && <p className={`mt-1 text-sm leading-relaxed ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>{body}</p>}
          <div className="mt-4">
            <CtaButton href={booking.href} label={ctaLabel || 'Book a time'} variant="primary" onInk={ink} withArrow />
          </div>
        </div>
      </div>
    </InfoCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SpaceOfferings -- the services the space provides, as a card grid. Operator
// authored (title + blurb per card); the editor placeholder shows when empty.
// ─────────────────────────────────────────────────────────────────────────────

type OfferingItem = { title?: string; blurb?: string }

export function SpaceOfferingsBlock({
  eyebrow,
  heading,
  items,
  ink,
}: {
  eyebrow?: string
  heading?: string
  items: OfferingItem[]
  ink?: boolean
}) {
  const shown = items.filter((o) => o.title || o.blurb)
  return (
    <div>
      <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
      {shown.length === 0 ? (
        <EditorStub label="Offerings" hint="Add the services this space provides" />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {shown.map((o, i) => (
            <InfoCard key={i} ink={ink}>
              {o.title && <h3 className={`text-base font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>{o.title}</h3>}
              {o.blurb && (
                <p className={`mt-2 text-sm leading-relaxed ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>{o.blurb}</p>
              )}
            </InfoCard>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SpaceContact -- contact + hours as an info card (address, hours, phone, email,
// links). Simple: a static-map link, never a heavy embedded map.
// ─────────────────────────────────────────────────────────────────────────────

export function SpaceContactBlock({
  eyebrow,
  heading,
  address,
  hours,
  phone,
  email,
  linkLabel,
  linkHref,
  ink,
}: {
  eyebrow?: string
  heading?: string
  address?: string
  hours?: string
  phone?: string
  email?: string
  linkLabel?: string
  linkHref?: string
  ink?: boolean
}) {
  const rows: { icon: React.ReactNode; text: React.ReactNode }[] = []
  if (address) {
    const mapHref = `https://maps.google.com/?q=${encodeURIComponent(address)}`
    rows.push({
      icon: <MapPin className="h-4 w-4" aria-hidden />,
      text: (
        <a href={mapHref} className="hover:underline" target="_blank" rel="noreferrer">
          {address}
        </a>
      ),
    })
  }
  if (hours) rows.push({ icon: <Clock className="h-4 w-4" aria-hidden />, text: hours })
  if (phone) rows.push({ icon: <Phone className="h-4 w-4" aria-hidden />, text: <a href={`tel:${phone}`} className="hover:underline">{phone}</a> })
  if (email) rows.push({ icon: <Mail className="h-4 w-4" aria-hidden />, text: <a href={`mailto:${email}`} className="hover:underline">{email}</a> })
  if (linkHref) rows.push({ icon: <Link2 className="h-4 w-4" aria-hidden />, text: <a href={linkHref} className="hover:underline" target="_blank" rel="noreferrer">{linkLabel || linkHref}</a> })

  if (rows.length === 0) {
    return (
      <div>
        <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
        <EditorStub label="Contact" hint="Add an address, hours, and how to reach you" />
      </div>
    )
  }
  return (
    <InfoCard ink={ink}>
      <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={i} className={`flex items-start gap-3 text-sm ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>
            <span className={`mt-0.5 shrink-0 ${ink ? 'text-primary' : 'text-primary-strong'}`}>{r.icon}</span>
            <span className="min-w-0 break-words">{r.text}</span>
          </li>
        ))}
      </ul>
    </InfoCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SpaceTeam -- the people, as avatar cards. Operator authored (name + role per
// person); the editor placeholder shows when empty.
// ─────────────────────────────────────────────────────────────────────────────

type TeamMember = { name?: string; role?: string; avatar?: string }

export function SpaceTeamBlock({
  eyebrow,
  heading,
  members,
  ink,
}: {
  eyebrow?: string
  heading?: string
  members: TeamMember[]
  ink?: boolean
}) {
  const shown = members.filter((m) => m.name || m.role)
  return (
    <div>
      <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
      {shown.length === 0 ? (
        <EditorStub label="Team" hint="Introduce the people behind this space" />
      ) : (
        <div className="grid gap-5 grid-cols-2 sm:grid-cols-3">
          {shown.map((m, i) => (
            <InfoCard key={i} ink={ink} className="text-center">
              {m.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- operator-supplied avatar URL
                <img src={m.avatar} alt="" className="mx-auto h-16 w-16 rounded-full object-cover" />
              ) : (
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-surface-elevated text-lg font-bold text-subtle">
                  {getInitials(m.name || '')}
                </span>
              )}
              {m.name && <div className={`mt-3 text-sm font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>{m.name}</div>}
              {m.role && <div className={`text-2xs ${ink ? 'text-on-ink-muted' : 'text-subtle'}`}>{m.role}</div>}
            </InfoCard>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. SpaceCTA -- a tasteful conversion band (a card with a headline + one button),
// NOT a full-bleed marketing hero.
// ─────────────────────────────────────────────────────────────────────────────

export function SpaceCTABlock({
  heading,
  body,
  ctaLabel,
  ctaHref,
  ink,
  accent,
}: {
  heading?: string
  body?: string
  ctaLabel?: string
  ctaHref?: string
  ink?: boolean
  accent?: boolean
}) {
  if (!heading && !ctaLabel) return null
  return (
    <InfoCard ink={ink} className={`text-center${accent ? ' border-primary/30 bg-primary-bg/30' : ''}`}>
      {heading && <h2 className={`text-xl font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>{heading}</h2>}
      {body && <p className={`mx-auto mt-2 max-w-xl text-sm leading-relaxed ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>{body}</p>}
      {ctaLabel && (
        <div className="mt-5 flex justify-center">
          <CtaButton href={ctaHref || '#'} label={ctaLabel} variant="primary" onInk={ink} withArrow />
        </div>
      )}
    </InfoCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared field atoms for the operator-authored list blocks.
// ─────────────────────────────────────────────────────────────────────────────

const offeringArrayField = {
  type: 'array' as const,
  label: 'Offerings',
  arrayFields: {
    title: { type: 'text' as const, label: 'Title' },
    blurb: { type: 'textarea' as const, label: 'Short blurb' },
  },
  defaultItemProps: { title: '', blurb: '' },
}

const teamArrayField = {
  type: 'array' as const,
  label: 'People',
  arrayFields: {
    name: { type: 'text' as const, label: 'Name' },
    role: { type: 'text' as const, label: 'Role' },
    // Loom-backed: an avatar is picked from (or uploaded into) the shared Loom, so it is catalogued
    // and resolves through the Loom the same way everywhere.
    avatar: loomSquareImageField,
  },
  defaultItemProps: { name: '', role: '', avatar: '' },
}

// The operator-authored stat picker: an ordered list of chosen metrics + optional label overrides.
const statChoiceArrayField = {
  type: 'array' as const,
  label: 'Metrics',
  arrayFields: {
    metric: {
      type: 'select' as const,
      label: 'Metric',
      options: [
        { label: 'Members', value: 'members' },
        { label: 'Clients', value: 'clients' },
        { label: 'Offerings', value: 'offerings' },
        { label: 'Upcoming sessions', value: 'sessions' },
        { label: 'Practices', value: 'practices' },
        { label: 'Circles', value: 'circles' },
      ],
    },
    label: { type: 'text' as const, label: 'Label override (optional)' },
  },
  defaultItemProps: { metric: 'members', label: '' },
}

// The operator-authored quick-links list (label + href per row).
const quickLinkArrayField = {
  type: 'array' as const,
  label: 'Links',
  arrayFields: {
    label: { type: 'text' as const, label: 'Label' },
    href: { type: 'text' as const, label: 'URL' },
  },
  defaultItemProps: { label: '', href: '' },
}

// ─────────────────────────────────────────────────────────────────────────────
// SpaceLayout -- the FB-business-page region shell. Two slots (main + side) laid out
// as a boxed two-column grid (or a single stacked column), so the profile reads like a
// Facebook business page: an identity header on top, then clean boxed cards arranged in
// a main column with a narrow side rail. Pure presentation; the operator drags the card
// blocks into the slots. On mobile the grid collapses to one column.
// ─────────────────────────────────────────────────────────────────────────────

type SlotComponent = React.ComponentType<Record<string, never>>

function SpaceLayoutRegion({
  layout,
  sideSticky,
  Main,
  Side,
}: {
  layout: string
  sideSticky: boolean
  Main: SlotComponent
  Side: SlotComponent
}) {
  // ONE standardized vertical rhythm for the profile blocks so the page breathes evenly:
  //  - `py-12 sm:py-16` seats the block region generously below the layout-owned header and above the
  //    page foot.
  //  - `SPACE_STACK` (space-y-12) is the SINGLE inter-block margin, used identically in the stacked
  //    column, the main column, and the side rail, so no two gaps disagree.
  //  - the two-column grid gap MATCHES that rhythm (gap-12) so the cross-axis and main-axis read even.
  const SPACE_STACK = 'space-y-12'
  if (layout === 'stacked') {
    return (
      <section className="w-full py-12 sm:py-16">
        <div className={SPACE_STACK}>
          <Main />
        </div>
      </section>
    )
  }
  const sideFirst = layout === 'side-main'
  const asideClass = [
    SPACE_STACK,
    sideFirst ? 'lg:order-first' : '',
    sideSticky ? 'lg:sticky lg:top-24 lg:self-start' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <section className="w-full py-12 sm:py-16">
      <div className="grid gap-12 lg:grid-cols-3">
        <div className={`${SPACE_STACK} lg:col-span-2`}>
          <Main />
        </div>
        <aside className={asideClass}>
          <Side />
        </aside>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ComponentConfig map -- exported as profileComponents
// ─────────────────────────────────────────────────────────────────────────────

export const profileComponents: Record<string, ComponentConfig> = {
  SpaceLayout: {
    label: 'Layout box (main + side)',
    fields: {
      layout: {
        type: 'select',
        label: 'Layout',
        options: [
          { label: 'Main + side', value: 'main-side' },
          { label: 'Side + main', value: 'side-main' },
          { label: 'Single column', value: 'stacked' },
        ],
      },
      sideSticky: {
        type: 'radio',
        label: 'Sticky side',
        options: [
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' },
        ],
      },
      main: { type: 'slot' },
      side: { type: 'slot' },
    },
    defaultProps: {
      layout: 'main-side',
      sideSticky: 'no',
      main: [],
      side: [],
    },
    render: ({ layout, sideSticky, main: Main, side: Side }) => (
      <SpaceLayoutRegion
        layout={layout as string}
        sideSticky={sideSticky === 'yes'}
        Main={Main as SlotComponent}
        Side={Side as SlotComponent}
      />
    ),
  },

  SpaceIdentityHeader: {
    label: 'Identity header (cover + logo)',
    fields: {
      style: {
        type: 'radio',
        label: 'Style',
        options: [
          { label: 'Header', value: 'header' },
          { label: 'Hero', value: 'hero' },
        ],
      },
      coverOverride: { ...loomImageField, label: 'Cover override (optional)' },
      logoOverride: { ...loomSquareImageField, label: 'Logo override (optional)' },
      focal: {
        type: 'select',
        label: 'Cover focal point',
        options: [
          { label: 'Center', value: 'center' },
          { label: 'Top', value: 'top' },
          { label: 'Bottom', value: 'bottom' },
        ],
      },
      height: {
        type: 'select',
        label: 'Cover height',
        options: [
          { label: 'Short', value: 'short' },
          { label: 'Medium', value: 'medium' },
          { label: 'Tall', value: 'tall' },
        ],
      },
      showFollow: {
        type: 'radio',
        label: 'Show follow',
        options: [
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' },
        ],
      },
    },
    defaultProps: {
      style: 'header',
      coverOverride: '',
      logoOverride: '',
      focal: 'center',
      height: 'medium',
      showFollow: 'yes',
    },
    render: ({ style, coverOverride, logoOverride, focal, height, showFollow, puck }) => {
      const identity = identityFrom(puck)
      if (!identity) {
        return <div className="w-full pt-4"><EditorStub label="Identity header" hint="The space cover, logo, and name show on the live page" /></div>
      }
      return (
        <SpaceIdentityHeaderBlock
          identity={identity}
          style={style as string}
          coverOverride={(coverOverride as string) || undefined}
          logoOverride={(logoOverride as string) || undefined}
          focal={focal as string}
          height={height as string}
          showFollow={showFollow === 'yes'}
        />
      )
    },
  },

  SpaceAbout: {
    label: 'About card',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      heading: { type: 'text', label: 'Heading' },
      body: { type: 'textarea', label: 'Story' },
    },
    defaultProps: {
      eyebrow: 'About',
      heading: 'Our story',
      body: 'Tell people who you are and what to expect.',
    },
    render: ({ eyebrow, heading, body }) => (
      <SpaceAboutBlock
        eyebrow={(eyebrow as string) || undefined}
        heading={(heading as string) || undefined}
        body={(body as string) || undefined}
      />
    ),
  },

  SpaceHighlights: {
    label: 'Highlights (live)',
    fields: {},
    defaultProps: {},
    render: ({ puck }) => {
      const highlights = highlightsFrom(puck)
      return highlights.length > 0 ? (
        <SpaceHighlightsBlock highlights={highlights} />
      ) : (
        <EditorStub label="Highlights" hint="Your live counts show on the live page" />
      )
    },
  },

  SpaceStats: {
    label: 'Stats (live, choose metrics)',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      heading: { type: 'text', label: 'Heading (optional)' },
      metrics: statChoiceArrayField,
    },
    defaultProps: {
      eyebrow: '',
      heading: 'By the numbers',
      metrics: [
        { metric: 'members', label: '' },
        { metric: 'offerings', label: '' },
        { metric: 'sessions', label: '' },
      ],
    },
    render: ({ eyebrow, heading, metrics, puck }) => {
      const stats = statsFrom(puck)
      const choices = (metrics as StatChoice[]) ?? []
      // In the editor (no metadata) show a placeholder; on the live page render the honest, resolved set.
      if (stats.length === 0) {
        return (
          <div>
            <CardTitle eyebrow={(eyebrow as string) || undefined} heading={(heading as string) || undefined} />
            <EditorStub label="Stats" hint="Your chosen live counts show on the live page" />
          </div>
        )
      }
      return (
        <SpaceStatsBlock
          eyebrow={(eyebrow as string) || undefined}
          heading={(heading as string) || undefined}
          choices={choices}
          stats={stats}
        />
      )
    },
  },

  SpaceQuickLinks: {
    label: 'Quick links',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      heading: { type: 'text', label: 'Heading (optional)' },
      links: quickLinkArrayField,
    },
    defaultProps: {
      eyebrow: '',
      heading: 'Quick links',
      links: [],
    },
    render: ({ eyebrow, heading, links }) => (
      <SpaceQuickLinksBlock
        eyebrow={(eyebrow as string) || undefined}
        heading={(heading as string) || undefined}
        links={(links as QuickLink[]) ?? []}
      />
    ),
  },

  SpaceEvents: {
    label: 'Upcoming events (live)',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      heading: { type: 'text', label: 'Heading' },
      max: {
        type: 'select',
        label: 'How many to show',
        options: [
          { label: 'Up to 3', value: '3' },
          { label: 'Up to 5', value: '5' },
          { label: 'Up to 8', value: '8' },
        ],
      },
    },
    defaultProps: {
      eyebrow: 'On the calendar',
      heading: 'Upcoming events',
      max: '5',
    },
    render: ({ eyebrow, heading, max, puck }) => {
      const events = eventsFrom(puck)
      if (events.length === 0) {
        return (
          <div>
            <CardTitle eyebrow={(eyebrow as string) || undefined} heading={(heading as string) || undefined} />
            <EditorStub label="Upcoming events" hint="Your upcoming events show on the live page" />
          </div>
        )
      }
      return (
        <SpaceEventsBlock
          eyebrow={(eyebrow as string) || undefined}
          heading={(heading as string) || undefined}
          events={events}
          max={Number(max) || 5}
        />
      )
    },
  },

  SpacePractices: {
    label: 'Practices + journeys (live)',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      heading: { type: 'text', label: 'Heading (optional)' },
      practicesHeading: { type: 'text', label: 'Practices label' },
      journeysHeading: { type: 'text', label: 'Journeys label' },
    },
    defaultProps: {
      eyebrow: 'Start here',
      heading: 'Practices and journeys',
      practicesHeading: 'Practices to start',
      journeysHeading: 'Journeys to begin',
    },
    render: ({ eyebrow, heading, practicesHeading, journeysHeading, puck }) => {
      const data = practicesFrom(puck)
      // Editor (no metadata) shows a placeholder; the live page renders nothing when there are none.
      if (!data) {
        return (
          <div>
            <CardTitle eyebrow={(eyebrow as string) || undefined} heading={(heading as string) || undefined} />
            <EditorStub label="Practices and journeys" hint="This space's practices and journeys show on the live page" />
          </div>
        )
      }
      return (
        <SpacePracticesBlock
          eyebrow={(eyebrow as string) || undefined}
          heading={(heading as string) || undefined}
          practicesHeading={(practicesHeading as string) || undefined}
          journeysHeading={(journeysHeading as string) || undefined}
          data={data}
        />
      )
    },
  },

  SpaceCommunity: {
    label: 'Circles (live)',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      heading: { type: 'text', label: 'Heading (optional)' },
    },
    defaultProps: {
      eyebrow: 'Community',
      heading: 'Circles',
    },
    render: ({ eyebrow, heading, puck }) => {
      const circles = communityFrom(puck)
      // Editor (no metadata) shows a placeholder; the live page renders nothing when there are none.
      if (!circles) {
        return (
          <div>
            <CardTitle eyebrow={(eyebrow as string) || undefined} heading={(heading as string) || undefined} />
            <EditorStub label="Circles" hint="This space's circles show on the live page" />
          </div>
        )
      }
      return (
        <SpaceCommunityBlock
          eyebrow={(eyebrow as string) || undefined}
          heading={(heading as string) || undefined}
          circles={circles}
        />
      )
    },
  },

  SpaceBooking: {
    label: 'Booking call to action',
    fields: {
      heading: { type: 'text', label: 'Heading' },
      body: { type: 'textarea', label: 'Body (optional)' },
      ctaLabel: { type: 'text', label: 'Button label' },
      accent: {
        type: 'radio',
        label: 'Accent surface',
        options: [
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' },
        ],
      },
    },
    defaultProps: {
      heading: 'Book a time',
      body: 'Pick a slot that works for you and reserve it in a couple of taps.',
      ctaLabel: 'Book a time',
      accent: 'yes',
    },
    render: ({ heading, body, ctaLabel, accent, puck }) => {
      const booking = bookingFrom(puck)
      // Editor (no metadata) shows a placeholder; the live page renders nothing when booking is off.
      if (!booking) {
        return (
          <EditorStub label="Booking" hint="Shows a booking button when this space is taking bookings" />
        )
      }
      return (
        <SpaceBookingBlock
          heading={(heading as string) || undefined}
          body={(body as string) || undefined}
          ctaLabel={(ctaLabel as string) || undefined}
          booking={booking}
          accent={accent === 'yes'}
        />
      )
    },
  },

  SpaceOfferings: {
    label: 'Offerings grid',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      heading: { type: 'text', label: 'Heading' },
      items: offeringArrayField,
    },
    defaultProps: {
      eyebrow: 'What we offer',
      heading: 'Offerings',
      items: [],
    },
    render: ({ eyebrow, heading, items }) => (
      <SpaceOfferingsBlock
        eyebrow={(eyebrow as string) || undefined}
        heading={(heading as string) || undefined}
        items={(items as OfferingItem[]) ?? []}
      />
    ),
  },

  SpaceContact: {
    label: 'Contact + hours',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      heading: { type: 'text', label: 'Heading' },
      address: { type: 'text', label: 'Address' },
      hours: { type: 'textarea', label: 'Hours' },
      phone: { type: 'text', label: 'Phone' },
      email: { type: 'text', label: 'Email' },
      linkLabel: { type: 'text', label: 'Link label' },
      linkHref: { type: 'text', label: 'Link URL' },
    },
    defaultProps: {
      eyebrow: 'Find us',
      heading: 'Contact',
      address: '',
      hours: '',
      phone: '',
      email: '',
      linkLabel: '',
      linkHref: '',
    },
    render: ({ eyebrow, heading, address, hours, phone, email, linkLabel, linkHref }) => (
      <SpaceContactBlock
        eyebrow={(eyebrow as string) || undefined}
        heading={(heading as string) || undefined}
        address={(address as string) || undefined}
        hours={(hours as string) || undefined}
        phone={(phone as string) || undefined}
        email={(email as string) || undefined}
        linkLabel={(linkLabel as string) || undefined}
        linkHref={(linkHref as string) || undefined}
      />
    ),
  },

  SpaceTeam: {
    label: 'Team',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      heading: { type: 'text', label: 'Heading' },
      members: teamArrayField,
    },
    defaultProps: {
      eyebrow: 'The people',
      heading: 'Meet the team',
      members: [],
    },
    render: ({ eyebrow, heading, members }) => (
      <SpaceTeamBlock
        eyebrow={(eyebrow as string) || undefined}
        heading={(heading as string) || undefined}
        members={(members as TeamMember[]) ?? []}
      />
    ),
  },

  SpaceCTA: {
    label: 'Call to action card',
    fields: {
      heading: { type: 'text', label: 'Heading' },
      body: { type: 'textarea', label: 'Body (optional)' },
      ctaLabel: { type: 'text', label: 'Button label' },
      ctaHref: { type: 'text', label: 'Button link' },
      accent: {
        type: 'radio',
        label: 'Accent surface',
        options: [
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' },
        ],
      },
    },
    defaultProps: {
      heading: 'Ready when you are',
      body: '',
      ctaLabel: 'Get started',
      ctaHref: '#',
      accent: 'no',
    },
    render: ({ heading, body, ctaLabel, ctaHref, accent }) => (
      <SpaceCTABlock
        heading={(heading as string) || undefined}
        body={(body as string) || undefined}
        ctaLabel={(ctaLabel as string) || undefined}
        ctaHref={(ctaHref as string) || undefined}
        accent={accent === 'yes'}
      />
    ),
  },
}
