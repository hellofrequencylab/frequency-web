import { describe, it, expect } from 'vitest'
import { ZAP_AMOUNTS, MEMBER_ZAP_RATE, type ZapAction } from './zaps'

describe('ZAP_AMOUNTS', () => {
  it('contains all expected action keys', () => {
    const expected: ZapAction[] = [
      'circle_start',
      'event_host',
      'circle_activate',
      'invite_accepted',
      'event_attend',
      'outreach_task',
      'practice_logged',
      'practice_claim',
      'node_capture',
      'program_run',
      'entry_point_created',
      'referral_activated',
    ]
    for (const key of expected) {
      expect(ZAP_AMOUNTS).toHaveProperty(key)
    }
  })

  it('all amounts are positive integers', () => {
    for (const [action, amount] of Object.entries(ZAP_AMOUNTS)) {
      expect(amount, `${action} amount must be a positive integer`).toBeGreaterThan(0)
      expect(Number.isInteger(amount), `${action} amount must be an integer`).toBe(true)
    }
  })

  it('high-effort actions yield more zaps than low-effort ones', () => {
    // circle_start (starting a circle) outweighs a single node_capture
    expect(ZAP_AMOUNTS.circle_start).toBeGreaterThan(ZAP_AMOUNTS.node_capture)
    // hosting an event outweighs simply attending
    expect(ZAP_AMOUNTS.event_host).toBeGreaterThan(ZAP_AMOUNTS.event_attend)
    // running a program outweighs a single outreach task
    expect(ZAP_AMOUNTS.program_run).toBeGreaterThan(ZAP_AMOUNTS.outreach_task)
  })

  it('specific values match the rebalance migration (ADR-104)', () => {
    expect(ZAP_AMOUNTS.circle_start).toBe(100)
    expect(ZAP_AMOUNTS.event_host).toBe(60)
    expect(ZAP_AMOUNTS.circle_activate).toBe(40)
    expect(ZAP_AMOUNTS.invite_accepted).toBe(40)
    expect(ZAP_AMOUNTS.event_attend).toBe(25)
    expect(ZAP_AMOUNTS.referral_activated).toBe(25)
    expect(ZAP_AMOUNTS.outreach_task).toBe(20)
    expect(ZAP_AMOUNTS.entry_point_created).toBe(20)
    expect(ZAP_AMOUNTS.practice_logged).toBe(12)
    expect(ZAP_AMOUNTS.practice_claim).toBe(10)
    expect(ZAP_AMOUNTS.node_capture).toBe(10)
    expect(ZAP_AMOUNTS.program_run).toBe(30)
  })
})

describe('MEMBER_ZAP_RATE', () => {
  it('is between 0 (exclusive) and 1 (inclusive)', () => {
    expect(MEMBER_ZAP_RATE).toBeGreaterThan(0)
    expect(MEMBER_ZAP_RATE).toBeLessThanOrEqual(1)
  })

  it('is 0.5 (free members earn half rate per ECONOMY-AND-JOURNEYS §6)', () => {
    expect(MEMBER_ZAP_RATE).toBe(0.5)
  })

  it('applying the rate and flooring never goes below 1 for any ZAP_AMOUNTS value', () => {
    for (const [action, amount] of Object.entries(ZAP_AMOUNTS)) {
      const reduced = Math.max(1, Math.floor(amount * MEMBER_ZAP_RATE))
      expect(reduced, `reduced amount for ${action} must be at least 1`).toBeGreaterThanOrEqual(1)
    }
  })
})
