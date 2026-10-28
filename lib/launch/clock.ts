// THE LAUNCH CLOCK (the pure half). The guided launch is a game against a twelve minute clock that only runs while the
// person is working: it pauses when they stop and picks up where it left off, even after they close the page. This
// turns the active time kept on the launch row into what the page shows: the minutes left, how they are pacing, and
// the ring. It never shames: when the twelve minutes are up the clock keeps counting as bonus time and the person
// keeps going. PURE (no app imports), so a probe can run it under node.

export const CLOCK_BUDGET_MS = 12 * 60 * 1000

export type ClockPace = 'start' | 'ahead' | 'on' | 'bonus'

export interface ClockInput {
  /** Active milliseconds kept on the launch: time with the page open and the person working. */
  activeMs: number
  stagesDone: number
  stagesTotal: number
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

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** How the person is pacing: ahead when they have finished more stages than the clock expects, on pace when level,
 *  bonus once the twelve minutes are spent. Before any time is used it is the start. */
export function pace(input: ClockInput): ClockPace {
  if (input.activeMs >= CLOCK_BUDGET_MS) return 'bonus'
  if (input.activeMs < 5_000) return 'start'
  const expected = (input.activeMs / CLOCK_BUDGET_MS) * input.stagesTotal
  return input.stagesDone >= Math.ceil(expected) ? 'ahead' : 'on'
}

export function clockView(input: ClockInput): ClockView {
  const active = Math.max(0, input.activeMs)
  const bonus = active >= CLOCK_BUDGET_MS
  return {
    label: formatClock(bonus ? active - CLOCK_BUDGET_MS : CLOCK_BUDGET_MS - active),
    bonus,
    used: Math.min(1, active / CLOCK_BUDGET_MS),
    pace: pace({ ...input, activeMs: active }),
    running: input.running,
  }
}
