import { describe, it, expect } from 'vitest'
import {
  derivePracticeStreak,
  shiftDay,
  dayDiff,
  pauseCoveredDays,
  isResting,
  frozenDaysFrom,
  streakDayRun,
  MAX_PAUSE_DAYS,
} from './practice-streak'
import { memberDay } from './member-day'

const TODAY = '2026-06-06'
const set = (...days: string[]) => new Set(days)
const back = (n: number) => shiftDay(TODAY, -n)

describe('date helpers', () => {
  it('shifts across month boundaries', () => {
    expect(shiftDay('2026-06-01', -1)).toBe('2026-05-31')
    expect(shiftDay('2026-02-28', 1)).toBe('2026-03-01') // 2026 is not a leap year
    expect(shiftDay('2026-06-06', 0)).toBe('2026-06-06')
  })
  it('counts whole-day differences', () => {
    expect(dayDiff('2026-06-06', '2026-06-04')).toBe(2)
    expect(dayDiff('2026-06-01', '2026-05-30')).toBe(2)
    expect(dayDiff('2026-06-06', '2026-06-06')).toBe(0)
  })
})

describe('derivePracticeStreak', () => {
  it('is zero with no logs', () => {
    const r = derivePracticeStreak(set(), set(), TODAY)
    expect(r).toEqual({ current: 0, loggedToday: false, alive: false })
  })

  it('counts consecutive days ending today', () => {
    const r = derivePracticeStreak(set(back(0), back(1), back(2)), set(), TODAY)
    expect(r.current).toBe(3)
    expect(r.loggedToday).toBe(true)
    expect(r.alive).toBe(true)
  })

  it('stays alive but at-risk when only yesterday is logged', () => {
    const r = derivePracticeStreak(set(back(1), back(2)), set(), TODAY)
    expect(r.current).toBe(2)
    expect(r.loggedToday).toBe(false)
    expect(r.alive).toBe(true)
  })

  it('breaks when the most recent log is two days ago', () => {
    const r = derivePracticeStreak(set(back(2), back(3)), set(), TODAY)
    expect(r.alive).toBe(false)
    expect(r.current).toBe(0)
  })

  it('bridges a single missed day with a freeze', () => {
    // logged today + day-before-yesterday; yesterday missing but frozen.
    const r = derivePracticeStreak(set(back(0), back(2), back(3)), set(back(1)), TODAY)
    expect(r.current).toBe(4)
    expect(r.alive).toBe(true)
  })

  it('a freeze far from the run does not extend it', () => {
    const r = derivePracticeStreak(set(back(0), back(1)), set(back(5)), TODAY)
    expect(r.current).toBe(2)
  })

  it('handles a single day logged today', () => {
    const r = derivePracticeStreak(set(back(0)), set(), TODAY)
    expect(r.current).toBe(1)
    expect(r.loggedToday).toBe(true)
  })
})

describe('pauseCoveredDays (the "life happens" rest window)', () => {
  it('is empty with no window', () => {
    expect(pauseCoveredDays(null, TODAY)).toEqual([])
    expect(pauseCoveredDays(undefined, TODAY)).toEqual([])
  })

  it('covers every passed day in the window, inclusive', () => {
    const rest = { from: back(3), through: back(1) }
    expect(pauseCoveredDays(rest, TODAY)).toEqual([back(3), back(2), back(1)])
  })

  it('never covers the future — clamps the window end to today', () => {
    const rest = { from: back(1), through: shiftDay(TODAY, 5) }
    // only yesterday and today have actually passed
    expect(pauseCoveredDays(rest, TODAY)).toEqual([back(1), back(0)])
  })

  it('returns nothing for a window that has not started yet', () => {
    const rest = { from: shiftDay(TODAY, 2), through: shiftDay(TODAY, 4) }
    expect(pauseCoveredDays(rest, TODAY)).toEqual([])
  })

  it('caps the span at MAX_PAUSE_DAYS so it can never freeze unbounded', () => {
    const rest = { from: shiftDay(TODAY, -100), through: TODAY }
    expect(pauseCoveredDays(rest, TODAY)).toHaveLength(MAX_PAUSE_DAYS)
  })
})

