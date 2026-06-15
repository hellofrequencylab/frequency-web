import Image from 'next/image'
import Link from 'next/link'
import {
  Gem,
  Trophy,
  Users,
  Target,
  BookOpen,
  Clock,
  CalendarDays,
  Award,
  Layers,
  ChevronDown,
  Lock,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import type { JourneyPlanItem, JourneyPlan } from '@/lib/journey-plans'
import { planPillarMap } from '@/lib/journey-plans'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { SidebarCard } from '@/components/ui/sidebar-card'
import { buttonClasses } from '@/components/ui/button'
import type { Pillar } from '@/lib/pillars'
import { buildJourneyTree, type BlockRow, type Phase } from '@/lib/journeys/tree'

// Discovery-mode content blocks (docs/JOURNEYS.md §10) — the visitor / not-enrolled face.
// Each is a small Server Component the page composes. Token colors only; no hand-rolled
// headers (SectionHeader / EmptyState / SidebarCard from the kit). Voice is v2 (Run / Phase
// / enroll, never "adopt" / "daily loop" / "season"); no em dashes (docs/CONTENT-VOICE.md).

// ── Shared derivation ─────────────────────────────────────────────────────────
// One read of the Phase → Module → Lesson tree feeds the header chips, the path
// accordion, and the rail "what's included" list, so the facts never drift.

/** Turn raw plan items into the tree-shaped blocks (a practice item falls back to its
 *  linked practice's title). Shared by every block that needs the curriculum shape. */
export function itemsToBlocks(items: JourneyPlanItem[]): BlockRow[] {
  return items.map((i) => ({
    id: i.id,
    parent_id: i.parent_id ?? null,
    block_type: i.block_type ?? 'practice',
    sort_order: i.sort_order ?? 0,
    title: i.title ?? i.practice?.title ?? null,
    required: i.required ?? true,
    est_minutes: i.est_minutes ?? null,
    practice_id: i.practice_id || null,
  }))
}

export interface JourneyFacts {
  phaseCount: number
  lessonCount: number
  /** Sum of lesson est minutes, or null when nothing has an estimate. */
  totalMinutes: number | null
  phases: Phase[]
  /** est minutes per phase (null when none of its lessons are estimated). */
  phaseMinutes: Map<string, number | null>
  lessonsPerPhase: Map<string, number>
}

/** Derive the at-a-glance facts (phases · lessons · time) from the plan's items. */
export function journeyFacts(items: JourneyPlanItem[]): JourneyFacts {
  const tree = buildJourneyTree(itemsToBlocks(items), [])
  const lessonsPerPhase = new Map<string, number>()
  const phaseMinutes = new Map<string, number | null>()
  let lessonCount = 0
  let totalMinutes = 0
  let anyMinutes = false
  for (const p of tree.phases) {
    const lessons = p.modules.flatMap((m) => m.lessons)
    lessonsPerPhase.set(p.id, lessons.length)
    lessonCount += lessons.length
    let pm = 0
    let pAny = false
    for (const l of lessons) {
      if (l.estMinutes && l.estMinutes > 0) {
        pm += l.estMinutes
        totalMinutes += l.estMinutes
        pAny = true
        anyMinutes = true
      }
    }
    phaseMinutes.set(p.id, pAny ? pm : null)
  }
  return {
    phaseCount: tree.phases.length,
    lessonCount,
    totalMinutes: anyMinutes ? totalMinutes : null,
    phases: tree.phases,
    phaseMinutes,
    lessonsPerPhase,
  }
}

/** "~45 min" / "~1h 20m" — a soft time read, or null when nothing is estimated. */
export function formatMinutes(min: number | null): string | null {
  if (!min || min <= 0) return null
  if (min < 60) return `~${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `~${h}h` : `~${h}h ${m}m`
}

/** The cadence read for a Run ("1 phase / week" from drip_interval_days). */
export function cadenceLabel(dripIntervalDays: number): string {
  const d = dripIntervalDays || 7
  if (d === 7) return '1 phase / week'
  if (d === 1) return '1 phase / day'
  if (d === 14) return '1 phase / 2 weeks'
  return `1 phase / ${d} days`
}

// ── Header chips ──────────────────────────────────────────────────────────────

/** A quiet, tokenized stat chip — structural context, NOT a game tile (the gamified-
 *  stat law: only the gems reward MAY read as a reward; everything else is calm). */
export function StatChip({
  icon: Icon,
  children,
  tone = 'quiet',
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  tone?: 'quiet' | 'reward'
}) {
  const cls =
    tone === 'reward'
      ? 'bg-signal-bg/60 text-signal-strong'
      : 'bg-surface-elevated text-muted'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-medium ${cls}`}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden /> {children}
    </span>
  )
}

