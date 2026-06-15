import Link from 'next/link'
import { Users, ArrowRight, CheckCircle2, CalendarRange, Sparkles } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { ExpressionAction } from '@/app/(main)/crew/challenges/expression-action'

// JourneyProgressCard — the honest arc for one active Journey on the Journey page.
// A Journey is finished by logging its Practices on 14 DISTINCT days inside its
// ~4-week window AND completing its Expression Challenge. This card surfaces that
// real bar, never a "0%" frame: it credits the days already done out of 14, names the
// window dates, and brings the Expression Challenge capstone in-flow so the final step
// is discovered here, not stumbled onto elsewhere.
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
  // Goal-gradient fill: a true credit of the days done, with a sliver showing even at
  // day 0 so it reads as a started ladder, never an empty "0%" bar.
  const pct = daysRequired > 0 ? Math.max(daysDone > 0 ? 8 : 4, Math.round((daysDone / daysRequired) * 100)) : 4
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
          <span className="text-xs font-semibold tabular-nums text-subtle">
            {finished ? 'Finished' : `${daysDone}/${daysRequired} days`}
          </span>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {inCohort && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-signal-bg px-2 py-1 text-xs font-medium text-signal-strong">
            <Users className="h-3.5 w-3.5" />
            Running with your Circle
          </span>
        )}
        {win && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-elevated px-2 py-1 text-xs font-medium text-muted">
            <CalendarRange className="h-3.5 w-3.5" />
            {win}
          </span>
        )}
      </div>

      {finished ? (
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
          <CheckCircle2 className="h-4 w-4" /> You finished this Journey
        </p>
      ) : (
        <>
          {/* The 14-distinct-days bar — credit days done, never frame it as 0%. */}
          <div
            className="h-2 overflow-hidden rounded-full bg-surface-elevated"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={daysRequired}
            aria-valuenow={daysDone}
            aria-label={`${daysDone} of ${daysRequired} practice days logged`}
          >
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs font-medium text-muted">
            {daysMet
              ? 'All 14 practice days logged.'
              : daysDone === 0
                ? `Log a Practice on 14 different days to finish. ${daysRequired} to go.`
                : `${daysDone} of ${daysRequired} practice days. ${daysLeft} to go.`}
          </p>

          {/* The Expression Challenge capstone, brought in-flow as the final step. */}
          {showCapstone &&
            (expressionDone ? (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-success">
                <CheckCircle2 className="h-4 w-4" /> Expression Challenge done
              </p>
            ) : (
              <div className="mt-4 rounded-xl border border-primary-bg bg-primary-bg/30 p-3.5">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
                  <Sparkles className="h-4 w-4 text-primary-strong" aria-hidden />
                  Capstone: share what you practiced
                </p>
                <ExpressionAction journeyId={planId} />
              </div>
            ))}

          <div className="mt-4">
            <Link
              href={learnHref}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover motion-reduce:transition-none"
            >
              Open this Journey <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </>
      )}
    </section>
  )
}
