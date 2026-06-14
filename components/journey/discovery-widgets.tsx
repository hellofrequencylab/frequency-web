import Link from 'next/link'
import { Gem, Trophy, Users, Target, BookOpen } from 'lucide-react'
import type { JourneyPlanItem } from '@/lib/journey-plans'
import { planPillarMap } from '@/lib/journey-plans'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import type { Pillar } from '@/lib/pillars'
import { buildJourneyTree, type BlockRow } from '@/lib/journeys/tree'

// Discovery-mode content blocks (docs/JOURNEYS.md §10) — the visitor / not-adopted face.
// Each is a small Server Component the page composes per the normalized layout. Token colors
// only; no hand-rolled headers (SectionHeader / EmptyState from the kit).

const SEASON_WEEKS = 13

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

/** The Path — ordered steps with cadence, note, and the author's default tier. */
export function PathBlock({
  items,
  accent,
}: {
  items: JourneyPlanItem[]
  pillarsById: Map<string, Pillar>
  accent: string | null
}) {
  // Build the Phase -> Module -> Lesson tree so the preview reads as a real curriculum,
  // not a flat list (docs/JOURNEYS-DESIGN.md §2: curriculum preview as skimmable Phases).
  // A practice item's name falls back to its linked practice's title.
  const blocks: BlockRow[] = items.map((i) => ({
    id: i.id,
    parent_id: i.parent_id ?? null,
    block_type: i.block_type ?? 'practice',
    sort_order: i.sort_order ?? 0,
    title: i.title ?? i.practice?.title ?? null,
    required: i.required ?? true,
    est_minutes: i.est_minutes ?? null,
    practice_id: i.practice_id || null,
  }))
  const tree = buildJourneyTree(blocks, [])
  const lessonsIn = (p: (typeof tree.phases)[number]) => p.modules.reduce((s, m) => s + m.lessons.length, 0)
  const total = tree.phases.reduce((s, p) => s + lessonsIn(p), 0)

  return (
    <section>
      <SectionHeader title="The path" count={total} />
      {total === 0 ? (
        <EmptyState icon={Target} title="No steps yet" description="This journey hasn’t mapped its path." />
      ) : (
        <ol className="space-y-3">
          {tree.phases.map((p, i) => {
            const n = lessonsIn(p)
            return (
              <li key={p.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums"
                    style={{ backgroundColor: accentTint(accent, 16), color: accentColor(accent) }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">{p.title || `Phase ${i + 1}`}</p>
                    <p className="text-xs text-muted">{n} {n === 1 ? 'step' : 'steps'}</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1 border-t border-border pt-3">
                  {p.modules.flatMap((m) => m.lessons).map((l) => (
                    <li key={l.id} className="flex items-center gap-2 text-sm">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" />
                      <span className="min-w-0 truncate text-text">{l.title}</span>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

/** The Pillar-balance meter (reuses planPillarMap). */
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

/** Social proof — "N on this journey." */
export function SocialProofBlock({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-surface-elevated px-3 py-1.5 text-sm font-medium text-muted">
      <Users className="h-4 w-4 text-subtle" />
      {count} {count === 1 ? 'person' : 'people'} on this journey
    </div>
  )
}

/** Reward preview — the completion Gems + the permanent badge. */
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

/** The completion rule — bank target_weeks qualifying weeks of 13. */
export function CompletionRuleBlock({ targetWeeks }: { targetWeeks: number }) {
  return (
    <section className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-muted">
        <Target className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-text">How you complete it</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted">
          Show up on a practice in <strong className="font-semibold text-text">{targetWeeks}</strong> of the season’s{' '}
          {SEASON_WEEKS} weeks. Forgiving by design. A few hard weeks won’t end your run.
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

/** Discovery CTA — Adopt / Remix. The forms post the existing editor-owned actions. */
export function AdoptRemixBlock({
  planId,
  slug,
  adopted,
  canAdopt,
  adoptAction,
  forkAction,
}: {
  planId: string
  slug: string
  adopted: boolean
  canAdopt: boolean
  adoptAction: (formData: FormData) => void | Promise<void>
  forkAction: (formData: FormData) => void | Promise<void>
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-muted">
          {adopted
            ? 'You’ve adopted this Journey. Its practices are in your daily loop.'
            : 'Adopt it to add these practices to your daily loop, or remix it into your own.'}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {adopted ? (
            <Link
              href={`/journeys/${slug}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-success-bg px-4 py-2 text-sm font-semibold text-success"
            >
              <Trophy className="h-4 w-4" /> Adopted
            </Link>
          ) : (
            <form action={adoptAction}>
              <input type="hidden" name="planId" value={planId} />
              <input type="hidden" name="slug" value={slug} />
              <button
                type="submit"
                disabled={!canAdopt}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Adopt journey
              </button>
            </form>
          )}
          <form action={forkAction}>
            <input type="hidden" name="planId" value={planId} />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:border-primary hover:text-primary-strong"
            >
              Remix
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}