/** The header stat-chip row: the structural facts of the Journey at a glance. */
export function JourneyStatChips({
  facts,
  plan,
  enrolledCount,
}: {
  facts: JourneyFacts
  plan: JourneyPlan
  enrolledCount: number
}) {
  const time = formatMinutes(facts.totalMinutes)
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <StatChip icon={Layers}>
        {facts.phaseCount} {facts.phaseCount === 1 ? 'phase' : 'phases'}
      </StatChip>
      <StatChip icon={BookOpen}>
        {facts.lessonCount} {facts.lessonCount === 1 ? 'lesson' : 'lessons'}
      </StatChip>
      {time && <StatChip icon={Clock}>{time}</StatChip>}
      <StatChip icon={CalendarDays}>{cadenceLabel(plan.drip_interval_days)}</StatChip>
      <StatChip icon={Gem} tone="reward">
        {plan.completion_gems} gems
      </StatChip>
      {plan.certificate_enabled && <StatChip icon={Award}>Certificate</StatChip>}
      {enrolledCount > 0 && (
        <StatChip icon={Users}>{enrolledCount.toLocaleString()} enrolled</StatChip>
      )}
    </span>
  )
}

// ── Main-column content blocks ──────────────────────────────────────────────────

/** The Story — the intro markdown ("why this journey"). */
export function StoryBlock({ intro }: { intro: string | null }) {
  if (!intro) return null
  return (
    <section>
      <SectionHeader title="The story" />
      <div className="whitespace-pre-wrap rounded-2xl border border-border bg-surface p-5 text-sm leading-relaxed text-text">
        {intro}
      </div>
    </section>
  )
}

/** What you'll learn — a short outcomes block drawn from the plan summary. */
export function OutcomesBlock({ summary }: { summary: string | null }) {
  if (!summary) return null
  return (
    <section>
      <SectionHeader title="What you'll learn" />
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm leading-relaxed text-text">
          <span className="font-semibold">By the end you&apos;ll</span> {lowerFirst(summary)}
        </p>
      </div>
    </section>
  )
}

function lowerFirst(s: string): string {
  const t = s.trim()
  return t ? t[0].toLowerCase() + t.slice(1) : t
}

/** The Path — expandable accordion Phases, each header showing the lesson count, est
 *  time, and a cadence note. Free-preview markers appear on the first phase. */
