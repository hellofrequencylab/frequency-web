import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluateCircuitBreaker, type BreakerState } from './circuit-breaker'

// The Vera autonomous-send circuit breaker. This is the safety kernel: the pure gate only ever
// returns `allowed` when EVERY guard is clear, each guard denies independently, precedence holds,
// and an anomaly both blocks AND signals a trip (`trips: true`).

// A state where every guard is clear — the one and only path to `allowed`.
const allClear: BreakerState = {
  autonomyEnabled: true,
  breakerArmed: true,
  categoryEnabled: true,
  recipientSentInDay: 0,
  recipientCapPerDay: 1,
  platformSentInHour: 0,
  platformCapPerHour: 20,
  platformSentInDay: 0,
  platformCapPerDay: 100,
  bounceComplaintRate: 0,
  anomalyThreshold: 0.1,
  anomalySample: 0,
  anomalySampleSize: 25,
}

describe('evaluateCircuitBreaker — the one path to allowed', () => {
  it('allows only when every guard is clear', () => {
    expect(evaluateCircuitBreaker(allClear)).toEqual({ allowed: true, reason: 'ok', trips: false })
  })
})

describe('evaluateCircuitBreaker — the kill switches', () => {
  it('master off blocks (the default/global kill), not a trip', () => {
    expect(evaluateCircuitBreaker({ ...allClear, autonomyEnabled: false })).toEqual({
      allowed: false,
      reason: 'autonomy_off',
      trips: false,
    })
  })

  it('a disarmed breaker blocks and awaits manual re-arm', () => {
    expect(evaluateCircuitBreaker({ ...allClear, breakerArmed: false })).toEqual({
      allowed: false,
      reason: 'breaker_tripped',
      trips: false,
    })
  })

  it('a category toggle off blocks', () => {
    expect(evaluateCircuitBreaker({ ...allClear, categoryEnabled: false })).toEqual({
      allowed: false,
      reason: 'category_off',
      trips: false,
    })
  })
})

describe('evaluateCircuitBreaker — rate caps', () => {
  it('platform hourly cap blocks at the cap', () => {
    expect(evaluateCircuitBreaker({ ...allClear, platformSentInHour: 20, platformCapPerHour: 20 })).toEqual({
      allowed: false,
      reason: 'platform_cap',
      trips: false,
    })
  })

  it('platform daily cap blocks at the cap', () => {
    expect(evaluateCircuitBreaker({ ...allClear, platformSentInDay: 100, platformCapPerDay: 100 })).toEqual({
      allowed: false,
      reason: 'platform_cap',
      trips: false,
    })
  })

  it('per-recipient cap blocks at the cap', () => {
    expect(evaluateCircuitBreaker({ ...allClear, recipientSentInDay: 1, recipientCapPerDay: 1 })).toEqual({
      allowed: false,
      reason: 'recipient_cap',
      trips: false,
    })
  })

  it('one under the cap is allowed; the cap itself is not', () => {
    expect(evaluateCircuitBreaker({ ...allClear, recipientSentInDay: 0, recipientCapPerDay: 1 }).allowed).toBe(true)
    expect(evaluateCircuitBreaker({ ...allClear, recipientSentInDay: 1, recipientCapPerDay: 1 }).allowed).toBe(false)
    expect(evaluateCircuitBreaker({ ...allClear, recipientSentInDay: 2, recipientCapPerDay: 1 }).allowed).toBe(false)
  })

  it('platform-wide protects everyone: it blocks before the per-recipient count is even consulted', () => {
    const d = evaluateCircuitBreaker({
      ...allClear,
      platformSentInHour: 20,
      platformCapPerHour: 20,
      recipientSentInDay: 0,
    })
    expect(d.reason).toBe('platform_cap')
  })
})

