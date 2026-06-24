// Product-story block library, five story-led blocks that render the REAL shape
// of Frequency's product as on-brand vector mockups (DAWN semantic tokens, the
// hand-drawn illustration language from components/marketing/illustrations), never
// screenshots or stock art.
//
// Keys:  SeasonTimeline | CircleFirstNight | RolesPath | QuestLoop | BackTheBuild
// Category: Sections (BackTheBuild lives under Sections too; it is The Lab's
//           founding-membership band)
//
// Every block follows the frozen kit contract (fields -> defaultProps -> render
// threading the standard adjust controls through <Band> or its own <section>).
// Copy obeys the locked voice (docs/CONTENT-VOICE.md) and naming canon
// (docs/NAMING.md): plain sentences, proper nouns carry the magic, sentence-case
// headers, no em or en dashes, honest at day zero (no member counts), DAWN tokens
// only. Canon terms used verbatim: Quest / Journey (Mind, Body, Spirit) /
// Expression Challenge / Pillars / Circle / Run / Member -> Crew -> Host -> Guide
// -> Mentor / Zaps -> Gems (5:1) -> Vault.

import { ArrowRight } from 'lucide-react'
import {
  Band,
  Eyebrow,
  DisplayHeading,
  Kicker,
  CtaButton,
  blockFields,
  blockLayoutDefaults,
  accentize,
  layoutField,
  layoutDefault,
  padClass,
  visClass,
  isInk,
  type LayoutValue,
  type ComponentConfig,
} from './kit'
import { richParagraphs } from '@/lib/page-editor/richtext'
import { BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// Shared mockup chrome
// ─────────────────────────────────────────────────────────────────────────────

// A soft "card on a canvas" frame so every mockup reads as a rendered surface,
// not a screenshot. Adapts to ink backgrounds.
function MockFrame({ ink, children, className = '' }: { ink?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-3xl p-6 sm:p-8 ${
        ink ? 'bg-white/5 border border-white/10' : 'bg-marketing-canvas border border-border'
      } ${className}`}
    >
      {children}
    </div>
  )
}

// One small Pillar dot used across the season + loop art.
function PillarDot({ className }: { className: string }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${className}`} aria-hidden />
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SeasonTimeline, the 13-week Quest shape: 3 Journeys, each capped by an
//    Expression Challenge.
// ─────────────────────────────────────────────────────────────────────────────

type JourneyLeg = {
  pillar?: string
  weeks?: string
  blurb?: string
}

// The three Pillars that carry Journeys, each with its token accent. Expression
// is NOT a fourth Journey, it is the capstone Challenge on every leg (canon).
const PILLAR_ACCENT: Record<string, { dot: string; text: string; ring: string }> = {
  Mind: { dot: 'bg-primary', text: 'text-primary-strong', ring: 'ring-primary-bg' },
  Body: { dot: 'bg-signal', text: 'text-signal-strong', ring: 'ring-signal-bg' },
  Spirit: { dot: 'bg-primary-strong', text: 'text-primary-strong', ring: 'ring-primary-bg' },
}
function pillarAccent(pillar?: string) {
  return PILLAR_ACCENT[pillar ?? 'Mind'] ?? PILLAR_ACCENT.Mind
}

export function SeasonTimelineBlock({
  eyebrow,
  title,
  titleAccent,
  kicker,
  legs,
  capstoneLabel,
  capstoneNote,
  ink,
}: {
  eyebrow?: string
  title?: string
  titleAccent?: string
  kicker?: string
  legs?: JourneyLeg[]
  capstoneLabel?: string
  capstoneNote?: string
  ink?: boolean
}) {
  const shown = (legs || []).slice(0, 3)
  const headingColor = ink ? 'text-on-ink' : 'text-text'
  const bodyColor = ink ? 'text-on-ink-muted' : 'text-muted'
  const subColor = ink ? 'text-on-ink-subtle' : 'text-subtle'

  return (
    <div>
      {(eyebrow || title || kicker) && (
        <div className="mb-10">
          {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
          {title && <DisplayHeading ink={ink}>{accentize(title, titleAccent)}</DisplayHeading>}
          {kicker && <Kicker ink={ink}>{kicker}</Kicker>}
        </div>
      )}

      <MockFrame ink={ink}>
        {/* The track: three Journey legs in sequence, each ending in a capstone
            node, rendered as a vector rail (token colors only). */}
        <ol className="grid gap-5 sm:grid-cols-3">
          {shown.map((leg, i) => {
            const a = pillarAccent(leg.pillar)
            return (
              <li
                key={i}
                className={`relative flex flex-col rounded-2xl p-5 ${
                  ink ? 'bg-white/5 border border-white/10' : 'bg-surface border border-border'
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className={`font-display text-3xl leading-none ${a.text}`}>{i + 1}</span>
                  <div className="flex items-center gap-1.5">
                    <PillarDot className={a.dot} />
                    <span className={`font-display uppercase text-2xl leading-none ${headingColor}`}>
                      {leg.pillar} Journey
                    </span>
                  </div>
                </div>
                {leg.weeks && (
                  <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${subColor}`}>{leg.weeks}</p>
                )}
                {leg.blurb && <p className={`text-sm leading-relaxed ${bodyColor}`}>{leg.blurb}</p>}

                {/* The Expression Challenge capstone node that closes the leg. */}
                <div className={`mt-4 pt-4 border-t ${ink ? 'border-white/10' : 'border-border'}`}>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-3xs font-bold uppercase tracking-wider ring-1 ${
                      ink ? 'bg-white/10 text-on-ink ring-white/15' : `bg-primary-bg/60 text-primary-strong ${a.ring}`
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} aria-hidden /> {capstoneLabel}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>

        {capstoneNote && (
          <p className={`mt-6 text-sm leading-relaxed ${bodyColor}`}>{capstoneNote}</p>
        )}
      </MockFrame>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CircleFirstNight, the concrete shape of a Circle's first night / weekly Run.
// ─────────────────────────────────────────────────────────────────────────────

type RunRow = {
  time?: string
  title?: string
  note?: string
}

export function CircleFirstNightBlock({
  eyebrow,
  title,
  titleAccent,
  kicker,
  cardLabel,
  cardTitle,
  rows,
  footnote,
  ink,
}: {
  eyebrow?: string
  title?: string
  titleAccent?: string
  kicker?: string
  cardLabel?: string
  cardTitle?: string
  rows?: RunRow[]
  footnote?: string
  ink?: boolean
}) {
  const headingColor = ink ? 'text-on-ink' : 'text-text'
  const bodyColor = ink ? 'text-on-ink-muted' : 'text-muted'
  const subColor = ink ? 'text-on-ink-subtle' : 'text-subtle'

  return (
    <div className="grid md:grid-cols-2 gap-10 lg:gap-16 items-center">
      {/* Text column */}
      <div>
        {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
        {title && <DisplayHeading ink={ink}>{accentize(title, titleAccent)}</DisplayHeading>}
        {kicker && <Kicker ink={ink}>{kicker}</Kicker>}
        {footnote && (
          <p className={`mt-6 text-base leading-relaxed ${bodyColor}`}>{footnote}</p>
        )}
      </div>

      {/* Run-sheet mockup column */}
      <MockFrame ink={ink}>
        <div className="flex items-center justify-between mb-5">
          <div>
            {cardLabel && (
              <p className={`text-xs font-bold uppercase tracking-widest ${ink ? 'text-primary' : 'text-primary-strong'}`}>
                {cardLabel}
              </p>
            )}
            {cardTitle && (
              <p className={`mt-1 font-display uppercase text-2xl leading-none ${headingColor}`}>{cardTitle}</p>
            )}
          </div>
          {/* A small ring-of-people mark, the Circle motif. */}
          <svg viewBox="0 0 60 60" className="w-11 h-11 shrink-0" aria-hidden>
            <circle cx="30" cy="30" r="20" className="stroke-primary" strokeWidth="3" fill="none" />
            <g className="fill-primary">
              <circle cx="30" cy="10" r="4" />
              <circle cx="30" cy="50" r="4" />
            </g>
            <g className="fill-signal">
              <circle cx="10" cy="30" r="4" />
              <circle cx="50" cy="30" r="4" />
            </g>
          </svg>
        </div>

        <ol className="space-y-3">
          {(rows || []).map((row, i) => (
            <li
              key={i}
              className={`flex gap-4 rounded-xl px-4 py-3 ${
                ink ? 'bg-white/5' : 'bg-surface border border-border'
              }`}
            >
              <span className={`shrink-0 w-14 text-sm font-bold tabular-nums ${ink ? 'text-primary' : 'text-primary-strong'}`}>
                {row.time}
              </span>
              <span className="min-w-0">
                <span className={`block text-base font-semibold leading-snug ${headingColor}`}>{row.title}</span>
                {row.note && <span className={`block text-sm leading-snug ${subColor}`}>{row.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      </MockFrame>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. RolesPath, the Member -> Crew -> Host -> Guide -> Mentor ladder, framed with
//    the backup / safety-net message.
// ─────────────────────────────────────────────────────────────────────────────

type RoleRung = {
  name?: string
  blurb?: string
}

export function RolesPathBlock({
  eyebrow,
  title,
  titleAccent,
  kicker,
  rungs,
  safetyNet,
  ink,
}: {
  eyebrow?: string
  title?: string
  titleAccent?: string
  kicker?: string
  rungs?: RoleRung[]
  safetyNet?: string
  ink?: boolean
}) {
  const shown = (rungs || []).slice(0, 5)
  const headingColor = ink ? 'text-on-ink' : 'text-text'
  const bodyColor = ink ? 'text-on-ink-muted' : 'text-muted'

  return (
    <div>
      {(eyebrow || title || kicker) && (
        <div className="mb-10">
          {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
          {title && <DisplayHeading ink={ink}>{accentize(title, titleAccent)}</DisplayHeading>}
          {kicker && <Kicker ink={ink}>{kicker}</Kicker>}
        </div>
      )}

      {/* The ladder: connected rungs, each a step up, with a forward arrow rail. */}
      <ol className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {shown.map((rung, i) => {
          const last = i === shown.length - 1
          return (
            <li
              key={i}
              className={`relative flex flex-col rounded-2xl p-5 ${
                ink ? 'bg-white/5 border border-white/10' : 'bg-surface border border-border shadow-sm'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-black ${
                    ink ? 'bg-primary/20 text-primary' : 'bg-primary-bg text-primary-strong'
                  }`}
                >
                  {i + 1}
                </span>
                <span className={`font-display uppercase text-xl leading-none ${headingColor}`}>{rung.name}</span>
              </div>
              {rung.blurb && <p className={`text-sm leading-relaxed ${bodyColor}`}>{rung.blurb}</p>}
              {/* Forward arrow rail between rungs (hidden on the last one). */}
              {!last && (
                <ArrowRight
                  className={`hidden lg:block absolute top-1/2 -right-3 w-5 h-5 -translate-y-1/2 ${
                    ink ? 'text-white/25' : 'text-border-strong'
                  }`}
                  aria-hidden
                />
              )}
            </li>
          )
        })}
      </ol>

      {/* The safety-net beat: you are never out front alone. */}
      {safetyNet && (
        <div
          className={`mt-8 rounded-2xl p-6 ${
            ink ? 'bg-primary/10 border border-primary/30' : 'bg-primary-bg/50 border border-primary/30'
          }`}
        >
          <p className={`text-base leading-relaxed ${ink ? 'text-on-ink' : 'text-text'}`}>{safetyNet}</p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. QuestLoop, show up -> earn Zaps -> roll into Gems (5:1) -> spend in the Vault.
// ─────────────────────────────────────────────────────────────────────────────

type LoopStage = {
  label?: string
  blurb?: string
}

export function QuestLoopBlock({
  eyebrow,
  title,
  titleAccent,
  kicker,
  stages,
  ratioNote,
  ink,
}: {
  eyebrow?: string
  title?: string
  titleAccent?: string
  kicker?: string
  stages?: LoopStage[]
  ratioNote?: string
  ink?: boolean
}) {
  const shown = (stages || []).slice(0, 4)
  const headingColor = ink ? 'text-on-ink' : 'text-text'
  const bodyColor = ink ? 'text-on-ink-muted' : 'text-muted'

  return (
    <div>
      {(eyebrow || title || kicker) && (
        <div className="mb-10">
          {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
          {title && <DisplayHeading ink={ink}>{accentize(title, titleAccent)}</DisplayHeading>}
          {kicker && <Kicker ink={ink}>{kicker}</Kicker>}
        </div>
      )}

      {/* The loop: stages chained left to right with arrows, then a closing note
          carrying the 5:1 rule. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
        {shown.map((stage, i) => {
          const last = i === shown.length - 1
          return (
            <div key={i} className="flex flex-col sm:flex-row sm:items-stretch sm:flex-1">
              <div
                className={`flex-1 flex flex-col rounded-2xl p-6 ${
                  ink ? 'bg-white/5 border border-white/10' : 'bg-surface border border-border shadow-sm'
                }`}
              >
                <span className={`font-display text-4xl leading-none mb-3 ${ink ? 'text-primary' : 'text-primary-strong'}`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className={`font-display uppercase text-xl leading-none mb-2 ${headingColor}`}>{stage.label}</span>
                {stage.blurb && <span className={`text-sm leading-relaxed ${bodyColor}`}>{stage.blurb}</span>}
              </div>
              {!last && (
                <div className="flex items-center justify-center py-2 sm:py-0 sm:px-2">
                  <ArrowRight
                    className={`w-6 h-6 rotate-90 sm:rotate-0 ${ink ? 'text-white/25' : 'text-border-strong'}`}
                    aria-hidden
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {ratioNote && (
        <p className={`mt-6 text-sm leading-relaxed ${bodyColor}`}>{ratioNote}</p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. BackTheBuild, the founding-membership "back the build" band for The Lab.
//    Vision + tiers + CTA. Always its own dark band with the LED seam + glow,
//    matching BetaCTA, so it reads as a destination beat at the page foot.
// ─────────────────────────────────────────────────────────────────────────────

type BuildTier = {
  name?: string
  amount?: string
  blurb?: string
}

export function BackTheBuildBlock({
  eyebrow,
  title,
  titleAccent,
  body,
  tiers,
  ctaLabel,
  ctaHref,
  secondaryNote,
  layout,
}: {
  eyebrow?: string
  title?: string
  titleAccent?: string
  body?: string
  tiers?: BuildTier[]
  ctaLabel?: string
  ctaHref?: string
  secondaryNote?: string
  layout?: LayoutValue
}) {
  const shown = (tiers || []).slice(0, 4)
  return (
    <section
      className={`relative bg-slat px-6 ${padClass(layout) ?? 'py-24 sm:py-28'} overflow-hidden ${visClass(layout)}`}
    >
      <div className="light-strip absolute inset-x-0 top-0" />
      <div className="amber-glow absolute inset-0 pointer-events-none" />
      <div className="relative max-w-5xl mx-auto">
        <div className="text-center max-w-2xl mx-auto">
          {eyebrow && <Eyebrow ink>{eyebrow}</Eyebrow>}
          {title && <DisplayHeading ink>{accentize(title, titleAccent)}</DisplayHeading>}
          {body && (
            <div className="mt-6 text-lg leading-relaxed space-y-4 text-on-ink-muted">
              {richParagraphs(body)}
            </div>
          )}
        </div>

        {shown.length > 0 && (
          <ul className="mt-12 grid gap-5 sm:grid-cols-3">
            {shown.map((tier, i) => (
              <li key={i} className="flex flex-col rounded-3xl border border-white/10 bg-white/5 p-7">
                {tier.amount && (
                  <span className="font-display uppercase text-primary text-3xl leading-none mb-2">{tier.amount}</span>
                )}
                {tier.name && (
                  <span className="font-display uppercase text-on-ink text-xl leading-none mb-3">{tier.name}</span>
                )}
                {tier.blurb && <span className="text-sm leading-relaxed text-on-ink-muted">{tier.blurb}</span>}
              </li>
            ))}
          </ul>
        )}

        {ctaLabel && ctaHref && (
          <div className="mt-12 flex flex-col items-center gap-4">
            <CtaButton href={ctaHref} label={ctaLabel} variant="primary" onInk />
            {secondaryNote && <p className="text-sm text-on-ink-subtle">{secondaryNote}</p>}
          </div>
        )}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ComponentConfig map, exported as productStoryComponents
// ─────────────────────────────────────────────────────────────────────────────

export const productStoryComponents: Record<string, ComponentConfig> = {
  // ── SeasonTimeline ────────────────────────────────────────────────────────────
  SeasonTimeline: {
    label: 'Season timeline',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      title: { type: 'text', label: 'Heading (optional)' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      kicker: { type: 'text', label: 'Italic kicker (optional)' },
      legs: {
        type: 'array',
        label: 'Journeys (3: Mind, Body, Spirit)',
        arrayFields: {
          pillar: {
            type: 'select',
            label: 'Pillar',
            options: [
              { label: 'Mind', value: 'Mind' },
              { label: 'Body', value: 'Body' },
              { label: 'Spirit', value: 'Spirit' },
            ],
          },
          weeks: { type: 'text', label: 'Duration (e.g. ~4 weeks)' },
          blurb: { type: 'textarea', label: 'Blurb' },
        },
        getItemSummary: (item: JourneyLeg) => (item.pillar ? `${item.pillar} Journey` : 'Journey'),
      },
      capstoneLabel: { type: 'text', label: 'Capstone label' },
      capstoneNote: { type: 'textarea', label: 'Capstone note (optional)' },
      ...blockFields(),
    },
    defaultProps: {
      eyebrow: 'A Quest',
      title: 'A season is thirteen weeks.',
      titleAccent: 'thirteen weeks',
      kicker: 'Three Journeys, run in order, each capped by an Expression Challenge.',
      legs: [
        {
          pillar: 'Mind',
          weeks: '~4 weeks',
          blurb: 'Meditation, breathwork, and the quiet practices that settle a nervous system.',
        },
        {
          pillar: 'Body',
          weeks: '~4 weeks',
          blurb: 'Movement, strength, cold and heat. The practices you feel the next morning.',
        },
        {
          pillar: 'Spirit',
          weeks: '~4 weeks',
          blurb: 'Ceremony, sound, and human relating. The work you do shoulder to shoulder.',
        },
      ],
      capstoneLabel: 'Expression Challenge',
      capstoneNote: 'Expression is not a fourth Journey. It is the Challenge that closes each one: make something, share it, and finish the leg.',
      ...blockLayoutDefaults,
    },
    render: ({ eyebrow, title, titleAccent, kicker, legs, capstoneLabel, capstoneNote, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <SeasonTimelineBlock
          eyebrow={(eyebrow as string) || undefined}
          title={(title as string) || undefined}
          titleAccent={(titleAccent as string) || undefined}
          kicker={(kicker as string) || undefined}
          legs={legs as JourneyLeg[]}
          capstoneLabel={(capstoneLabel as string) || undefined}
          capstoneNote={(capstoneNote as string) || undefined}
          ink={isInk(tone as string)}
        />
      </Band>
    ),
  },

  // ── CircleFirstNight ──────────────────────────────────────────────────────────
  CircleFirstNight: {
    label: 'Circle first night',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      title: { type: 'text', label: 'Heading (optional)' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      kicker: { type: 'text', label: 'Italic kicker (optional)' },
      footnote: { type: 'textarea', label: 'Supporting paragraph (optional)' },
      cardLabel: { type: 'text', label: 'Card eyebrow (e.g. Weekly Run)' },
      cardTitle: { type: 'text', label: 'Card title (e.g. Tuesday, 6:30pm)' },
      rows: {
        type: 'array',
        label: 'Run sheet rows',
        arrayFields: {
          time: { type: 'text', label: 'Time (e.g. 0:00)' },
          title: { type: 'text', label: 'What happens' },
          note: { type: 'text', label: 'Note (optional)' },
        },
        getItemSummary: (item: RunRow) => item.title || 'Row',
      },
      ...blockFields(),
    },
    defaultProps: {
      eyebrow: 'A Run, up close',
      title: 'What the first night actually looks like.',
      titleAccent: 'first night',
      kicker: 'A Circle running a Journey together is a Run. Here is the shape of one evening.',
      footnote: 'No host has to invent it. The format comes with the Journey, so the first night runs itself and you just show up.',
      cardLabel: 'Weekly Run',
      cardTitle: 'Tuesday, 6:30pm',
      rows: [
        { time: '0:00', title: 'Arrive and settle', note: 'Tea, a folding chair, names around the room.' },
        { time: '0:15', title: 'Open the week', note: 'The host reads the prompt the Journey set for tonight.' },
        { time: '0:30', title: 'The practice', note: 'You do the thing together: sit, move, or make.' },
        { time: '1:00', title: 'Share and close', note: 'A short round, then plans for next week.' },
      ],
      ...blockLayoutDefaults,
      width: 'wide',
    },
    render: ({ eyebrow, title, titleAccent, kicker, footnote, cardLabel, cardTitle, rows, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <CircleFirstNightBlock
          eyebrow={(eyebrow as string) || undefined}
          title={(title as string) || undefined}
          titleAccent={(titleAccent as string) || undefined}
          kicker={(kicker as string) || undefined}
          footnote={(footnote as string) || undefined}
          cardLabel={(cardLabel as string) || undefined}
          cardTitle={(cardTitle as string) || undefined}
          rows={rows as RunRow[]}
          ink={isInk(tone as string)}
        />
      </Band>
    ),
  },

  // ── RolesPath ─────────────────────────────────────────────────────────────────
  RolesPath: {
    label: 'Roles path',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      title: { type: 'text', label: 'Heading (optional)' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      kicker: { type: 'text', label: 'Italic kicker (optional)' },
      rungs: {
        type: 'array',
        label: 'Rungs (Member to Mentor)',
        arrayFields: {
          name: { type: 'text', label: 'Role name' },
          blurb: { type: 'textarea', label: 'Blurb' },
        },
        getItemSummary: (item: RoleRung) => item.name || 'Rung',
      },
      safetyNet: { type: 'textarea', label: 'Safety-net line' },
      ...blockFields(),
    },
    defaultProps: {
      eyebrow: 'The path',
      title: 'You are never out front alone.',
      titleAccent: 'never',
      kicker: 'Step up as far as you want. Every rung has the one above it for backup.',
      rungs: [
        { name: 'Member', blurb: 'You show up to a Circle. That is the whole entry fee.' },
        { name: 'Crew', blurb: 'You are in for the season, learning the format and lending a hand.' },
        { name: 'Host', blurb: 'You hold a Circle through a Run. The script and the backup come with it.' },
        { name: 'Guide', blurb: 'You look after the Hosts nearby, so no one runs a room alone.' },
        { name: 'Mentor', blurb: 'You keep the Guides steady across a whole local community.' },
      ],
      safetyNet: 'Nobody gets handed a room and left to sink. Whatever rung you take, the rung above it is there for backup: a Guide for every Host, a Mentor for every Guide. You can step up exactly as far as feels right, and step back any time.',
      ...blockLayoutDefaults,
    },
    render: ({ eyebrow, title, titleAccent, kicker, rungs, safetyNet, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <RolesPathBlock
          eyebrow={(eyebrow as string) || undefined}
          title={(title as string) || undefined}
          titleAccent={(titleAccent as string) || undefined}
          kicker={(kicker as string) || undefined}
          rungs={rungs as RoleRung[]}
          safetyNet={(safetyNet as string) || undefined}
          ink={isInk(tone as string)}
        />
      </Band>
    ),
  },

  // ── QuestLoop ─────────────────────────────────────────────────────────────────
  QuestLoop: {
    label: 'Quest loop',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      title: { type: 'text', label: 'Heading (optional)' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      kicker: { type: 'text', label: 'Italic kicker (optional)' },
      stages: {
        type: 'array',
        label: 'Stages (show up to Vault)',
        arrayFields: {
          label: { type: 'text', label: 'Stage label' },
          blurb: { type: 'textarea', label: 'Blurb' },
        },
        getItemSummary: (item: LoopStage) => item.label || 'Stage',
      },
      ratioNote: { type: 'textarea', label: 'Closing note (the 5:1 rule)' },
      ...blockFields(),
    },
    defaultProps: {
      eyebrow: 'The loop',
      title: 'Show up. That is the whole game.',
      titleAccent: 'Show up',
      kicker: 'Real-world acts earn Zaps. At season end they roll into Gems you can spend.',
      stages: [
        { label: 'Show up', blurb: 'Do a Practice, finish a Challenge, take on a Task. In person counts most.' },
        { label: 'Earn Zaps', blurb: 'Every real act pays Zaps. No leaderboard to climb, no streak to perform.' },
        { label: 'Roll into Gems', blurb: 'At season end your Zaps convert to Gems at a flat five to one.' },
        { label: 'Spend in the Vault', blurb: 'Gems are yours to spend in the Vault, the member treasury.' },
      ],
      ratioNote: 'The rate is fixed and flat: five Zaps become one Gem at the close of every season. The game is free, the same for everyone, and you only ever earn it by turning up.',
      ...blockLayoutDefaults,
      width: 'wide',
    },
    render: ({ eyebrow, title, titleAccent, kicker, stages, ratioNote, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <QuestLoopBlock
          eyebrow={(eyebrow as string) || undefined}
          title={(title as string) || undefined}
          titleAccent={(titleAccent as string) || undefined}
          kicker={(kicker as string) || undefined}
          stages={stages as LoopStage[]}
          ratioNote={(ratioNote as string) || undefined}
          ink={isInk(tone as string)}
        />
      </Band>
    ),
  },

  // ── BackTheBuild ──────────────────────────────────────────────────────────────
  BackTheBuild: {
    label: 'Back the build',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      title: { type: 'text', label: 'Heading' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      body: { type: 'textarea', label: 'Vision (**bold**, *italic*, [link](/path))' },
      tiers: {
        type: 'array',
        label: 'Tiers (optional)',
        arrayFields: {
          amount: { type: 'text', label: 'Amount (e.g. Founding)' },
          name: { type: 'text', label: 'Name' },
          blurb: { type: 'textarea', label: 'Blurb' },
        },
        getItemSummary: (item: BuildTier) => item.name || 'Tier',
      },
      ctaLabel: { type: 'text', label: 'CTA label' },
      ctaHref: { type: 'text', label: 'CTA link' },
      secondaryNote: { type: 'text', label: 'Note under CTA (optional)' },
      layout: layoutField,
    },
    defaultProps: {
      eyebrow: 'Back the build',
      title: 'Help build the first room.',
      titleAccent: 'first room',
      body: 'The Lab is being built by the people who will use it. There is no investor playbook here, just a community putting the first room together in North County San Diego, then handing the blueprint to the next city.\n\nBack the build and you are not buying a membership. You are putting your name on the wall of the place this all begins.',
      tiers: [
        { amount: 'Founding', name: 'Member', blurb: 'Your name among the first. A seat saved for opening night.' },
        { amount: 'Founding', name: 'Circle', blurb: 'Bring your Circle in together and help shape the room.' },
        { amount: 'Founding', name: 'Patron', blurb: 'Hold the door open for the neighbors who come after you.' },
      ],
      ctaLabel: BETA_CTA_LABEL,
      ctaHref: BETA_CTA_HREF,
      secondaryNote: 'No money changes hands yet. Join the Beta and we will bring you in as the build takes shape.',
      layout: layoutDefault,
    },
    render: ({ eyebrow, title, titleAccent, body, tiers, ctaLabel, ctaHref, secondaryNote, layout }) => (
      <BackTheBuildBlock
        eyebrow={(eyebrow as string) || undefined}
        title={(title as string) || undefined}
        titleAccent={(titleAccent as string) || undefined}
        body={(body as string) || undefined}
        tiers={tiers as BuildTier[]}
        ctaLabel={(ctaLabel as string) || undefined}
        ctaHref={(ctaHref as string) || undefined}
        secondaryNote={(secondaryNote as string) || undefined}
        layout={layout as LayoutValue}
      />
    ),
  },
}