export function PathBlock({
  items,
  accent,
  facts,
}: {
  items: JourneyPlanItem[]
  pillarsById?: Map<string, Pillar>
  accent: string | null
  /** Pre-derived facts (the page computes once); falls back to deriving from items. */
  facts?: JourneyFacts
}) {
  const f = facts ?? journeyFacts(items)
  const total = f.lessonCount

  return (
    <section>
      <SectionHeader title="The path" count={f.phaseCount} />
      {total === 0 ? (
        <EmptyState icon={Target} title="No path yet" description="This Journey hasn't mapped its phases." />
      ) : (
        <ol className="space-y-3">
          {f.phases.map((p, i) => {
            const n = f.lessonsPerPhase.get(p.id) ?? 0
            const time = formatMinutes(f.phaseMinutes.get(p.id) ?? null)
            const cadence = i === 0 ? 'Unlocks at start' : `Week ${i + 1}`
            const lessons = p.modules.flatMap((m) => m.lessons)
            return (
              <li key={p.id} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                <details className="group" {...(i === 0 ? { open: true } : {})}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                    <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums"
                      style={{ backgroundColor: accentTint(accent, 16), color: accentColor(accent) }}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-text">
                        {p.title || `Phase ${i + 1}`}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted">
                        <span>{n} {n === 1 ? 'lesson' : 'lessons'}</span>
                        {time && (
                          <>
                            <span aria-hidden className="text-subtle">·</span>
                            <span className="inline-flex items-center gap-0.5">
                              <Clock className="h-3 w-3" aria-hidden /> {time}
                            </span>
                          </>
                        )}
                        <span aria-hidden className="text-subtle">·</span>
                        <span className="inline-flex items-center gap-0.5">
                          {i === 0 ? (
                            <Sparkles className="h-3 w-3" aria-hidden />
                          ) : (
                            <Lock className="h-3 w-3" aria-hidden />
                          )}
                          {cadence}
                        </span>
                        {i === 0 && (
                          <span className="rounded-full bg-success-bg px-1.5 py-0.5 font-semibold text-success">
                            Free preview
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronDown
                      className="h-4 w-4 shrink-0 text-subtle transition-transform group-open:rotate-180 motion-reduce:transition-none"
                      aria-hidden
                    />
                  </summary>
                  <ul className="space-y-1 border-t border-border px-4 pb-4 pt-3">
                    {lessons.map((l) => (
                      <li key={l.id} className="flex items-center gap-2 text-sm">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" />
                        <span className="min-w-0 truncate text-text">{l.title}</span>
                        {l.estMinutes ? (
                          <span className="ml-auto shrink-0 text-2xs tabular-nums text-subtle">
                            {l.estMinutes} min
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

/** The Pillar-balance meter (full meter as context; the primary Pillar rides the header). */
export function PillarBalanceBlock({
  items,
  pillars,
}: {
  items: JourneyPlanItem[]
  pillars: Pillar[]
}) {
  const coverage = new Map(planPillarMap(items).map((s) => [s.domainId, s.count]))
  return (
    <section>
      <SectionHeader title="Pillar balance" />
      <div className="flex flex-wrap gap-1.5">
        {pillars.map((pl) => {
          const n = coverage.get(pl.id) ?? 0
          return (
            <span
              key={pl.slug}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                n > 0 ? 'bg-primary-bg text-primary-strong' : 'bg-surface-elevated text-subtle'
              }`}
            >
              {pl.name} {n > 0 ? n : ''}
            </span>
          )
        })}
      </div>
    </section>
  )
}

/** The primary Pillar of a plan (the Pillar carrying the most steps) — for the header
 *  badge. Null when the path covers no Pillar. */
export function primaryPillar(items: JourneyPlanItem[], pillarsById: Map<string, Pillar>): Pillar | null {
  const slices = planPillarMap(items).filter((s) => s.domainId)
  if (slices.length === 0) return null
  const top = slices.reduce((a, b) => (b.count > a.count ? b : a))
  return (top.domainId && pillarsById.get(top.domainId)) || null
}

/** Instructor authority — the author, expanded. Cross-links to their profile. */
export function InstructorBlock({
  author,
}: {
  author: { handle: string; displayName: string; avatarUrl: string | null } | null
}) {
  if (!author) return null
  return (
    <section>
      <SectionHeader title="Your guide" />
      <Link
        href={`/people/${author.handle}`}
        className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong"
      >
        {author.avatarUrl ? (
          <Image src={author.avatarUrl} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-sm font-bold text-muted">
            {author.displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-text">{author.displayName}</span>
          <span className="block text-xs text-muted">Built this Journey. See their profile.</span>
        </span>
      </Link>
    </section>
  )
}

/** FAQ accordion — the recurring questions, answered in v2 voice. */
export function JourneyFaq({ plan }: { plan: Pick<JourneyPlan, 'drip_interval_days' | 'certificate_enabled'> }) {
  const faqs: { q: string; a: string }[] = [
    {
      q: 'How does the cadence work?',
      a: `Phases open one at a time, ${cadenceLabel(plan.drip_interval_days).replace('1 phase / ', 'about one a ')}. Once a phase opens it stays open, so you can go at your own pace.`,
    },
    {
      q: 'Solo or with my Circle?',
      a: 'Both work. Start it solo and the phases drip from your own start date, or run it with your Circle as a cohort so you move through it together.',
    },
    {
      q: 'What is a Run?',
      a: 'A Run is a Circle going through this Journey together as a cohort, with a shared start date and a group trophy at the finish.',
    },
    ...(plan.certificate_enabled
      ? [{ q: 'Do I earn a certificate?', a: 'Yes. Finish every phase and you get a printable certificate to keep and share, plus the completion gems.' }]
      : []),
  ]
  return (
    <section>
      <SectionHeader title="Questions" />
      <div className="space-y-2">
        {faqs.map((f) => (
          <details
            key={f.q}
            className="group overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-semibold text-text">{f.q}</span>
              <ChevronDown
                className="h-4 w-4 shrink-0 text-subtle transition-transform group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden
              />
            </summary>
            <p className="border-t border-border px-4 pb-4 pt-3 text-sm leading-relaxed text-muted">
              {f.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  )
}

// ── Reward + social proof (folded into header chips + the rail) ─────────────────

/** Social proof — "N on this Journey." (Kept for the public discover mirror.) */
export function SocialProofBlock({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-surface-elevated px-3 py-1.5 text-sm font-medium text-muted">
      <Users className="h-4 w-4 text-subtle" />
      {count} {count === 1 ? 'person' : 'people'} on this Journey
    </div>
  )
}

/** Reward preview — the completion Gems + the permanent badge. (Kept for discover.) */
export function RewardPreviewBlock({ gems }: { gems: number }) {
  return (
    <section className="flex items-center gap-4 rounded-2xl border border-signal-bg bg-signal-bg/40 p-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-signal-bg text-signal-strong">
        <Trophy className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-text">Finish to earn</p>
        <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-muted">
          <span className="inline-flex items-center gap-1 font-semibold text-signal-strong">
            <Gem className="h-4 w-4" /> {gems} gems
          </span>
          · a permanent completion badge
        </p>
      </div>
    </section>
  )
}

/** The practice guide — the intro markdown, read while practising (active mode). */
export function PracticeGuideBlock({ intro }: { intro: string | null }) {
  if (!intro) return null
  return (
    <section>
      <SectionHeader title="Practice guide" action={<BookOpen className="h-4 w-4 text-subtle" />} />
      <div className="whitespace-pre-wrap rounded-2xl border border-border bg-surface p-5 text-sm leading-relaxed text-text">
        {intro}
      </div>
    </section>
  )
}

// ── The enroll CTA ──────────────────────────────────────────────────────────────

/** The primary action shown to a visitor / not-enrolled member. Author edits, an
 *  enrolled member continues, everyone else starts. FormData posts the editor-owned
 *  actions. Voice is v2 ("Start it solo or run it with your Circle"). */
export function EnrollCta({
  planId,
  slug,
  enrolled,
  canStart,
  isAuthor,
  enrollAction,
  forkAction,
  layout = 'block',
}: {
  planId: string
  slug: string
  enrolled: boolean
  canStart: boolean
  isAuthor: boolean
  enrollAction: (formData: FormData) => void | Promise<void>
  forkAction: (formData: FormData) => void | Promise<void>
  /** 'block' = full-width stacked (rail / repeat); 'inline' = compact row (header). */
  layout?: 'block' | 'inline'
}) {
  const full = layout === 'block' ? 'w-full' : ''

  // The author previewing their own Journey: edit, not enroll.
  if (isAuthor) {
    return (
      <Link href={`/journeys/${slug}/edit`} className={buttonClasses('primary', 'md', full)}>
        Edit Journey
      </Link>
    )
  }

  const primary = enrolled ? (
    <Link href={`/journeys/${slug}/learn`} className={buttonClasses('primary', 'md', full)}>
      <Trophy className="h-4 w-4" /> Continue
    </Link>
  ) : (
    <form action={enrollAction} className={full}>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="slug" value={slug} />
      <button type="submit" disabled={!canStart} className={buttonClasses('primary', 'md', full)}>
        Start Journey
      </button>
    </form>
  )

  const remix = (
    <form action={forkAction} className={full}>
      <input type="hidden" name="planId" value={planId} />
      <button type="submit" className={buttonClasses('secondary', 'md', full)}>
        Remix
      </button>
    </form>
  )

  if (layout === 'inline') {
    return (
      <span className="flex flex-wrap items-center gap-2">
        {primary}
        {remix}
      </span>
    )
  }

  return (
    <div className="space-y-2">
      {primary}
      {remix}
    </div>
  )
}

/** The sticky "At a glance" / enroll card for the interior right rail. Pass `cta` to
 *  override the action block (the public discover mirror swaps in a "Create a free
 *  account" link); otherwise it renders the in-app EnrollCta. */
export function AtAGlanceCard({
  plan,
  slug,
  facts,
  enrolled,
  canStart,
  isAuthor,
  progress,
  enrollAction,
  forkAction,
  cta,
}: {
  plan: JourneyPlan
  slug: string
  facts: JourneyFacts
  enrolled: boolean
  canStart: boolean
  isAuthor: boolean
  /** A never-empty "Phase X of N" progress cue (reuses v2 progress when present). */
  progress: { phasesComplete: number; phasesTotal: number } | null
  enrollAction?: (formData: FormData) => void | Promise<void>
  forkAction?: (formData: FormData) => void | Promise<void>
  /** Replace the in-app enroll CTA (e.g. a public "Create a free account" link). */
  cta?: React.ReactNode
}) {
  const time = formatMinutes(facts.totalMinutes)
  const phasesTotal = progress?.phasesTotal || facts.phaseCount
  const phaseAt = progress ? Math.min(progress.phasesComplete + 1, Math.max(phasesTotal, 1)) : 1

  const included: { icon: React.ComponentType<{ className?: string }>; text: string }[] = [
    { icon: Layers, text: `${facts.phaseCount} ${facts.phaseCount === 1 ? 'phase' : 'phases'} · ${facts.lessonCount} ${facts.lessonCount === 1 ? 'lesson' : 'lessons'}` },
    ...(time ? [{ icon: Clock, text: time }] : []),
    { icon: CalendarDays, text: cadenceLabel(plan.drip_interval_days) },
    { icon: Gem, text: `${plan.completion_gems} gems on completion` },
    ...(plan.certificate_enabled ? [{ icon: Award, text: 'Printable certificate' }] : []),
    { icon: UsersRound, text: 'Run with your Circle or solo' },
  ]

  return (
    <SidebarCard title="At a glance">
      <div className="space-y-4 p-4">
        {cta ?? (
          enrollAction && forkAction ? (
            <EnrollCta
              planId={plan.id}
              slug={slug}
              enrolled={enrolled}
              canStart={canStart}
              isAuthor={isAuthor}
              enrollAction={enrollAction}
              forkAction={forkAction}
            />
          ) : null
        )}

        <dl className="space-y-2 border-t border-border pt-4">
          {included.map((row) => (
            <div key={row.text} className="flex items-center gap-2 text-xs text-muted">
              <row.icon className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
              <span className="min-w-0">{row.text}</span>
            </div>
          ))}
        </dl>

        {phasesTotal > 0 && (
          <div className="border-t border-border pt-4">
            <p className="text-2xs font-medium text-subtle">
              {progress && progress.phasesComplete > 0
                ? `Phase ${phaseAt} of ${phasesTotal}`
                : `Phase 1 of ${phasesTotal}`}
            </p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
              <div
                className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
                style={{
                  width: `${Math.round(((progress?.phasesComplete ?? 0) / Math.max(phasesTotal, 1)) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        <p className="border-t border-border pt-4 text-2xs leading-relaxed text-subtle">
          Runs with your Circle as a cohort, or solo at your own pace.
        </p>
      </div>
    </SidebarCard>
  )
}