describe('evaluateCircuitBreaker — the anomaly trip', () => {
  it('trips when the rate is at/over threshold WITH enough sample', () => {
    expect(
      evaluateCircuitBreaker({ ...allClear, bounceComplaintRate: 0.2, anomalyThreshold: 0.1, anomalySample: 30, anomalySampleSize: 25 }),
    ).toEqual({ allowed: false, reason: 'anomaly_trip', trips: true })
  })

  it('does NOT trip on a high rate with too small a sample (noise guard)', () => {
    const d = evaluateCircuitBreaker({
      ...allClear,
      bounceComplaintRate: 1,
      anomalyThreshold: 0.1,
      anomalySample: 3,
      anomalySampleSize: 25,
    })
    expect(d.allowed).toBe(true)
    expect(d.trips).toBe(false)
  })

  it('does NOT trip when the rate is under threshold', () => {
    const d = evaluateCircuitBreaker({
      ...allClear,
      bounceComplaintRate: 0.05,
      anomalyThreshold: 0.1,
      anomalySample: 100,
    })
    expect(d.allowed).toBe(true)
    expect(d.trips).toBe(false)
  })
})

describe('evaluateCircuitBreaker — precedence', () => {
  it('the master switch overrides every other block', () => {
    // Everything is wrong, but the master-off reason is the one reported.
    expect(
      evaluateCircuitBreaker({
        ...allClear,
        autonomyEnabled: false,
        breakerArmed: false,
        categoryEnabled: false,
        recipientSentInDay: 99,
        bounceComplaintRate: 1,
        anomalySample: 99,
      }).reason,
    ).toBe('autonomy_off')
  })

  it('the anomaly trip is evaluated before the rate caps', () => {
    const d = evaluateCircuitBreaker({
      ...allClear,
      bounceComplaintRate: 0.5,
      anomalySample: 50,
      platformSentInHour: 999,
    })
    expect(d.reason).toBe('anomaly_trip')
    expect(d.trips).toBe(true)
  })
})

// ── The async resolver: fail-closed on read error, and it latches the breaker on a trip. ──

const mocks = vi.hoisted(() => ({
  isAutonomyEnabled: vi.fn(),
  isBreakerArmed: vi.fn(),
  getAutonomyTuning: vi.fn(),
  disarmBreaker: vi.fn(),
}))

vi.mock('./autonomy-config', () => ({
  isAutonomyEnabled: mocks.isAutonomyEnabled,
  isBreakerArmed: mocks.isBreakerArmed,
  getAutonomyTuning: mocks.getAutonomyTuning,
  disarmBreaker: mocks.disarmBreaker,
}))

const tuning = {
  categories: { playbook_email: true, intro_email: true },
  caps: { recipientPerDay: 1, platformPerHour: 20, platformPerDay: 100 },
  anomaly: { bounceComplaintRate: 0.1, sampleSize: 25 },
}

describe('checkCircuitBreaker — fail-closed + latch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('denies with config_error when a config read throws (fail-closed)', async () => {
    mocks.isAutonomyEnabled.mockRejectedValue(new Error('db down'))
    mocks.isBreakerArmed.mockResolvedValue(true)
    mocks.getAutonomyTuning.mockResolvedValue(tuning)
    const { checkCircuitBreaker } = await import('./circuit-breaker')
    const d = await checkCircuitBreaker({ category: 'playbook_email', recipientEmail: 'a@b.com' })
    expect(d).toEqual({ allowed: false, reason: 'config_error', trips: false })
  })

  it('blocks on the cheap latch (master off) without needing the counts', async () => {
    mocks.isAutonomyEnabled.mockResolvedValue(false)
    mocks.isBreakerArmed.mockResolvedValue(true)
    mocks.getAutonomyTuning.mockResolvedValue(tuning)
    const { checkCircuitBreaker } = await import('./circuit-breaker')
    const d = await checkCircuitBreaker({ category: 'playbook_email', recipientEmail: 'a@b.com' })
    expect(d.reason).toBe('autonomy_off')
    expect(mocks.disarmBreaker).not.toHaveBeenCalled()
  })
})
