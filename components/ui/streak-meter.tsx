import { Snowflake } from 'lucide-react'

// StreakMeter — a streak as a run of day dots, with freeze tokens (DAWN
// 2026-08-03 §5; BRIEF-06 §2.12). The emotional contract is the whole point:
//   • done   — a filled primary dot (the day happened).
//   • missed — a HOLLOW dot. Never red, never a danger token: a missed day is
//     an absence, not a failure state.
//   • frozen — a soft info-teal dot with a small snowflake. A freeze token
//     bridged the day, and it reads as the kindness it is, not as a penalty.
//
// Presentational + server-friendly (no hooks). The dot run is one accessible
// image (per-dot labels would read as noise in a screen reader); the summary
// sentence carries the counts.
//
//   <StreakMeter days={['done', 'done', 'frozen', 'done', 'missed', 'done', 'done']}
//                count={12} label="day streak" />

export type StreakDay = 'done' | 'missed' | 'frozen'

const DOT: Record<StreakDay, string> = {
  done: 'bg-primary',
  missed: 'border border-border-strong bg-transparent',
  frozen: 'bg-info-bg text-info',
}

export function StreakMeter({
  days,
  count,
  label = 'day streak',
}: {
  /** Most recent run of days, oldest first. */
  days: StreakDay[]
  /** The streak count, shown mono beside the dots (e.g. 12). */
  count?: number
  /** Label for the count (default "day streak"). */
  label?: string
}) {
  const frozen = days.filter((d) => d === 'frozen').length
  // EMPTY state (docs/INTERACTION-STATES.md §2, Reading class): zero is a real answer. An
  // empty run used to render an empty box labelled "0 of the last 0 days done", which is both
  // unreadable and faintly accusing. It now reads as a beginning, in the same tone as a missed
  // day: an absence, not a failure.
  const empty = days.length === 0
  const summary = empty
    ? 'No days logged yet'
    : `${days.filter((d) => d === 'done').length} of the last ${days.length} days done` +
      (frozen > 0 ? `, ${frozen} bridged by a streak freeze` : '')
  return (
    <div className="inline-flex items-center gap-2.5">
      {/* The empty branch is text-xs + text-muted, not text-2xs + text-subtle: it is the one
          branch READ as a sentence rather than scanned as a legend, and subtle-at-tiny is the
          sub-AA pairing the adoption ratchet tracks. */}
      {empty ? (
        <span className="text-xs font-medium text-muted">{summary}</span>
      ) : (
        <span role="img" aria-label={summary} className="inline-flex items-center gap-1">
          {days.map((day, i) => (
            <span
              key={i}
              data-day={day}
              aria-hidden
              className={`inline-flex h-2.5 w-2.5 items-center justify-center rounded-pill ${DOT[day]}`}
            >
              {day === 'frozen' && <Snowflake className="h-2 w-2" />}
            </span>
          ))}
        </span>
      )}
      {count != null && (
        <span className="inline-flex items-baseline gap-1.5">
          <span className="font-mono text-sm font-semibold tabular-nums leading-none text-text">{count}</span>
          <span className="text-2xs font-medium text-muted">{label}</span>
        </span>
      )}
    </div>
  )
}
