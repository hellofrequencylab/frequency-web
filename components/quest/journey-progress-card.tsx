import Link from 'next/link'
import { Users, ArrowRight, CheckCircle2, CalendarRange } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { ExpressionAction } from '@/app/(main)/crew/challenges/expression-action'
import { ExpressionIcon, expressionPillarStyle } from '@/lib/quest/expression-pillar'
import { ProgressTrack } from '@/components/ui/progress-track'
import { cn } from '@/lib/utils'

// JourneyProgressCard — the honest arc for one active Journey on the Journey page.
// A Journey is finished by logging its Practices on 14 DISTINCT days inside its
// ~4-week window AND completing its Expression Challenge. This card surfaces that
// real bar, never a "0%" frame: it credits the days already done out of 14, names the
// window dates, and brings the Expression Challenge capstone in-flow so the final step
// is discovered here, not stumbled onto elsewhere.
//
// Every Journey carries all four Pillars: its practice Pillar (Mind / Body / Spirit)
// AND Expression, woven in as the Expression Challenge. So the card reads in two parts
// the whole way through — the 14-day practice bar, and a peer Expression line in its
// own accent (the 4th Pillar), pending or done. The capstone's interactive control
// still surfaces in-flow once the bar is near done; the Expression line just makes the
// 4th Pillar legible from the start, not only at the finish.
//
// Presentational + server-friendly (no hooks of its own; ExpressionAction is the one
// interactive client leaf). The caller fetches the quest signals and passes them in.

export interface JourneyProgressCardProps {
  planId: string
  slug: string
  title: string
  /** Running with a Circle (cohort) vs solo. */
  inCohort: boolean
  /** Whole Journey finished (Trophy earned). */
  finished: boolean
  /** Distinct in-window practice days logged so far. */
  distinctDays: number
  /** Days required to finish (14). */
  daysRequired: number
  /** Whether this Journey has a linked Expression Challenge this season. */
  hasExpression: boolean
  /** Whether the member has completed the Expression Challenge. */
  expressionDone: boolean
  /** The ~4-week window bounds (ISO), when set. */
  windowStartsAt: string | null
  windowEndsAt: string | null
  /** Deep link into the player for the next step. */
  learnHref: string
}

function windowLabel(start: string | null, end: string | null): string | null {
  if (!start && !end) return null
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (start && end) return `${fmt(start)} to ${fmt(end)}`
  if (start) return `Opens ${fmt(start)}`
  return `Closes ${fmt(end as string)}`
}

