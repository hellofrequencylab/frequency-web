import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  SLOS,
  CRON_FRESHNESS,
  CRON_MONITORED,
  CRON_UNMONITORED,
  isCronMonitored,
  getSlo,
  meetsSlo,
  cronFreshnessMinutes,
  isCronFresh,
  sloBudgetFraction,
  errorBudget,
  type Slo,
} from '@/lib/observability/slos'

describe('SLOS — the SLO contract is well-formed', () => {
  it('has stable, unique, dot-namespaced ids', () => {
    const ids = SLOS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length) // unique
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/)
  })

  it('mirrors the OBSERVABILITY-BASELINES §4 table (6 SLOs)', () => {
    expect(SLOS).toHaveLength(6)
    expect(getSlo('availability.uptime')?.target).toBe(99.9)
    expect(getSlo('error-rate.requests')?.target).toBe(0.5)
    expect(getSlo('latency.read-hot-paths')?.target).toBe(800)
  })

  it('gives every SLO a unit, direction, signal, breach action, and rationale', () => {
    for (const s of SLOS) {
      expect(['%', 'ms', 'min']).toContain(s.unit)
      expect(['higher-is-better', 'lower-is-better']).toContain(s.direction)
      expect(['page', 'track']).toContain(s.onBreach)
      expect(s.signal.length).toBeGreaterThan(0)
      expect(s.rationale.length).toBeGreaterThan(0)
    }
  })
})

describe('getSlo', () => {
  it('finds a known SLO and returns undefined for an unknown id', () => {
    expect(getSlo('availability.uptime')?.kind).toBe('availability')
    expect(getSlo('nope.nope')).toBeUndefined()
  })
})

describe('meetsSlo — direction-aware comparison', () => {
  const uptime = getSlo('availability.uptime') as Slo // higher-is-better, 99.9%
  const latency = getSlo('latency.read-hot-paths') as Slo // lower-is-better, 800ms

  it('higher-is-better passes at or above target, fails below', () => {
    expect(meetsSlo(uptime, 99.95)).toBe(true)
    expect(meetsSlo(uptime, 99.9)).toBe(true) // boundary inclusive
    expect(meetsSlo(uptime, 99.5)).toBe(false)
  })

  it('lower-is-better passes at or below target, fails above', () => {
    expect(meetsSlo(latency, 500)).toBe(true)
    expect(meetsSlo(latency, 800)).toBe(true) // boundary inclusive
    expect(meetsSlo(latency, 1200)).toBe(false)
  })

  it('a missing (non-finite) measurement never passes', () => {
    expect(meetsSlo(uptime, NaN)).toBe(false)
    expect(meetsSlo(latency, Infinity)).toBe(false)
  })
})

describe('sloBudgetFraction — allowed-failure fraction from the target', () => {
  it('derives the budget for a higher-is-better ratio SLO', () => {
    // uptime 99.9% → 0.1% of the window may fail.
    expect(sloBudgetFraction(getSlo('availability.uptime') as Slo)).toBeCloseTo(0.001, 6)
  })

  it('derives the budget for a lower-is-better ratio SLO', () => {
    // error rate 0.5% → the target *is* the allowed failure fraction.
    expect(sloBudgetFraction(getSlo('error-rate.requests') as Slo)).toBeCloseTo(0.005, 6)
  })

  it('returns null for a non-ratio (latency/lag) SLO', () => {
    expect(sloBudgetFraction(getSlo('latency.read-hot-paths') as Slo)).toBeNull()
    expect(sloBudgetFraction(getSlo('freshness.queue-lag') as Slo)).toBeNull()
  })
})

describe('errorBudget — burn derived from the SLO contract', () => {
  const uptime = getSlo('availability.uptime') as Slo // higher-is-better, 99.9%
  const errors = getSlo('error-rate.requests') as Slo // lower-is-better, 0.5%

  it('computes a half-spent budget for uptime above target', () => {
    const eb = errorBudget(uptime, 99.95)
    expect(eb).not.toBeNull()
    expect(eb?.budget).toBeCloseTo(0.001, 6)
    expect(eb?.used).toBeCloseTo(0.0005, 6)
    expect(eb?.remaining).toBeCloseTo(0.0005, 6)
    expect(eb?.consumedRatio).toBeCloseTo(0.5, 6)
    expect(eb?.withinBudget).toBe(true)
  })

  it('flags an overspent (breached) budget below target', () => {
    const eb = errorBudget(uptime, 99.5) // 0.5% failing vs 0.1% budget → 5x
    expect(eb?.consumedRatio).toBeCloseTo(5, 6)
    expect(eb?.remaining).toBe(0) // clamped, never negative
    expect(eb?.withinBudget).toBe(false)
  })

  it('treats the value itself as failure for a lower-is-better SLO', () => {
    const eb = errorBudget(errors, 0.25) // half the 0.5% budget
    expect(eb?.consumedRatio).toBeCloseTo(0.5, 6)
    expect(eb?.withinBudget).toBe(true)
  })

  it('reports zero consumption for a perfect measurement', () => {
    expect(errorBudget(uptime, 100)?.consumedRatio).toBe(0)
    expect(errorBudget(errors, 0)?.consumedRatio).toBe(0)
  })

  it('returns null for a non-ratio SLO or a non-finite measurement', () => {
    expect(errorBudget(getSlo('latency.read-hot-paths') as Slo, 700)).toBeNull()
    expect(errorBudget(uptime, NaN)).toBeNull()
  })
})

