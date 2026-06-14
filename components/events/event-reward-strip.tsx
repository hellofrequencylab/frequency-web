import { Zap, QrCode, Flame, Activity } from 'lucide-react'
import { WarmProof, type WarmProofAttendee } from '@/components/events/warm-proof'

// EventRewardStrip (EVENTS-DESIGN §2.3, A3) — the calm gamification + social-proof
// row that sits between the title band and the two-column grid.
//
// It honours the gamified-stat law: the four KPI tiles (Zaps/Rank/Streak/Gems) are
// reserved for member standing (StandingTiles), so an event NEVER renders those as
// KPI tiles. Event rewards are quiet inline chips in the established idiom (icon +
// token tint), matching standing-tiles.tsx — not stat cards.
//
// Presentational + server-friendly (no hooks, no fetching). The page computes every
// value and passes it in. Each chip renders ONLY when its value is genuine (Law 1:
// numbers are real or the chip is absent — no "0 going", no countdowns, no fake
// urgency). A brand-new event collapses to just the Zap chip + WarmProof's warm
// invite. The streak chip says what it PROTECTS, never threatens loss.

const CHIP = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-semibold'

export function EventRewardStrip({
  checkInZaps,
  isPast,
  streakWeeks,
  circleName,
  going,
  fromYourCircles = 0,
  maybe = 0,
  guests = 0,
  faces = [],
  nearFull = false,
  spotsLeft = null,
}: {
  /** Zaps a member earns by checking in at the event. Chip hides when 0/undefined. */
  checkInZaps?: number | null
  /** The event has already happened (flips the check-in copy). */
  isPast?: boolean
  /** Weeks of the attendance streak this event keeps alive. Chip hides at 0. */
  streakWeeks?: number | null
  /** The hosting Circle's name — drives the Circle Current chip. Hides for
   *  non-circle (standalone) events. */
  circleName?: string | null
  /** Confirmed 'going' count (drives WarmProof's never-low floor). */
  going: number
  fromYourCircles?: number
  maybe?: number
  guests?: number
  faces?: WarmProofAttendee[]
  nearFull?: boolean
  spotsLeft?: number | null
}) {
  const showCheckIn = typeof checkInZaps === 'number' && checkInZaps > 0
  const showStreak = typeof streakWeeks === 'number' && streakWeeks > 0
  const showCurrent = !!circleName

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-border pb-4">
      {/* Zaps for checking in — the always-useful reward. Real number, no urgency. */}
      {showCheckIn && (
        <span className={`${CHIP} bg-primary-bg/40 text-text`}>
          <Zap className="h-3 w-3 text-primary" />
          {isPast ? `Check in to earn ${checkInZaps} Zaps` : `+${checkInZaps} Zaps when you check in`}
        </span>
      )}

      {/* Where to check in — the door reward, calm. */}
      <span className={`${CHIP} bg-primary-bg/40 text-text`}>
        <QrCode className="h-3 w-3 text-primary-strong" />
        {isPast ? 'Check in to earn' : 'Check in at the door'}
      </span>

      {/* Attendance streak — says what it KEEPS, never threatens loss. */}
      {showStreak && (
        <span className={`${CHIP} bg-primary-bg/40 text-text`}>
          <Flame className="h-3 w-3 text-primary-strong" />
          Keeps your {streakWeeks}-week streak
        </span>
      )}

      {/* Circle Current — the one place signal-teal appears (canonical Current tone). */}
      {showCurrent && (
        <span className={`${CHIP} bg-signal-bg text-signal-strong`}>
          <Activity className="h-3 w-3" />
          Adds to {circleName}&rsquo;s Current
        </span>
      )}

      {/* Warm proof: real, never-low counts + the avatar pile. */}
      <WarmProof
        going={going}
        fromYourCircles={fromYourCircles}
        maybe={maybe}
        guests={guests}
        faces={faces}
        nearFull={nearFull}
        spotsLeft={spotsLeft}
      />
    </div>
  )
}