describe('isResting', () => {
  it('is true inside the window and false outside it', () => {
    expect(isResting({ from: back(2), through: back(1) }, TODAY)).toBe(false)
    expect(isResting({ from: back(1), through: back(0) }, TODAY)).toBe(true)
    expect(isResting({ from: TODAY, through: shiftDay(TODAY, 3) }, TODAY)).toBe(true)
    expect(isResting(null, TODAY)).toBe(false)
  })
})

describe('an evening-Pacific log counts for the local day, not the UTC next day (tz bug)', () => {
  // 8pm PDT on 2026-07-12 is 2026-07-13T03:00Z — a UTC "today" is already tomorrow.
  const now = new Date('2026-07-13T03:00:00Z')
  const pstDay = memberDay('America/Los_Angeles', now)
  const utcDay = memberDay('UTC', now)

  it('resolves the member-local day (PDT), which differs from UTC in the evening', () => {
    expect(pstDay).toBe('2026-07-12')
    expect(utcDay).toBe('2026-07-13')
  })

  it('reads as logged-today under the member-local day (the fix)', () => {
    // The log was written under the member-local day (practice_logs.logged_for).
    const logged = new Set([pstDay])
    const r = derivePracticeStreak(logged, new Set(), pstDay)
    expect(r.loggedToday).toBe(true)
    expect(r.alive).toBe(true)
    expect(r.current).toBe(1)
  })

  it('would falsely read as at-risk under a UTC "today" (the bug this fixes)', () => {
    // Same log, but anchored on the UTC day → the log looks like "yesterday" and today
    // reads as missed. This is the regression the tz-aware resolver removes.
    const logged = new Set([pstDay])
    const r = derivePracticeStreak(logged, new Set(), utcDay)
    expect(r.loggedToday).toBe(false)
  })
})

describe('a planned rest bridges the streak like a reserve day', () => {
  it('survives a break when its days are folded into the frozen set', () => {
    // Logged today + four days ago; the three days between were a planned rest.
    const logged = set(back(0), back(4), back(5))
    const restDays = pauseCoveredDays({ from: back(3), through: back(1) }, TODAY)
    const frozen = new Set([...set(), ...restDays])
    const r = derivePracticeStreak(logged, frozen, TODAY)
    expect(r.alive).toBe(true)
    expect(r.current).toBe(6) // today + 3 rested + 2 logged before
  })
})

// ── The frozen-day set, and the run a surface paints (LIVE-101) ──────────────
// StreakMeter has painted three day states since it shipped — done, missed, and `frozen`,
// the "life happens" kindness. The third had NO live producer: the rail built its 7-day
// strip from `practice_logs` alone as a boolean[], and a day the reserve bridged or a rest
// window covered writes no log row, so it arrived as `false` and painted as MISSED. The
// data was never missing — getPracticeStreak has always bridged the COUNT with exactly this
// set — it was just never returned. These lock the two pure halves of the plumbing.

describe('frozenDaysFrom', () => {
  it('is empty for a member with no stored streak augmentation', () => {
    expect(frozenDaysFrom(null, TODAY).size).toBe(0)
    expect(frozenDaysFrom({}, TODAY).size).toBe(0)
    expect(frozenDaysFrom({ practiceStreak: {} }, TODAY).size).toBe(0)
  })

  it('carries the reserve days already spent', () => {
    const frozen = frozenDaysFrom({ practiceStreak: { frozenDates: [back(2), back(5)] } }, TODAY)
    expect([...frozen].sort()).toEqual([back(5), back(2)].sort())
  })

  it('folds in every day an active rest window covers, and never the future', () => {
    const frozen = frozenDaysFrom(
      { practiceStreak: { rest: { from: back(2), through: shiftDay(TODAY, 3) } } },
      TODAY,
    )
    expect([...frozen].sort()).toEqual([back(2), back(1), back(0)].sort())
    expect(frozen.has(shiftDay(TODAY, 1))).toBe(false)
  })

  it('is the SAME set getPracticeStreak bridges the count with', () => {
    // The read path's own construction, reproduced: reserve days ∪ pause days. If these ever
    // diverge, a day can bridge the number while painting as an absence — the exact split that
    // let the rail tell a resting member they had slipped.
    const meta = {
      practiceStreak: {
        frozenDates: [back(6)],
        rest: { from: back(2), through: back(1) },
      },
    }
    const expected = new Set([back(6), ...pauseCoveredDays({ from: back(2), through: back(1) }, TODAY)])
    expect([...frozenDaysFrom(meta, TODAY)].sort()).toEqual([...expected].sort())
  })
})