/** The scheduled fleet, read from vercel.json rather than typed here. The contract below used to
 *  assert a literal 18 while vercel.json scheduled 29, and passed for three months: a count is
 *  not a comparison. Every test in this block compares against THIS list. */
function scheduledCrons(): string[] {
  const parsed = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: Array<{ path: string }> }
  const jobs = parsed.crons.map((c) => c.path.replace(/^\/api\/cron\//, ''))
  // The floor, so an unreadable vercel.json cannot make an empty contract look complete.
  expect(jobs.length).toBeGreaterThanOrEqual(15)
  return jobs
}

describe('cron freshness windows (§4a)', () => {
  it('covers every vercel.json cron job exactly once, and names nothing vercel.json does not schedule', () => {
    const all = CRON_FRESHNESS.flatMap((w) => w.jobs)
    const scheduled = scheduledCrons()
    expect(new Set(all).size).toBe(all.length) // no job double-listed
    expect([...all].sort()).toEqual([...scheduled].sort())
  })

  it('resolves a window for a known job and null for an unknown one', () => {
    expect(cronFreshnessMinutes('process-queue')).toBe(4)
    expect(cronFreshnessMinutes('journey-prompt')).toBe(120) // hourly since ADR-1225
    expect(cronFreshnessMinutes('billing-renewals')).toBe(60 * 24 + 60)
    // Weekly, so a day-long window would have called it stale six days in seven.
    expect(cronFreshnessMinutes('weekly-digest')).toBe(60 * 24 * 8)
    expect(cronFreshnessMinutes('not-a-job')).toBeNull()
  })
})

// LIVE-548 / ADR-1574. The monitored set used to exist only as check names in the Healthchecks
// account and as an env value in Vercel; the repo could not compare intent with reality. This
// block is the comparison: every scheduled cron is placed exactly once, and silence is chosen
// with a reason. A cron added next month fails here until someone decides whether it pages.
describe('the monitored set (CRON_MONITORED / CRON_UNMONITORED)', () => {
  it('partitions vercel.json exactly: every scheduled cron in one list, nothing in both, nothing extra', () => {
    const scheduled = scheduledCrons()
    const monitored = [...CRON_MONITORED]
    const unmonitored = CRON_UNMONITORED.map((u) => u.job)
    const all = [...monitored, ...unmonitored]
    expect(new Set(all).size).toBe(all.length) // a job cannot be both
    expect([...all].sort()).toEqual([...scheduled].sort())
  })

  it('every opt-out carries a reason, because silence has to be chosen', () => {
    for (const u of CRON_UNMONITORED) {
      expect(u.reason.trim().length, u.job).toBeGreaterThan(10)
    }
  })

  it('the twenty monitored jobs are the twenty checks the account holds, money and irreversible commitments first (OWN-005)', () => {
    expect(CRON_MONITORED).toHaveLength(20)
    expect(CRON_MONITORED[0]).toBe('process-queue')
    expect(CRON_MONITORED).toContain('billing-renewals')
    expect(CRON_MONITORED).toContain('referral-release')
    expect(CRON_MONITORED).toContain('space-follower-event-reminders')
  })

  it('isCronMonitored answers for a monitored job, an opt-out, and a stranger', () => {
    expect(isCronMonitored('process-queue')).toBe(true)
    expect(isCronMonitored('embed-events')).toBe(false)
    expect(isCronMonitored('not-a-job')).toBe(false)
  })
})

describe('isCronFresh', () => {
  const now = 1_000_000_000_000

  it('is fresh when the last success is within the window', () => {
    // process-queue: 4 min window. 3 min ago → fresh.
    expect(isCronFresh('process-queue', now - 3 * 60_000, now)).toBe(true)
  })

  it('is stale when the last success is older than the window', () => {
    // process-queue: 4 min window. 5 min ago → stale.
    expect(isCronFresh('process-queue', now - 5 * 60_000, now)).toBe(false)
  })

  it('treats the window boundary as still fresh', () => {
    expect(isCronFresh('process-queue', now - 4 * 60_000, now)).toBe(true)
  })

  it('is never fresh for an unknown job or a never-succeeded job', () => {
    expect(isCronFresh('not-a-job', now, now)).toBe(false)
    expect(isCronFresh('process-queue', null, now)).toBe(false)
  })

  it('is not fooled by a future timestamp (negative age)', () => {
    expect(isCronFresh('process-queue', now + 60_000, now)).toBe(false)
  })
})
