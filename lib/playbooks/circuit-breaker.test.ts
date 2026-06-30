import { describe, it, expect } from 'vitest'
import {
  rejectionRate,
  tripsBreaker,
  computeBreakerState,
  failClosedForTier,
  pausedFromRuns,
  BREAKER_MIN_RUNS,
  BREAKER_ABSOLUTE_RATE,
  BREAKER_DEFAULT_BASELINE,
  type PlaybookRunTally,
} from './circuit-breaker'

// The circuit breaker PURE math (Resonance Engine Phase 3 · ADR-384). A spike trips; calm does not;
// cold-start (no runs) never trips. The IO read (getPausedPlaybooks / isPlaybookPaused) is fail-safe
// + fail-closed-for-outbound and is exercised via failClosedForTier here (the documented choice).

const tally = (total: number, dismissed: number, unsubscribed = 0): PlaybookRunTally => ({
  total,
  dismissed,
  unsubscribed,
})

describe('rejectionRate', () => {
  it('is (dismissed + unsubscribed) / total, clamped', () => {
    expect(rejectionRate(tally(10, 3))).toBeCloseTo(0.3)
    expect(rejectionRate(tally(10, 5, 2))).toBeCloseTo(0.7)
  })

  it('is 0 for a cold start (no runs)', () => {
    expect(rejectionRate(tally(0, 0))).toBe(0)
  })

  it('never exceeds 1 even with malformed counts', () => {
    expect(rejectionRate(tally(2, 5))).toBe(1)
  })
})

describe('tripsBreaker', () => {
  it('does NOT trip on a cold start (no runs)', () => {
    expect(tripsBreaker(tally(0, 0), BREAKER_DEFAULT_BASELINE)).toBe(false)
  })

  it('does NOT trip below the minimum run count, even at a high rate', () => {
    expect(tripsBreaker(tally(BREAKER_MIN_RUNS - 1, BREAKER_MIN_RUNS - 1), 0.1)).toBe(false)
  })

  it('does NOT trip when the room is calm (low rejection rate)', () => {
    expect(tripsBreaker(tally(20, 2), 0.1)).toBe(false) // 10% dismiss, fine
  })

  it('TRIPS on a spike: high rate, well above the learned baseline', () => {
    // 16/20 = 80% dismiss vs a 15% baseline -> a clear regression.
    expect(tripsBreaker(tally(20, 16), 0.15)).toBe(true)
  })

  it('does NOT trip when a high rate is the playbook NORM (baseline already high)', () => {
    // 14/20 = 70% dismiss, but the baseline is also 70% -> no spike over its own norm.
    expect(tripsBreaker(tally(20, 14), 0.7)).toBe(false)
  })

  it('requires BOTH the absolute ceiling AND the spike margin', () => {
    // Above baseline by a wide margin, but below the absolute ceiling -> no trip.
    expect(tripsBreaker(tally(20, 10), 0.05)).toBe(false) // 50% < 60% absolute
    // At the absolute ceiling and well above baseline -> trips.
    expect(tripsBreaker(tally(20, 13), 0.1)).toBe(true) // 65% >= 60% and >= 0.1+0.25
  })

  it('treats a non-finite baseline as the calm default', () => {
    expect(tripsBreaker(tally(20, 16), Number.NaN)).toBe(true)
  })
})

describe('computeBreakerState', () => {
  it('reports paused with a plain, dashless reason on a spike', () => {
    const s = computeBreakerState(tally(20, 16), 0.15)
    expect(s.paused).toBe(true)
    expect(s.rate).toBeCloseTo(0.8)
    expect(s.baseline).toBeCloseTo(0.15)
    expect(s.reason).not.toMatch(/[–—]/)
  })

  it('reports open + running normally when calm', () => {
    const s = computeBreakerState(tally(20, 2), 0.1)
    expect(s.paused).toBe(false)
    expect(s.reason).toBe('Running normally.')
  })

  it('clamps the absolute-rate constant into a sane range (sanity on the knob)', () => {
    expect(BREAKER_ABSOLUTE_RATE).toBeGreaterThan(0)
    expect(BREAKER_ABSOLUTE_RATE).toBeLessThanOrEqual(1)
  })
})