describe('streakDayRun', () => {
  it('returns `length` days, oldest first, ending at the anchor', () => {
    const run = streakDayRun(TODAY, set(TODAY), set())
    expect(run).toHaveLength(7)
    expect(run[6]).toBe('done')
    expect(run.slice(0, 6)).toEqual(Array(6).fill('missed'))
  })

  // THE EQUIVALENCE PROOF. `done` and `missed` must render exactly as they did before the
  // tri-state landed, so the pre-change expression from right-sidebar.tsx is reproduced here
  // VERBATIM as the oracle and the new run is checked against it. Anchors cross a month end, a
  // year end and a short month, because the old code walked by milliseconds and the new one
  // walks by calendar date.
  const oldBooleanRun = (anchor: string, loggedDays: Set<string>) => {
    const anchorMs = Date.parse(`${anchor}T00:00:00Z`)
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(anchorMs - (6 - i) * 86_400_000).toISOString().slice(0, 10)
      return loggedDays.has(day)
    })
  }

  it('with no freezes, is byte-for-byte the run the boolean[] version produced', () => {
    for (const anchor of ['2026-06-06', '2026-03-02', '2027-01-03', '2026-12-31', '2026-02-28']) {
      for (const pattern of [0b0000000, 0b1111111, 0b1010101, 0b0110011, 0b0000001, 0b1000000]) {
        const days = Array.from({ length: 7 }, (_, i) => shiftDay(anchor, i - 6))
        const logged = new Set(days.filter((_, i) => (pattern >> (6 - i)) & 1))
        expect(streakDayRun(anchor, logged, set())).toEqual(
          oldBooleanRun(anchor, logged).map((on) => (on ? 'done' : 'missed')),
        )
      }
    }
  })

  it('paints a bridged day as `frozen` instead of the absence it looks like in the logs', () => {
    const meta = { practiceStreak: { frozenDates: [back(3)] } }
    const logged = set(back(6), back(5), back(4), back(2), back(1), back(0))
    const run = streakDayRun(TODAY, logged, frozenDaysFrom(meta, TODAY))
    expect(run).toEqual(['done', 'done', 'done', 'frozen', 'done', 'done', 'done'])
    // Without the frozen set that same day is indistinguishable from a miss — this is the bug.
    expect(streakDayRun(TODAY, logged, set())[3]).toBe('missed')
  })

  it('paints a whole rest window as frozen, so a planned break never reads as a slip', () => {
    const meta = { practiceStreak: { rest: { from: back(3), through: back(1) } } }
    const run = streakDayRun(TODAY, set(back(6), back(5), back(4), back(0)), frozenDaysFrom(meta, TODAY))
    expect(run).toEqual(['done', 'done', 'done', 'frozen', 'frozen', 'frozen', 'done'])
  })

  it('lets showing up outrank a bridge: a logged day inside a pause is `done`', () => {
    const meta = { practiceStreak: { rest: { from: back(2), through: back(0) } } }
    const run = streakDayRun(TODAY, set(back(1)), frozenDaysFrom(meta, TODAY))
    expect(run.slice(4)).toEqual(['frozen', 'done', 'frozen'])
  })
})
