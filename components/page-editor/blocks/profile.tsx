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
  Globe,
  Video,
  Star,
} from 'lucide-react'
import type { ComponentConfig } from '@/lib/page-editor/types'

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
// PURE + client-safe (no server imports): the central profile data type + the central-wins merge.
import {
  mergeField,
  formatServicePrice,
  formatServiceDuration,
  formatServiceDeposit,
  formatServicePackage,
  isServiceListed,
  type SpaceOffering,
  type SpaceProfileData,
  type SpaceSocialLink,
} from '@/lib/spaces/profile-data'

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
// The CENTRAL business info + story (single source of truth). Blocks read this off metadata and merge
// it OVER their own inline props (mergeField: central wins), so editing the Business Info form once
// updates every block + surface. Undefined in the editor / a member Spotlight (blocks use their props).
function profileFrom(puck: PuckArg): SpaceProfileData | undefined {
  const space = puck?.metadata?.space as { profile?: SpaceProfileData } | undefined
  return space?.profile
}

// Shown ONLY in the editor canvas so an unfilled authored section stays visible + draggable there.
// The LIVE page never shows a stub: an empty section renders nothing (the config renders gate on
// `puck.isEditing`), so a visitor never meets a dashed "add your content" box.
function EditorStub({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-12 text-center text-sm text-muted">
      {label}
      <span className="mt-1 block text-2xs text-subtle">{hint}</span>
    </div>
  )
}

// The ANCHOR seam for the pre-populated profile menu: each section-level block renders inside a
// <section id> so the chrome's derived menu (lib/spaces/section-anchors.ts) can deep-link to it.
// `scroll-mt` clears BOTH the global header AND the sticky profile sub-nav pinned beneath it on jump,
// so an anchored section lands just below the persistent menu (which stays in view) rather than hidden
// under it; `empty:hidden` collapses the wrapper when the block renders nothing (honest-empty), so a
// hidden section never leaves a phantom gap in the stack.
function AnchorSection({ anchor, children }: { anchor: string; children: React.ReactNode }) {
  return (
    <section id={anchor} className="scroll-mt-36 empty:hidden">
      {children}
    </section>
  )
}

