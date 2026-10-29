// THE LAUNCH CLOCK (the pure half). The guided launch is a game against a twelve minute clock that only runs while the
// person is working: it pauses when they stop and picks up where it left off, even after they close the page. This
// turns the active time kept on the launch row into what the page shows (the minutes left, how they are pacing, the
// ring), and holds the one rule that keeps the kept time honest: a heartbeat adds only the time since the last one,
// never more than thirty seconds, so a closed tab cannot run the clock. It never shames: past twelve minutes the clock
// keeps counting as bonus time and the person keeps going. PURE (no app imports), so a probe can run it under node.

const CLOCK_BUDGET_MS = 12 * 60 * 1000

/** How often the open page reports in while the person is working. */
export const BEAT_EVERY_MS = 15_000
/** The most one heartbeat may add. Twice the beat, so one late beat is forgiven and a gap is not. */
const BEAT_CAP_MS = 30_000
/** No input for this long and the page stops the clock until the person is back. */
export const IDLE_AFTER_MS = 60_000

/** start: the person is back, begin counting from now (adds nothing). beat: still working. stop: paused or leaving
 *  (adds what is owed, then nothing more until the next start). */
export type BeatKind = 'start' | 'beat' | 'stop'

interface ClockKept {
  activeMs: number
  lastBeatAt: string | null
}

/** What the launch row should hold after a heartbeat. A missing, unreadable, or future last beat adds nothing, so a
 *  stray call never invents time. */
export function applyBeat(kept: ClockKept, kind: BeatKind, now: Date): ClockKept {
  const last = kept.lastBeatAt ? Date.parse(kept.lastBeatAt) : NaN
  const gap = Number.isFinite(last) ? now.getTime() - last : 0
  const add = kind === 'start' ? 0 : Math.min(Math.max(gap, 0), BEAT_CAP_MS)
  return { activeMs: Math.max(0, kept.activeMs) + add, lastBeatAt: kind === 'stop' ? null : now.toISOString() }
}

type ClockPace = 'start' | 'ahead' | 'on' | 'bonus'

interface ClockInput {
  /** Active milliseconds kept on the launch: time with the page open and the person working. */
  activeMs: number
  /** How much of the list is done and how long it is, in the same unit (items, not sections). */
  done: number
  total: number
  running: boolean
}

export interface ClockView {
  /** m:ss left, or the bonus time past the twelve minutes. */
  label: string
  /** True once the twelve minutes are used: the label is then bonus time, counting up. */
  bonus: boolean
  /** 0 to 1, how much of the twelve minutes is used (1 in bonus time). */
  used: number
  pace: ClockPace
  running: boolean
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Ahead when they have finished at least what the clock expects by now, on pace otherwise (there is no "behind"),
 *  bonus once the twelve minutes are spent, and the start before any real time is used. */
function paceOf(activeMs: number, done: number, total: number): ClockPace {
  if (activeMs >= CLOCK_BUDGET_MS) return 'bonus'
  if (activeMs < 5_000) return 'start'
  return done >= Math.ceil((activeMs / CLOCK_BUDGET_MS) * total) ? 'ahead' : 'on'
}

export function clockView(input: ClockInput): ClockView {
  const active = Math.max(0, input.activeMs)
  const bonus = active >= CLOCK_BUDGET_MS
  return {
    label: formatClock(bonus ? active - CLOCK_BUDGET_MS : CLOCK_BUDGET_MS - active),
    bonus,
    used: Math.min(1, active / CLOCK_BUDGET_MS),
    pace: paceOf(active, input.done, input.total),
    running: input.running,
  }
}
