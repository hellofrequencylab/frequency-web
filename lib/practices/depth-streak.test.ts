import { describe, it, expect } from 'vitest'
import {
  isDepthHit,
  deriveDepthStreak,
  lastDepthSession,
  nextTargetSeconds,
  matchItLine,
  newBestLine,
  depthStreakLine,
  shiftYmd,
  ymdDiff,
  NEW_BEST_NUDGE_MIN,
  type DepthLog,
} from './depth-streak'

const MIN = (m: number) => m * 60
// A depth-hitting day (Standard = 5 min) unless a smaller target is set.
const hit = (day: string, min = 6): DepthLog => ({ day, secondsDone: MIN(min), secondsTarget: MIN(10) })
// A short day that does NOT hit depth (2 min, no target met).
const miss = (day: string): DepthLog => ({ day, secondsDone: MIN(2), secondsTarget: MIN(10) })

describe('isDepthHit (PD6-2)', () => {
  it('counts a Standard-or-better session', () => {
    expect(isDepthHit({ day: '2026-07-10', secondsDone: MIN(5), secondsTarget: 0 })).toBe(true)
    expect(isDepthHit({ day: '2026-07-10', secondsDone: MIN(15), secondsTarget: 0 })).toBe(true)
  })

  it('does not count a Light-only session with no target', () => {
    expect(isDepthHit({ day: '2026-07-10', secondsDone: MIN(4), secondsTarget: 0 })).toBe(false)
  })

  it('counts a met personal target even below Standard (a gentle practice)', () => {
    // 4-min target, hit exactly — Light tier, but on target, so it counts.
    expect(isDepthHit({ day: '2026-07-10', secondsDone: MIN(4), secondsTarget: MIN(4) })).toBe(true)
  })

  it('honors the ~95% completion tolerance on the target', () => {
    // 10-min target, ended a beat early at 9.6 min → within tolerance, counts.
    expect(isDepthHit({ day: '2026-07-10', secondsDone: MIN(9.6), secondsTarget: MIN(10) })).toBe(true)
    // 10-min target, only 6 min in → below tolerance AND under Standard? 6 min IS Standard, so it
    // counts via the tier bar. Use a sub-Standard short of target to prove the break:
    expect(isDepthHit({ day: '2026-07-10', secondsDone: MIN(4), secondsTarget: MIN(10) })).toBe(false)
  })

  it('does not count a partial (under the Light floor)', () => {
    expect(isDepthHit({ day: '2026-07-10', secondsDone: MIN(2), secondsTarget: 0 })).toBe(false)
  })
})

describe('deriveDepthStreak (PD6-2)', () => {
  const today = '2026-07-17'

  it('counts consecutive qualifying days ending today', () => {
    const logs = [hit('2026-07-15'), hit('2026-07-16'), hit('2026-07-17')]
    expect(deriveDepthStreak(logs, today)).toBe(3)
  })

  it('stays alive when today is not logged yet but yesterday hit', () => {
    const logs = [hit('2026-07-15'), hit('2026-07-16')]
    expect(deriveDepthStreak(logs, today)).toBe(2)
  })

  it('is 0 when neither today nor yesterday hit (the run is over)', () => {
    const logs = [hit('2026-07-14'), hit('2026-07-15')]
    expect(deriveDepthStreak(logs, today)).toBe(0)
  })

  it('breaks on a gap day', () => {
    // Missing 2026-07-16 breaks the run; only today counts.
    const logs = [hit('2026-07-14'), hit('2026-07-15'), hit('2026-07-17')]
    expect(deriveDepthStreak(logs, today)).toBe(1)
  })

  it('breaks on a day that logged but fell short (showing up short does not keep it)', () => {
    const logs = [hit('2026-07-15'), miss('2026-07-16'), hit('2026-07-17')]
    // The short 07-16 breaks it — unlike the attendance streak, depth needs the tier.
    expect(deriveDepthStreak(logs, today)).toBe(1)
  })

  it('buckets by the member-local day string (timezone-safe, no UTC drift)', () => {
    // The caller passes logged_for (already the member-local day), so an evening-Pacific sit that
    // is a day ahead in UTC still lands on the right local day here. Same-string days coalesce.
    const logs = [
      { day: '2026-07-16', secondsDone: MIN(20), secondsTarget: MIN(10) },
      { day: '2026-07-17', secondsDone: MIN(20), secondsTarget: MIN(10) },
    ]
    expect(deriveDepthStreak(logs, today)).toBe(2)
  })

  it('coalesces multiple logs on the same day into one streak day', () => {
    const logs = [hit('2026-07-16'), hit('2026-07-16'), hit('2026-07-17')]
    expect(deriveDepthStreak(logs, today)).toBe(2)
  })

  it('is 0 for an empty history', () => {
    expect(deriveDepthStreak([], today)).toBe(0)
  })
})