describe('pausedFromRuns (the windowing over playbook_runs)', () => {
  const NOW = Date.parse('2026-06-24T12:00:00Z')
  const DAY = 86_400_000
  const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString()
  // playbook_runs stamps `started_at` (NOT `created_at`); the breaker windows on that real column.
  const run = (playbookId: string, status: string, daysAgo: number) => ({
    playbook_id: playbookId,
    status,
    started_at: at(daysAgo),
  })

  it('cold start (no runs) pauses nothing', () => {
    expect(pausedFromRuns([], NOW).size).toBe(0)
  })

  it('a recent dismiss spike trips, measured against an older calm baseline', () => {
    const rows = [
      // Baseline window (older than 14d): 20 runs, mostly done -> ~10% dismiss.
      ...Array.from({ length: 18 }, () => run('reengage_winback', 'done', 30)),
      ...Array.from({ length: 2 }, () => run('reengage_winback', 'dismissed', 30)),
      // Recent window (within 14d): 12 runs, mostly dismissed -> ~83% dismiss = a spike.
      ...Array.from({ length: 2 }, () => run('reengage_winback', 'done', 3)),
      ...Array.from({ length: 10 }, () => run('reengage_winback', 'dismissed', 3)),
    ]
    expect(pausedFromRuns(rows, NOW).has('reengage_winback')).toBe(true)
  })

  it('a steadily calm playbook never trips', () => {
    const rows = [
      ...Array.from({ length: 20 }, () => run('churn_high_streak_save', 'done', 30)),
      ...Array.from({ length: 12 }, () => run('churn_high_streak_save', 'done', 3)),
      ...Array.from({ length: 1 }, () => run('churn_high_streak_save', 'dismissed', 3)),
    ]
    expect(pausedFromRuns(rows, NOW).has('churn_high_streak_save')).toBe(false)
  })

  it('ignores rows with no playbook id', () => {
    const rows = [run('', 'dismissed', 3), run('', 'dismissed', 3)]
    expect(pausedFromRuns(rows, NOW).size).toBe(0)
  })

  // Regression for the column bug: the breaker windows on `started_at` (the real playbook_runs
  // column), so the recent/baseline split is time-sensitive. The SAME dismiss-heavy spike trips
  // only when those runs land INSIDE the recent window; pushed past it (all in baseline) it must
  // not. If the reader pointed at a missing/wrong column, every row would window identically and
  // this pair could not both hold.
  it('a dismiss spike trips only when it lands INSIDE the recent window (time window matters)', () => {
    const spike = (daysAgo: number) => [
      // Older calm baseline so a genuine recent regression has something to spike over.
      ...Array.from({ length: 18 }, () => run('reengage_winback', 'done', 45)),
      ...Array.from({ length: 2 }, () => run('reengage_winback', 'dismissed', 45)),
      // 12 mostly-dismissed runs, placed `daysAgo`.
      ...Array.from({ length: 2 }, () => run('reengage_winback', 'done', daysAgo)),
      ...Array.from({ length: 10 }, () => run('reengage_winback', 'dismissed', daysAgo)),
    ]
    // Inside the 14d recent window -> a measured spike -> trips.
    expect(pausedFromRuns(spike(3), NOW).has('reengage_winback')).toBe(true)
    // The exact same 12 runs pushed to 30d ago (baseline window, not recent) -> nothing recent to
    // measure -> does NOT trip. Only the `started_at` comparison separates these two.
    expect(pausedFromRuns(spike(30), NOW).has('reengage_winback')).toBe(false)
  })
})

describe('failClosedForTier (the documented fail-closed-for-outbound choice)', () => {
  it('outbound tiers (suggest, never_auto) fail CLOSED: suppress on an unknown breaker read', () => {
    expect(failClosedForTier('suggest')).toBe(true)
    expect(failClosedForTier('never_auto')).toBe(true)
  })

  it('in-product auto (reversible, no member touch) may proceed on an unknown read', () => {
    expect(failClosedForTier('auto')).toBe(false)
  })
})
