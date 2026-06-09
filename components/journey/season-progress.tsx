import { CheckCircle2 } from 'lucide-react'
import type { JourneyProgress } from '@/lib/journey-plans'
import { accentColor } from '@/lib/studio/accents'

// Season-completion progress (docs/JOURNEYS.md §3–§4, §10). The Arc clock: "Week N of 13"
// and qualifying weeks toward the target (default 8). A CIRCULAR arc on mobile (per §10) and
// a labelled bar from sm up — same data, two renderings, no layout shift.
//
// Server Component — pure SVG, token colors only (stroke = the journey accent var).

const SEASON_WEEKS = 13

function pct(qualifying: number, target: number): number {
  if (target <= 0) return 100
  return Math.min(100, Math.round((qualifying / target) * 100))
}

function CircularArc({
  value,
  accent,
  complete,
}: {
  value: number // 0..100
  accent: string | null
  complete: boolean
}) {
  const size = 132
  const stroke = 12
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (Math.max(0, Math.min(100, value)) / 100) * c
  const color = complete ? 'var(--color-success)' : accentColor(accent)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value}% toward completion`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="48%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-text text-xl font-bold tabular-nums"
      >
        {value}%
      </text>
      <text x="50%" y="64%" textAnchor="middle" dominantBaseline="middle" className="fill-subtle text-3xs font-medium">
        complete
      </text>
    </svg>
  )
}

export function SeasonProgress({
  progress,
  accent,
}: {
  progress: JourneyProgress
  accent: string | null
}) {
  const { seasonWeek, qualifyingWeeks, targetWeeks, complete, weeksRemaining } = progress
  const value = pct(qualifyingWeeks, targetWeeks)
  const weekLabel = seasonWeek != null ? `Week ${seasonWeek} of ${SEASON_WEEKS}` : 'Evergreen journey'
  const color = complete ? 'var(--color-success)' : accentColor(accent)

  return (
    <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xs font-bold uppercase tracking-widest text-subtle">Season progress</p>
          <p className="mt-0.5 text-sm font-semibold text-text">{weekLabel}</p>
        </div>
        {complete && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-3 py-1 text-xs font-bold text-success">
            <CheckCircle2 className="h-4 w-4" /> Complete
          </span>
        )}
      </div>

      {/* Mobile: circular arc. */}
      <div className="mt-4 flex items-center gap-5 sm:hidden">
        <CircularArc value={value} accent={accent} complete={complete} />
        <div className="min-w-0 text-sm">
          <p className="font-bold tabular-nums text-text">
            {qualifyingWeeks}
            <span className="font-medium text-subtle"> / {targetWeeks} weeks</span>
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {complete
              ? 'You’ve banked enough weeks to finish.'
              : seasonWeek != null
                ? `${weeksRemaining} ${weeksRemaining === 1 ? 'week' : 'weeks'} left in the season.`
                : 'A qualifying week is one where you show up.'}
          </p>
        </div>
      </div>

      {/* sm+ : labelled bar. */}
      <div className="mt-4 hidden sm:block">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-bold tabular-nums text-text">
            {qualifyingWeeks}
            <span className="font-medium text-subtle"> / {targetWeeks} qualifying weeks</span>
          </span>
          <span className="text-xs font-medium tabular-nums text-subtle">{value}%</span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full transition-[width]" style={{ width: `${value}%`, backgroundColor: color }} />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {complete
            ? 'You’ve banked enough weeks to finish this journey.'
            : seasonWeek != null
              ? `Complete by banking ${targetWeeks} qualifying weeks · ${weeksRemaining} ${weeksRemaining === 1 ? 'week' : 'weeks'} left.`
              : `Complete by banking ${targetWeeks} qualifying weeks.`}
        </p>
      </div>
    </section>
  )
}