describe('lastDepthSession (PD6-1 next-day nudge)', () => {
  const today = '2026-07-17'

  it('returns the prior day and marks it yesterday', () => {
    const last = lastDepthSession([{ day: '2026-07-16', secondsDone: MIN(15), secondsTarget: MIN(15) }], today)
    expect(last).not.toBeNull()
    expect(last!.minutes).toBe(15)
    expect(last!.tier).toBe('heavy')
    expect(last!.wasYesterday).toBe(true)
  })

  it('marks an older prior session as NOT yesterday (honest "Last time")', () => {
    const last = lastDepthSession([{ day: '2026-07-13', secondsDone: MIN(8), secondsTarget: MIN(10) }], today)
    expect(last!.wasYesterday).toBe(false)
    expect(last!.tier).toBe('standard')
  })

  it('ignores today and the future (only a PRIOR session is "last time")', () => {
    const logs = [
      { day: '2026-07-17', secondsDone: MIN(30), secondsTarget: MIN(30) }, // today
      { day: '2026-07-15', secondsDone: MIN(10), secondsTarget: MIN(10) }, // prior
    ]
    expect(lastDepthSession(logs, today)!.day).toBe('2026-07-15')
  })

  it('picks the deepest sit when the latest prior day has several', () => {
    const logs = [
      { day: '2026-07-16', secondsDone: MIN(8), secondsTarget: MIN(10) },
      { day: '2026-07-16', secondsDone: MIN(20), secondsTarget: MIN(10) },
    ]
    expect(lastDepthSession(logs, today)!.minutes).toBe(20)
  })

  it('returns null with no prior history', () => {
    expect(lastDepthSession([], today)).toBeNull()
    expect(lastDepthSession([{ day: '2026-07-17', secondsDone: MIN(10), secondsTarget: 0 }], today)).toBeNull()
  })
})

describe('nextTargetSeconds — the remember / ratchet (PD3-2 / PD7-1)', () => {
  it('remembers the achieved length as the new target', () => {
    // Aimed at 10, went 15 → tomorrow defaults to 15 (the ratchet up).
    expect(nextTargetSeconds(MIN(10), MIN(15))).toBe(MIN(15))
  })

  it('never lowers a target the member already reached (a short day keeps the bar)', () => {
    expect(nextTargetSeconds(MIN(15), MIN(6))).toBe(MIN(15))
  })

  it('seeds from the achieved length when there is no prior target', () => {
    expect(nextTargetSeconds(0, MIN(12))).toBe(MIN(12))
  })

  it('coerces junk to a safe whole-second target', () => {
    expect(nextTargetSeconds(Number.NaN, MIN(10))).toBe(MIN(10))
    expect(nextTargetSeconds(MIN(10), Number.NaN)).toBe(MIN(10))
    expect(nextTargetSeconds(-5, -9)).toBe(0)
  })
})

describe('member-facing copy (voice canon: plain, no em dash, no retired "Deep")', () => {
  it('builds the "match it" line with the tier noun when it was yesterday', () => {
    const line = matchItLine({ minutes: 15, tier: 'heavy', day: '2026-07-16', wasYesterday: true })
    expect(line).toBe('Yesterday: 15 min · Heavy. Match it?')
  })

  it('says "Last time" for an older prior session', () => {
    const line = matchItLine({ minutes: 8, tier: 'standard', day: '2026-07-13', wasYesterday: false })
    expect(line).toBe('Last time: 8 min · Standard. Match it?')
  })

  it('drops the tier noun for a partial prior session (no tier to name)', () => {
    const line = matchItLine({ minutes: 2, tier: 'partial', day: '2026-07-16', wasYesterday: true })
    expect(line).toBe('Yesterday: 2 min. Match it?')
  })

  it('offers the new-best pull', () => {
    expect(newBestLine()).toBe(`+${NEW_BEST_NUDGE_MIN} min for a new best.`)
  })

  it('names a real depth streak with the live tier noun, never below 2 days', () => {
    expect(depthStreakLine(0)).toBeNull()
    expect(depthStreakLine(1)).toBeNull()
    expect(depthStreakLine(2)).toBe('2 days at Standard or better.')
    expect(depthStreakLine(7)).toBe('7 days at Standard or better.')
  })

  it('never emits an em dash or the retired word "Deep"', () => {
    const lines = [
      matchItLine({ minutes: 15, tier: 'heavy', day: '2026-07-16', wasYesterday: true }),
      matchItLine({ minutes: 2, tier: 'partial', day: '2026-07-16', wasYesterday: false }),
      newBestLine(),
      depthStreakLine(4) ?? '',
    ]
    for (const l of lines) {
      expect(l).not.toContain('—')
      expect(l).not.toMatch(/\bDeep\b/)
    }
  })
})

describe('pure date helpers', () => {
  it('shifts and diffs whole days across a month boundary', () => {
    expect(shiftYmd('2026-07-01', -1)).toBe('2026-06-30')
    expect(shiftYmd('2026-07-31', 1)).toBe('2026-08-01')
    expect(ymdDiff('2026-07-17', '2026-07-15')).toBe(2)
    expect(ymdDiff('2026-07-15', '2026-07-17')).toBe(-2)
  })
})
