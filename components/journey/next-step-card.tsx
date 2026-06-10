import { Clock, CalendarCheck, Sparkles } from 'lucide-react'
import type { JourneyProgress, JourneyProgressItem } from '@/lib/journey-plans'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { TIER_META, formatMinutes } from '@/components/journey/tier-meta'
import { JourneyLogButton } from '@/components/journey/journey-log-button'

// The Next-Step card — the dominant element of active mode (docs/JOURNEYS.md §10).
// Full-width, accent-tinted, one big Log tap target. Shows the resolved tier's title +
// est minutes + cadence + "X/7 days this week". When every step is on track this week it
// flips to a calm "in rhythm" state (no false next-step), still letting the member log.
//
// Server Component — all data comes from `progress` (the page's single load); the only
// client island is the Log button.

function daysLine(item: JourneyProgressItem): string {
  return `${item.loggedThisWeek}/${item.target} ${item.target === 1 ? 'day' : 'days'} this week`
}

export function NextStepCard({
  progress,
  accent,
  circleId,
}: {
  progress: JourneyProgress
  accent: string | null
  circleId?: string | null
}) {
  const item = progress.nextItem
  const allOnTrack = item == null
  const planTitle = progress.plan.title

  // Display step: the current step, or — when fully in rhythm — the first step, so the
  // member can still log ahead.
  const step: JourneyProgressItem | undefined = item ?? progress.items[0]
  if (!step) return null

  const tier = TIER_META[step.resolvedTier]
  const content = step.tierContent
  const title = content?.title ?? step.practice?.title ?? 'Today’s practice'
  const minutes = formatMinutes(content?.est_minutes)
  const cadence = step.cadence ?? step.practice?.cadence ?? null

  return (
    <section
      className="overflow-hidden rounded-3xl border p-5 shadow-sm sm:p-6"
      style={{ borderColor: accentTint(accent, 32), backgroundColor: accentTint(accent, 8) }}
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className="inline-flex items-center gap-1.5 text-2xs font-bold uppercase tracking-widest"
          style={{ color: accentColor(accent) }}
        >
          {allOnTrack ? <Sparkles className="h-3.5 w-3.5" /> : <CalendarCheck className="h-3.5 w-3.5" />}
          {allOnTrack ? 'In rhythm this week' : 'Your next step'}
        </p>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: accentTint(accent, 18), color: accentColor(accent) }}
          title={tier.blurb}
        >
          <span aria-hidden>{tier.glyph}</span> {tier.label}
        </span>
      </div>

      <h2 className="mt-3 text-balance text-lg font-bold leading-snug text-text sm:text-xl">{title}</h2>

      {content?.body && (
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted">{content.body}</p>
      )}
      {!content?.body && step.practice?.description && (
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.practice.description}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
        {minutes && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {minutes}
          </span>
        )}
        {cadence && (
          <span className="inline-flex items-center gap-1">
            <CalendarCheck className="h-3.5 w-3.5" /> {cadence}
          </span>
        )}
        <span className="font-medium tabular-nums text-muted">{daysLine(step)}</span>
      </div>

      <div className="mt-5">
        {step.practice ? (
          <JourneyLogButton
            practiceId={step.practice.id}
            circleId={circleId}
            planTitle={planTitle}
            label={allOnTrack ? 'Log again' : 'Log today'}
            full
          />
        ) : null}
      </div>

      {allOnTrack && (
        <p className="mt-3 text-center text-xs text-muted">
          Every step is on track this week. Beautifully done.
        </p>
      )}
    </section>
  )
}
