import { Zap, Flame, Activity } from 'lucide-react'

// A single calm reward LINE under the title (EVENTS-DESIGN §2.3): the check-in Zaps
// reward, the streak it keeps, and the Circle Current it builds — each shown only when
// real (Law 1: real numbers or absent, no urgency, no "0 going"). No KPI tiles, no pill
// row. Social proof (WarmProof: "X going" / "be the first") now lives with the RSVP
// action in the Join box, not here — so the reward reads as one quiet line.
//
// Presentational + server-friendly (no hooks, no fetching).

export function EventRewardStrip({
  checkInZaps,
  isPast,
  streakWeeks,
  circleName,
}: {
  /** Zaps a member earns by checking in at the event. Hides when 0/undefined. */
  checkInZaps?: number | null
  /** The event has already happened (flips the check-in copy). */
  isPast?: boolean
  /** Weeks of the attendance streak this event keeps alive. Hides at 0. */
  streakWeeks?: number | null
  /** The hosting Circle's name — drives the Circle Current clause. Hides for
   *  standalone (non-circle) events. */
  circleName?: string | null
}) {
  const showCheckIn = typeof checkInZaps === 'number' && checkInZaps > 0
  const showStreak = typeof streakWeeks === 'number' && streakWeeks > 0
  const showCurrent = !!circleName
  if (!showCheckIn && !showStreak && !showCurrent) return null

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border pb-4 text-sm text-muted">
      {showCheckIn && (
        <span className="inline-flex items-center gap-1.5 font-medium text-text">
          <Zap className="h-4 w-4 shrink-0 text-primary" />
          {isPast ? `Check in to earn +${checkInZaps} Zaps` : `Check in at the door to earn +${checkInZaps} Zaps`}
        </span>
      )}

      {showStreak && (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="text-subtle">·</span>
          <Flame className="h-3.5 w-3.5 shrink-0 text-primary-strong" /> keeps your {streakWeeks}-week streak
        </span>
      )}

      {showCurrent && (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="text-subtle">·</span>
          <Activity className="h-3.5 w-3.5 shrink-0 text-signal-strong" /> adds to {circleName}&rsquo;s Current
        </span>
      )}
    </div>
  )
}