export function JourneyProgressCard(props: JourneyProgressCardProps) {
  const {
    title,
    inCohort,
    finished,
    distinctDays,
    daysRequired,
    hasExpression,
    expressionDone,
    windowStartsAt,
    windowEndsAt,
    planId,
    learnHref,
  } = props

  const daysDone = Math.min(distinctDays, daysRequired)
  const daysLeft = Math.max(0, daysRequired - daysDone)
  // Goal-gradient fill lives on the bar itself now (ProgressTrack value/max + minVisible),
  // which also restores the real aria scale: valuemax is the 14 days, not a percentage.
  // BEHAVIOUR NOTE: the hand-rolled bar this replaced also showed a 4% sliver at day ZERO
  // so an untouched Journey read as "started". The primitive renders a true zero empty, and
  // that is the honest reading, so day 0 is now an empty track. One logged day still shows
  // a visible sliver rather than a hairline.
  const daysMet = daysDone >= daysRequired
  // The capstone surfaces once the practice-day bar is near or at done (within 2 days),
  // so the member meets the final step right when it becomes reachable.
  const showCapstone = !finished && hasExpression && (daysMet || daysLeft <= 2)

  const win = windowLabel(windowStartsAt, windowEndsAt)

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <SectionHeader
        title={title}
        action={
          <span className="text-meta font-semibold tabular-nums text-subtle">
            {finished ? 'Finished' : `${daysDone}/${daysRequired} days`}
          </span>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {inCohort && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-signal-bg px-2 py-1 text-meta font-medium text-signal-strong">
            <Users className="h-3.5 w-3.5" />
            Running with your Circle
          </span>
        )}
        {win && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-elevated px-2 py-1 text-meta font-medium text-muted">
            <CalendarRange className="h-3.5 w-3.5" />
            {win}
          </span>
        )}
      </div>

      {finished ? (
        <div className="space-y-2">
          <p className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" /> You finished this Journey
          </p>
          {hasExpression && <ExpressionPillarLine expressionDone />}
        </div>
      ) : (
        <>
          {/* The 14-distinct-days bar — credit days done: one logged day always shows a
              visible sliver rather than a rounding-induced hairline (minVisible). A true
              zero renders empty, which is the primitive's law and the honest reading. */}
          <ProgressTrack
            value={daysDone}
            max={daysRequired}
            minVisible={8}
            label={`${daysDone} of ${daysRequired} practice days logged`}
            size="lg"
            animate
          />
          <p className="mt-2 text-meta font-medium text-muted">
            {daysMet
              ? 'All 14 practice days logged.'
              : daysDone === 0
                ? `Log a Practice on 14 different days to finish. ${daysRequired} to go.`
                : `${daysDone} of ${daysRequired} practice days. ${daysLeft} to go.`}
          </p>

          {/* Expression — the Journey's 4th Pillar, peer to the practice bar above and
              visible the whole way through. It reads pending or done in Expression's own
              accent so a member sees it is part of THIS Journey, not a separate step. */}
          {hasExpression && !showCapstone && (
            <div className="mt-3">
              <ExpressionPillarLine expressionDone={expressionDone} />
            </div>
          )}

          {/* Once the practice bar is near or at done, the capstone becomes the
              actionable final step: its interactive control surfaces in-flow. */}
          {showCapstone &&
            (expressionDone ? (
              <div className="mt-3">
                <ExpressionPillarLine expressionDone />
              </div>
            ) : (
              <div
                className="mt-4 rounded-xl border p-3.5"
                style={{
                  ...expressionPillarStyle(),
                  borderColor: 'var(--rank-bright)',
                  background: 'color-mix(in srgb, var(--rank) 8%, var(--color-surface))',
                }}
              >
                <p
                  className="flex items-center gap-1.5 text-body-sm font-semibold text-text"
                  style={{ color: 'var(--rank-deep)' }}
                >
                  <ExpressionIcon className="h-4 w-4" aria-hidden />
                  Expression Challenge: share what you practiced
                </p>
                <ExpressionAction journeyId={planId} />
              </div>
            ))}

          <div className="mt-4">
            <Link
              href={learnHref}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover motion-reduce:transition-none"
            >
              Open this Journey <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </>
      )}
    </section>
  )
}

// The Expression Pillar status line — the 4th Pillar made legible on every Journey.
// In Expression's own accent (plum): a solid done state, or a quiet pending one.
function ExpressionPillarLine({ expressionDone }: { expressionDone: boolean }) {
  return (
    <p
      className="inline-flex items-center gap-1.5 text-meta font-medium"
      style={expressionPillarStyle()}
    >
      {/* The done pip paints a glyph ON the rank CORE, so it is governed by WCAG 1.4.11 (3:1),
          not the 4.5 text bar — and it is now measured: `text-on-primary on rank-plum` in the
          contrast gate's rank family, 4.46:1.
          IT USED TO PAINT NOTHING. The ink was `var(--color-on-primary)`, and `--color-on-primary`
          is declared in globals.css's `@theme inline` block — which INLINES the value into the
          `text-on-primary` utility and does NOT emit the custom property to :root. So the var was
          undefined, the declaration was invalid at computed-value time, and the check glyph fell
          back to the INHERITED --color-text: 2.90:1 on plum in DAWN light, under the 3:1 floor.
          The four other rank crests (standing-hero, season-map, hero-moment ×2) get this right by
          using the `text-on-primary` UTILITY; this one reached for the raw var. Same fix as the
          `--color-rank-*` note in standing-hero.tsx: name the token that actually resolves.
          The core (not `--rank-deep`) stays the fill on purpose — a deep-step pip measures
          1.80:1 against the dark surface and would vanish in dark mode, where the core holds
          4.10:1. Deep is the ground for TEXT (see `solid` in lib/season-ranks.ts), not for a
          small pip that has to be findable on both canvases. */}
      <span
        className={cn(
          'inline-flex h-5 w-5 items-center justify-center rounded-pill',
          expressionDone && 'text-on-primary',
        )}
        style={
          expressionDone
            ? { background: 'var(--rank)' }
            : { background: 'color-mix(in srgb, var(--rank) 14%, var(--color-surface))', color: 'var(--rank-deep)' }
        }
        aria-hidden
      >
        {expressionDone ? <CheckCircle2 className="h-3 w-3" /> : <ExpressionIcon className="h-3 w-3" />}
      </span>
      <span style={{ color: 'var(--rank-deep)' }}>
        {expressionDone ? 'Expression Challenge done' : 'Expression Challenge to come'}
      </span>
    </p>
  )
}
