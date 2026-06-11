import { describe, it, expect } from 'vitest'
import { ZAP_AMOUNTS, practiceLogAction, type ZapAction } from './zaps'

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
      'practice_logged_light',
      'practice_logged_heavy',
      'practice_claim',
      'node_capture',
      'program_run',
      'entry_point_created',
      'referral_activated',
      'co_op_pulse',
      'welcome_back',
      'practice_full_cycle',
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

  it('specific values match the rebalance migration (ADR-104) + Rewards Economy v2', () => {
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
    expect(ZAP_AMOUNTS.practice_logged_light).toBe(8)
    expect(ZAP_AMOUNTS.practice_logged_heavy).toBe(15)
    expect(ZAP_AMOUNTS.co_op_pulse).toBe(3)
    expect(ZAP_AMOUNTS.welcome_back).toBe(10)
    expect(ZAP_AMOUNTS.practice_full_cycle).toBe(50)
  })
})

describe('practiceLogAction', () => {
  it('maps weight classes to their zap actions', () => {
    expect(practiceLogAction('light')).toBe('practice_logged_light')
    expect(practiceLogAction('heavy')).toBe('practice_logged_heavy')
    expect(practiceLogAction('standard')).toBe('practice_logged')
  })

  it('defaults unknown / missing weight classes to standard', () => {
    expect(practiceLogAction(null)).toBe('practice_logged')
    expect(practiceLogAction(undefined)).toBe('practice_logged')
    expect(practiceLogAction('mystery')).toBe('practice_logged')
  })

  it('weight class payouts are ordered light < standard < heavy', () => {
    expect(ZAP_AMOUNTS.practice_logged_light).toBeLessThan(ZAP_AMOUNTS.practice_logged)
    expect(ZAP_AMOUNTS.practice_logged).toBeLessThan(ZAP_AMOUNTS.practice_logged_heavy)
  })
})