// One consistent card shell every Profile info card composes, so the set reads as ONE kit (matched
// radius, surface, padding). SOLID: a real surface with a full border and a soft shadow, so each
// section reads as a deliberate, well-defined card that stands off the canvas (the old hairline
// translucent treatment washed out and read as cramped). `ink` swaps to the dark-band treatment for
// legibility. One radius/spacing/elevation rhythm across the whole set.
function InfoCard({ children, ink, className = '' }: { children: React.ReactNode; ink?: boolean; className?: string }) {
  return (
    <div
      className={`rounded-2xl border ${ink ? 'border-white/10 bg-white/5' : 'border-border bg-surface shadow-sm'} p-6 sm:p-8 ${className}`}
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
    <div className="mb-6">
      {eyebrow && (
        <p className={`text-2xs font-bold uppercase tracking-[0.2em] ${ink ? 'text-primary' : 'text-primary-strong'}`}>
          {eyebrow}
        </p>
      )}
      {heading && (
        <h2 className={`mt-1.5 text-xl font-bold tracking-tight sm:text-2xl ${ink ? 'text-on-ink' : 'text-text'}`}>
          {heading}
        </h2>
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
  editing,
}: {
  eyebrow?: string
  heading?: string
  body?: string
  ink?: boolean
  /** Editor canvas only: keep an unfilled section visible + draggable there. */
  editing?: boolean
}) {
  // Honest-empty: no story, no card on the LIVE page (a heading over nothing reads as broken to a
  // visitor); the stub keeps the section placeable in the editor.
  if (!body) {
    if (!editing) return null
    return (
      <div>
        <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
        <EditorStub label="About" hint="Tell people who you are and what to expect" />
      </div>
    )
  }
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
  // Social proof reads STRONGER when the strip fills its row: fan to the item count from `sm` up
  // instead of staying locked at two columns on wide viewports (mobile-first single-column pair).
  const cols = shown.length >= 4 ? 'sm:grid-cols-4' : shown.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
  return (
    <div className={`grid grid-cols-2 gap-4 ${cols}`}>
      {shown.map((s) => (
        <div
          key={s.label}
          className={`rounded-2xl border p-6 text-center ${ink ? 'border-white/10 bg-white/5' : 'border-border bg-surface shadow-sm'}`}
        >
          <div className={`text-3xl font-bold tracking-tight ${ink ? 'text-on-ink' : 'text-text'}`}>
            {s.value.toLocaleString()}
          </div>
          <div className={`mt-1.5 text-2xs font-semibold uppercase tracking-wide ${ink ? 'text-on-ink-muted' : 'text-subtle'}`}>
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
            className={`rounded-2xl border p-6 ${ink ? 'border-white/10 bg-white/5' : 'border-border bg-surface shadow-sm'}`}
          >
            <span
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${ink ? 'bg-white/10 text-primary' : 'bg-primary-bg text-primary-strong'}`}
            >
              {STAT_METRIC_META[s.metric]?.icon}
            </span>
            <div className={`mt-3 text-3xl font-bold tracking-tight ${ink ? 'text-on-ink' : 'text-text'}`}>
              {s.value.toLocaleString()}
            </div>
            <div className={`mt-1 text-2xs font-semibold uppercase tracking-wide ${ink ? 'text-on-ink-muted' : 'text-subtle'}`}>
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
  editing,
}: {
  eyebrow?: string
  heading?: string
  links: QuickLink[]
  ink?: boolean
  /** Editor canvas only: keep an unfilled section visible + draggable there. */
  editing?: boolean
}) {
  const shown = links.filter((l) => (l.label || '').trim() && (l.href || '').trim())
  if (shown.length === 0) {
    // Honest-empty on the LIVE page; the stub keeps the section placeable in the editor.
    if (!editing) return null
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
                  ink
                    ? 'border-white/10 bg-white/5 hover:bg-white/10'
                    : 'border-border/60 bg-surface/60 hover:border-primary/40 hover:bg-primary-bg/20'
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
          ink
            ? 'border-white/10 bg-white/5 hover:bg-white/10'
            : 'border-border/60 bg-surface/60 hover:border-primary/40 hover:bg-primary-bg/20'
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
                ink
                  ? 'border-white/10 bg-white/5 hover:bg-white/10'
                  : 'border-border/60 bg-surface/60 hover:border-primary/40 hover:bg-primary-bg/20'
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
    <InfoCard ink={ink} className={accent && !ink ? 'border-primary/25 bg-primary-bg/40' : ''}>
      <div className="flex items-start gap-5">
        <span className={`mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${ink ? 'bg-white/10 text-primary' : 'bg-primary-bg text-primary-strong'}`}>
          <CalendarCheck className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          {heading && (
            <h2 className={`text-xl font-bold tracking-tight ${ink ? 'text-on-ink' : 'text-text'}`}>{heading}</h2>
          )}
          {body && <p className={`mt-1.5 text-sm leading-relaxed ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>{body}</p>}
          <div className="mt-5">
            <CtaButton href={booking.href} label={ctaLabel || 'Book a time'} variant="primary" onInk={ink} withArrow />
          </div>
        </div>
      </div>
    </InfoCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SpaceOfferings -- the services the space provides, rendered as a STOREFRONT
// card grid: each listed service shows its price, duration, deposit, and package,
// on top of the title + blurb. Operator authored; the editor placeholder shows
// when empty. PRIVATE services never render here (they are direct-link only).
// ─────────────────────────────────────────────────────────────────────────────

/** A block-level service item. The central catalog rows are full SpaceOfferings; a legacy inline block
 *  prop is just a { title, blurb }, which coerces cleanly (every pricing field is optional). */
type OfferingItem = Partial<SpaceOffering> & { title?: string; blurb?: string }

export function SpaceOfferingsBlock({
  eyebrow,
  heading,
  items,
  ink,
  editing,
}: {
  eyebrow?: string
  heading?: string
  items: OfferingItem[]
  ink?: boolean
  /** Editor canvas only: keep an unfilled section visible + draggable there. */
  editing?: boolean
}) {
  // Storefront: only LISTED services (visibility unset / 'listed') render publicly; private ones are
  // reachable by direct link only. A row still needs a title or blurb to be worth a card.
  const shown = items.filter((o) => isServiceListed(o as SpaceOffering) && (o.title || o.blurb))
  // Honest-empty on the LIVE page; the stub keeps the section placeable in the editor.
  if (shown.length === 0 && !editing) return null
  return (
    <div>
      <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
      {shown.length === 0 ? (
        <EditorStub label="Offerings" hint="Add the services this space provides" />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {shown.map((o, i) => {
            const price = formatServicePrice(o as SpaceOffering)
            const duration = formatServiceDuration(o.durationMinutes)
            const deposit = formatServiceDeposit(o as SpaceOffering)
            const pkg = formatServicePackage(o as SpaceOffering)
            const meta = [duration, pkg].filter(Boolean)
            return (
              <div
                key={i}
                className={`flex flex-col rounded-2xl border p-6 transition-shadow ${
                  ink ? 'border-white/10 bg-white/5' : 'border-border bg-surface shadow-sm hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {o.title && (
                    <h3 className={`text-lg font-bold tracking-tight ${ink ? 'text-on-ink' : 'text-text'}`}>{o.title}</h3>
                  )}
                  {price && (
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold ${
                        ink ? 'bg-white/10 text-on-ink' : 'bg-primary-bg text-primary-strong'
                      }`}
                    >
                      {price}
                    </span>
                  )}
                </div>
                {meta.length > 0 && (
                  <p className={`mt-1 text-xs font-medium ${ink ? 'text-on-ink-muted' : 'text-subtle'}`}>
                    {meta.join(' · ')}
                  </p>
                )}
                {o.blurb && (
                  <p className={`mt-2 text-sm leading-relaxed ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>{o.blurb}</p>
                )}
                {deposit && (
                  <p className={`mt-auto pt-3 text-xs ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>{deposit}</p>
                )}
              </div>
            )
          })}
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
  editing,
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
  /** Editor canvas only: keep an unfilled section visible + draggable there. */
  editing?: boolean
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
    // Honest-empty on the LIVE page; the stub keeps the section placeable in the editor.
    if (!editing) return null
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
  editing,
}: {
  eyebrow?: string
  heading?: string
  members: TeamMember[]
  ink?: boolean
  /** Editor canvas only: keep an unfilled section visible + draggable there. */
  editing?: boolean
}) {
  const shown = members.filter((m) => m.name || m.role)
  // Honest-empty on the LIVE page; the stub keeps the section placeable in the editor.
  if (shown.length === 0 && !editing) return null
  return (
    <div>
      <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
      {shown.length === 0 ? (
        <EditorStub label="Team" hint="Introduce the people behind this space" />
      ) : (
        <div className="grid gap-6 grid-cols-2 sm:grid-cols-3">
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

// ── SpaceAction: the PLACEABLE ACTION HOOK. A block that surfaces the Space's PRIMARY action (book /
// join / donate / enroll / tickets, by type) as a prominent CTA the operator can drop on ANY page. It
// reads the live primary CTA off metadata (`identity.primaryCta` — the label by type + the reserved
// /book action page href), so it always points at the real transactional surface without importing any
// server/transactional code into the block (build-trap-safe). The operator can override the heading /
// body / button label; unset falls back to the type's default action label.
export function SpaceActionBlock({
  eyebrow,
  heading,
  body,
  ctaLabel,
  href,
  ink,
  accent,
}: {
  eyebrow?: string
  heading?: string
  body?: string
  ctaLabel: string
  href: string
  ink?: boolean
  accent?: boolean
}) {
  return (
    <InfoCard ink={ink} className={`text-center${accent ? ' border-primary/30 bg-primary-bg/30' : ''}`}>
      <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
      {body && (
        <p className={`mx-auto mt-2 max-w-xl text-sm leading-relaxed ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>
          {body}
        </p>
      )}
      <div className="mt-5 flex justify-center">
        <CtaButton href={href} label={ctaLabel} variant="primary" onInk={ink} withArrow />
      </div>
    </InfoCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. SpaceSectionTitle -- a website-style large section title. Standalone titling
// element (eyebrow kicker + big heading + optional lead), distinct from the small
// in-card CardTitle. Use it to break a long page into named chapters. No card, no
// anchor wrapper (it is a heading, not a section). Honest-empty: nothing on the live
// page without a heading; a stub in the editor.
// ─────────────────────────────────────────────────────────────────────────────

export function SpaceSectionTitleBlock({
  eyebrow,
  heading,
  subheading,
  align,
  ink,
  editing,
}: {
  eyebrow?: string
  heading?: string
  subheading?: string
  align?: string
  ink?: boolean
  /** Editor canvas only: keep an unfilled section visible + draggable there. */
  editing?: boolean
}) {
  if (!heading) {
    if (!editing) return null
    return <EditorStub label="Section title" hint="Add a large heading to break the page into chapters" />
  }
  const centered = align === 'center'
  return (
    <div className={centered ? 'text-center' : ''}>
      {eyebrow && (
        <p className={`text-2xs font-bold uppercase tracking-[0.2em] ${ink ? 'text-primary' : 'text-primary-strong'}`}>
          {eyebrow}
        </p>
      )}
      <h2 className={`mt-1.5 text-3xl font-bold tracking-tight sm:text-4xl ${ink ? 'text-on-ink' : 'text-text'}`}>
        {heading}
      </h2>
      {subheading && (
        <p
          className={`mt-3 max-w-2xl text-base leading-relaxed ${centered ? 'mx-auto' : ''} ${
            ink ? 'text-on-ink-muted' : 'text-muted'
          }`}
        >
          {subheading}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. SpaceCallout -- a website-style callout / banner. Bolder than the quiet SpaceCTA
// card: a filled accent band (primary-bg surface, generous padding) with a heading, a
// lead body, and one optional button. Use it as a prominent conversion moment. Honest-
// empty: nothing on the live page without a heading or a button; a stub in the editor.
// ─────────────────────────────────────────────────────────────────────────────

export function SpaceCalloutBlock({
  eyebrow,
  heading,
  body,
  ctaLabel,
  ctaHref,
  align,
  ink,
  editing,
}: {
  eyebrow?: string
  heading?: string
  body?: string
  ctaLabel?: string
  ctaHref?: string
  align?: string
  ink?: boolean
  /** Editor canvas only: keep an unfilled section visible + draggable there. */
  editing?: boolean
}) {
  if (!heading && !ctaLabel) {
    if (!editing) return null
    return <EditorStub label="Callout" hint="Add a bold banner with a heading and a button" />
  }
  const centered = align === 'center'
  return (
    <div
      className={`rounded-2xl border p-8 sm:p-10 ${ink ? 'border-white/15 bg-white/5' : 'border-primary/25 bg-primary-bg'} ${
        centered ? 'text-center' : ''
      }`}
    >
      {eyebrow && (
        <p className={`text-2xs font-bold uppercase tracking-[0.2em] ${ink ? 'text-primary' : 'text-primary-strong'}`}>
          {eyebrow}
        </p>
      )}
      {heading && (
        <h2 className={`mt-1.5 text-2xl font-bold tracking-tight ${ink ? 'text-on-ink' : 'text-text'}`}>{heading}</h2>
      )}
      {body && (
        <p
          className={`mt-3 max-w-2xl text-base leading-relaxed ${centered ? 'mx-auto' : ''} ${
            ink ? 'text-on-ink-muted' : 'text-muted'
          }`}
        >
          {body}
        </p>
      )}
      {ctaLabel && (
        <div className={`mt-6 flex ${centered ? 'justify-center' : ''}`}>
          <CtaButton href={ctaHref || '#'} label={ctaLabel} variant="primary" onInk={ink} withArrow />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. SpaceBusiness -- a "business presence" strip: operator-authored social/business
// links, an optional star rating, and an optional review count, laid out like a
// LinkedIn / Facebook / Yelp business header. Operator-authored (no external API), so
// it stays client-safe. Honest-empty: nothing on the live page without at least one
// valid link or a valid rating; a stub in the editor.
// ─────────────────────────────────────────────────────────────────────────────

type BusinessLink = { platform?: string; url?: string }

// Platform -> proper-noun label + an icon. This lucide build ships no brand marks, so we use neutral
// icons (a globe for web destinations, a play glyph for video, a link for everything else) rather than
// a wrong logo. The proper-noun label carries the platform's identity.
const BUSINESS_PLATFORM_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  website: { label: 'Website', icon: Globe },
  linkedin: { label: 'LinkedIn', icon: Link2 },
  facebook: { label: 'Facebook', icon: Link2 },
  instagram: { label: 'Instagram', icon: Link2 },
  x: { label: 'X', icon: Link2 },
  youtube: { label: 'YouTube', icon: Video },
  tiktok: { label: 'TikTok', icon: Link2 },
  yelp: { label: 'Yelp', icon: Link2 },
  google: { label: 'Google', icon: Globe },
}

export function SpaceBusinessBlock({
  heading,
  rating,
  ratingCount,
  links,
  ink,
  editing,
}: {
  heading?: string
  rating?: string
  ratingCount?: string
  links: BusinessLink[]
  ink?: boolean
  /** Editor canvas only: keep an unfilled section visible + draggable there. */
  editing?: boolean
}) {
  const shownLinks = links.filter((l) => (l.url || '').trim())
  const ratingNum = Number(rating)
  const hasRating = Number.isFinite(ratingNum) && ratingNum > 0
  if (shownLinks.length === 0 && !hasRating) {
    // Honest-empty on the LIVE page; the stub keeps the section placeable in the editor.
    if (!editing) return null
    return (
      <div>
        <CardTitle heading={heading} ink={ink} />
        <EditorStub label="Business presence" hint="Add your social links and an optional rating" />
      </div>
    )
  }
  const filled = Math.round(Math.min(5, Math.max(0, ratingNum)))
  return (
    <InfoCard ink={ink}>
      <CardTitle heading={heading} ink={ink} />
      {hasRating && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <span className={`text-3xl font-bold tracking-tight ${ink ? 'text-on-ink' : 'text-text'}`}>
            {ratingNum.toLocaleString()}
          </span>
          <span className="flex items-center gap-0.5" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-5 w-5 ${
                  i < filled ? 'fill-primary text-primary' : ink ? 'text-white/25' : 'text-border-strong'
                }`}
              />
            ))}
          </span>
          {ratingCount && <span className={`text-sm ${ink ? 'text-on-ink-muted' : 'text-subtle'}`}>{ratingCount}</span>}
        </div>
      )}
      {shownLinks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {shownLinks.map((l, i) => {
            const meta = BUSINESS_PLATFORM_META[l.platform || 'website'] ?? BUSINESS_PLATFORM_META.website
            const Icon = meta.icon
            return (
              <a
                key={i}
                href={(l.url as string).trim()}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                  ink
                    ? 'border-white/10 bg-white/5 text-on-ink hover:bg-white/10'
                    : 'border-border/60 bg-surface/60 text-text hover:border-primary/40 hover:bg-primary-bg/20'
                }`}
              >
                <Icon className={`h-4 w-4 ${ink ? 'text-primary' : 'text-primary-strong'}`} aria-hidden />
                {meta.label}
              </a>
            )
          })}
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

// The operator-authored business/social links list (platform + url per row). Each platform
// maps to a proper-noun label + a brand-appropriate icon at render time.
const businessLinkArrayField = {
  type: 'array' as const,
  label: 'Links',
  arrayFields: {
    platform: {
      type: 'select' as const,
      label: 'Platform',
      options: [
        { label: 'Website', value: 'website' },
        { label: 'LinkedIn', value: 'linkedin' },
        { label: 'Facebook', value: 'facebook' },
        { label: 'Instagram', value: 'instagram' },
        { label: 'X', value: 'x' },
        { label: 'YouTube', value: 'youtube' },
        { label: 'TikTok', value: 'tiktok' },
        { label: 'Yelp', value: 'yelp' },
        { label: 'Google', value: 'google' },
      ],
    },
    url: { type: 'text' as const, label: 'URL' },
  },
  defaultItemProps: { platform: 'website', url: '' },
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
  // The standardized rhythm for the profile blocks:
  //  - NO outer `py` here: the PAGE owns the vertical rhythm now (the config root adds page padding on
  //    space pages), so a SpaceLayout region — whether it wraps the whole page under the `main-rail`
  //    preset or sits mid-flow as an operator block — never double-pads.
  //  - MAIN sections get the generous stack (`space-y-14`): each is a full content section and needs
  //    clear separation to read as its own chapter.
  //  - the SIDE rail gets a tighter stack (`space-y-6`): its cards are compact facts (highlights,
  //    about, contact) that read as one grouped info column, business-page style.
  //  - the two-column grid gap sits between the two (`gap-10 lg:gap-14`) so the columns read distinct.
  const MAIN_STACK = 'space-y-14'
  const SIDE_STACK = 'space-y-6'
  if (layout === 'stacked') {
    return (
      <section className="w-full">
        <div className={MAIN_STACK}>
          <Main />
        </div>
      </section>
    )
  }
  const sideFirst = layout === 'side-main'
  const asideClass = [
    SIDE_STACK,
    sideFirst ? 'lg:order-first' : '',
    sideSticky ? 'lg:sticky lg:top-24 lg:self-start' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <section className="w-full">
      <div className="grid gap-10 lg:grid-cols-3 lg:gap-14">
        <div className={`${MAIN_STACK} lg:col-span-2`}>
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
// SpaceArrangement -- the PRESET-DRIVEN region the layout templates render into
// (lib/spaces/layout-presets.ts applyLayoutPreset). Never placed by hand in the
// palette (it is not listed in a category); the pure display transform wraps a page's
// flat content into ONE of these at render time so a template can arrange the same
// content without ever touching it. Three variants + an optional full-width header row:
//   - main-side    a wide main column (2fr) beside a narrower side rail (1fr).
//   - two-equal    two equal columns.
//   - three-equal  three equal columns.
// The header slot, when present, spans full width above the grid. Pure presentation; the
// blocks live in the slots. On mobile every grid collapses to one column.
// ─────────────────────────────────────────────────────────────────────────────

function SpaceArrangementRegion({
  variant,
  hasHeader,
  sideSticky,
  Header,
  Main,
  Side,
  Col3,
}: {
  variant: string
  hasHeader: boolean
  sideSticky: boolean
  Header: SlotComponent
  Main: SlotComponent
  Side: SlotComponent
  Col3: SlotComponent
}) {
  // Same rhythm scale as SpaceLayoutRegion: MAIN sections get the generous stack, the fact rail a
  // tighter one, equal content columns a middle stack. The page owns the outer vertical rhythm.
  const MAIN_STACK = 'space-y-14'
  const SIDE_STACK = 'space-y-6'
  const COL_STACK = 'space-y-10'

  let grid: React.ReactNode
  if (variant === 'three-equal') {
    grid = (
      <div className="grid gap-10 lg:grid-cols-3 lg:gap-14">
        <div className={COL_STACK}><Main /></div>
        <div className={COL_STACK}><Side /></div>
        <div className={COL_STACK}><Col3 /></div>
      </div>
    )
  } else if (variant === 'two-equal') {
    grid = (
      <div className="grid gap-10 md:grid-cols-2 md:gap-14">
        <div className={COL_STACK}><Main /></div>
        <div className={COL_STACK}><Side /></div>
      </div>
    )
  } else {
    // main-side (2fr : 1fr) with an optional sticky fact rail — the business-page split.
    const asideClass = [SIDE_STACK, sideSticky ? 'lg:sticky lg:top-24 lg:self-start' : '']
      .filter(Boolean)
      .join(' ')
    grid = (
      <div className="grid gap-10 lg:grid-cols-3 lg:gap-14">
        <div className={`${MAIN_STACK} lg:col-span-2`}><Main /></div>
        <aside className={asideClass}><Side /></aside>
      </div>
    )
  }

  return (
    <section className="w-full">
      {hasHeader ? (
        <div className="space-y-12 sm:space-y-14">
          <div className={MAIN_STACK}><Header /></div>
          {grid}
        </div>
      ) : (
        grid
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ComponentConfig map -- exported as profileComponents
// ─────────────────────────────────────────────────────────────────────────────

export const profileComponents: Record<string, ComponentConfig> = {
  // PRESET-ONLY region (see SpaceArrangementRegion). Registered so <Render> can render the template
  // transform's output, but deliberately NOT added to a left-bar category, so it stays out of the
  // operator's block palette.
  SpaceArrangement: {
    label: 'Arranged layout',
    fields: {
      variant: {
        type: 'select',
        label: 'Variant',
        options: [
          { label: 'Main and side', value: 'main-side' },
          { label: 'Two columns', value: 'two-equal' },
          { label: 'Three columns', value: 'three-equal' },
        ],
      },
      hasHeader: {
        type: 'radio',
        label: 'Header row',
        options: [
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' },
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
      header: { type: 'slot' },
      main: { type: 'slot' },
      side: { type: 'slot' },
      col3: { type: 'slot' },
    },
    defaultProps: {
      variant: 'main-side',
      hasHeader: 'no',
      sideSticky: 'no',
      header: [],
      main: [],
      side: [],
      col3: [],
    },
    render: ({ variant, hasHeader, sideSticky, header: Header, main: Main, side: Side, col3: Col3 }) => (
      <SpaceArrangementRegion
        variant={variant as string}
        hasHeader={hasHeader === 'yes'}
        sideSticky={sideSticky === 'yes'}
        Header={Header as SlotComponent}
        Main={Main as SlotComponent}
        Side={Side as SlotComponent}
        Col3={Col3 as SlotComponent}
      />
    ),
  },

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
    render: ({ eyebrow, heading, body, puck }) => (
      <AnchorSection anchor="about">
        <SpaceAboutBlock
          eyebrow={(eyebrow as string) || undefined}
          heading={(heading as string) || undefined}
          // Central story wins (single source): the About body comes from the Business Info form,
          // falling back to this block's own inline copy only when the central story is empty.
          body={mergeField(body as string, profileFrom(puck)?.about)}
          editing={puck?.isEditing}
        />
      </AnchorSection>
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
    render: ({ eyebrow, heading, links, puck }) => (
      <SpaceQuickLinksBlock
        eyebrow={(eyebrow as string) || undefined}
        heading={(heading as string) || undefined}
        links={(links as QuickLink[]) ?? []}
        editing={puck?.isEditing}
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
        // Editor keeps the section placeable; the LIVE page renders nothing (honest-empty).
        if (!puck?.isEditing) return <></>
        return (
          <div>
            <CardTitle eyebrow={(eyebrow as string) || undefined} heading={(heading as string) || undefined} />
            <EditorStub label="Upcoming events" hint="Your upcoming events show on the live page" />
          </div>
        )
      }
      return (
        <AnchorSection anchor="events">
          <SpaceEventsBlock
            eyebrow={(eyebrow as string) || undefined}
            heading={(heading as string) || undefined}
            events={events}
            max={Number(max) || 5}
          />
        </AnchorSection>
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
        <AnchorSection anchor="practices">
          <SpacePracticesBlock
            eyebrow={(eyebrow as string) || undefined}
            heading={(heading as string) || undefined}
            practicesHeading={(practicesHeading as string) || undefined}
            journeysHeading={(journeysHeading as string) || undefined}
            data={data}
          />
        </AnchorSection>
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
        <AnchorSection anchor="community">
          <SpaceCommunityBlock
            eyebrow={(eyebrow as string) || undefined}
            heading={(heading as string) || undefined}
            circles={circles}
          />
        </AnchorSection>
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
        <AnchorSection anchor="book">
          <SpaceBookingBlock
            heading={(heading as string) || undefined}
            body={(body as string) || undefined}
            ctaLabel={(ctaLabel as string) || undefined}
            booking={booking}
            accent={accent === 'yes'}
          />
        </AnchorSection>
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
    render: ({ eyebrow, heading, items, puck }) => {
      // Central services catalog wins (single source): the offerings come from the Business Info form,
      // falling back to this block's own inline items only when the central catalog is empty.
      const centralOfferings = profileFrom(puck)?.offerings as OfferingItem[] | undefined
      const mergedItems: OfferingItem[] =
        centralOfferings && centralOfferings.length > 0 ? centralOfferings : ((items as OfferingItem[]) ?? [])
      return (
        <AnchorSection anchor="offerings">
          <SpaceOfferingsBlock
            eyebrow={(eyebrow as string) || undefined}
            heading={(heading as string) || undefined}
            items={mergedItems}
            editing={puck?.isEditing}
          />
        </AnchorSection>
      )
    },
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
    render: ({ eyebrow, heading, address, hours, phone, email, linkLabel, linkHref, puck }) => {
      // Central business info wins (single source of truth): address / hours / phone / email / website
      // come from the Business Info form, falling back to this block's inline props only when the
      // central field is empty. So editing the address once updates it on the Contact card everywhere.
      const central = profileFrom(puck)
      return (
        <AnchorSection anchor="contact">
          <SpaceContactBlock
            eyebrow={(eyebrow as string) || undefined}
            heading={(heading as string) || undefined}
            address={mergeField(address as string, central?.address)}
            hours={mergeField(hours as string, central?.hours)}
            phone={mergeField(phone as string, central?.phone)}
            email={mergeField(email as string, central?.email)}
            linkLabel={(linkLabel as string) || undefined}
            linkHref={mergeField(linkHref as string, central?.website)}
            editing={puck?.isEditing}
          />
        </AnchorSection>
      )
    },
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
    render: ({ eyebrow, heading, members, puck }) => (
      <AnchorSection anchor="team">
        <SpaceTeamBlock
          eyebrow={(eyebrow as string) || undefined}
          heading={(heading as string) || undefined}
          members={(members as TeamMember[]) ?? []}
          editing={puck?.isEditing}
        />
      </AnchorSection>
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

  // The PLACEABLE ACTION HOOK: surfaces the Space's primary action (book / join / donate / enroll /
  // tickets, by type) anywhere the operator drops it. Reads the live primary CTA off metadata, so it
  // always links to the reserved /book transactional surface with the right per-type label.
  SpaceAction: {
    label: 'Action button',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      heading: { type: 'text', label: 'Heading' },
      body: { type: 'textarea', label: 'Body (optional)' },
      ctaLabel: { type: 'text', label: 'Button label (optional, defaults to your action)' },
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
      eyebrow: '',
      heading: 'Ready when you are',
      body: '',
      ctaLabel: '',
      accent: 'yes',
    },
    render: ({ eyebrow, heading, body, ctaLabel, accent, puck }) => {
      const identity = identityFrom(puck)
      // Editor (no metadata) shows a placeholder; the live page renders the primary action CTA.
      if (!identity) {
        return (
          <EditorStub
            label="Action"
            hint="Shows your primary action button (book, join, donate) anywhere you place it"
          />
        )
      }
      const cta = identity.primaryCta
      return (
        <SpaceActionBlock
          eyebrow={(eyebrow as string) || undefined}
          heading={(heading as string) || undefined}
          body={(body as string) || undefined}
          ctaLabel={(ctaLabel as string) || cta?.label || 'Get started'}
          href={cta?.href || '#'}
          accent={accent === 'yes'}
        />
      )
    },
  },

  // A website-style large section title: a standalone titling element the operator drops in to break a
  // long page into named chapters (distinct from the small in-card CardTitle).
  SpaceSectionTitle: {
    label: 'Section title',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      heading: { type: 'text', label: 'Heading' },
      subheading: { type: 'textarea', label: 'Subheading (optional)' },
      align: {
        type: 'radio',
        label: 'Alignment',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
        ],
      },
    },
    defaultProps: {
      eyebrow: '',
      heading: 'A section title',
      subheading: '',
      align: 'left',
    },
    render: ({ eyebrow, heading, subheading, align, puck }) => (
      <SpaceSectionTitleBlock
        eyebrow={(eyebrow as string) || undefined}
        heading={(heading as string) || undefined}
        subheading={(subheading as string) || undefined}
        align={align as string}
        editing={puck?.isEditing}
      />
    ),
  },

  // A website-style callout / banner: a bold, filled accent band with a heading, a lead, and one
  // optional button. A prominent conversion moment, louder than the quiet SpaceCTA card.
  SpaceCallout: {
    label: 'Callout banner',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      heading: { type: 'text', label: 'Heading' },
      body: { type: 'textarea', label: 'Body (optional)' },
      ctaLabel: { type: 'text', label: 'Button label (optional)' },
      ctaHref: { type: 'text', label: 'Button link (optional)' },
      align: {
        type: 'radio',
        label: 'Alignment',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
        ],
      },
    },
    defaultProps: {
      eyebrow: '',
      heading: 'Ready to begin?',
      body: '',
      ctaLabel: 'Get started',
      ctaHref: '#',
      align: 'center',
    },
    render: ({ eyebrow, heading, body, ctaLabel, ctaHref, align, puck }) => (
      <SpaceCalloutBlock
        eyebrow={(eyebrow as string) || undefined}
        heading={(heading as string) || undefined}
        body={(body as string) || undefined}
        ctaLabel={(ctaLabel as string) || undefined}
        ctaHref={(ctaHref as string) || undefined}
        align={align as string}
        editing={puck?.isEditing}
      />
    ),
  },

  // A business-presence strip: operator-authored social/business links with an optional star rating and
  // review count, laid out like a LinkedIn / Facebook / Yelp business header.
  SpaceBusiness: {
    label: 'Business presence',
    fields: {
      heading: { type: 'text', label: 'Heading (optional)' },
      rating: { type: 'text', label: 'Rating (optional, e.g. 4.8)' },
      ratingCount: { type: 'text', label: 'Rating count (optional, e.g. 126 reviews)' },
      links: businessLinkArrayField,
    },
    defaultProps: {
      heading: 'Find us online',
      rating: '',
      ratingCount: '',
      links: [],
    },
    render: ({ heading, rating, ratingCount, links, puck }) => {
      // Central business presence wins (single source): the rating + the social links come from the
      // Business Info form, falling back to this block's own inline props only when central is empty.
      const central = profileFrom(puck)
      const centralSocials = central?.socials as SpaceSocialLink[] | undefined
      const mergedLinks: BusinessLink[] =
        centralSocials && centralSocials.length > 0 ? centralSocials : ((links as BusinessLink[]) ?? [])
      return (
        <SpaceBusinessBlock
          heading={(heading as string) || undefined}
          rating={mergeField(rating as string, central?.rating)}
          ratingCount={mergeField(ratingCount as string, central?.ratingCount)}
          links={mergedLinks}
          editing={puck?.isEditing}
        />
      )
    },
  },
}
