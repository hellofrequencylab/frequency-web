import { describe, expect, it } from 'vitest'
import { capDecision } from './cap'

const now = new Date('2026-11-13T18:00:00Z')
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()

describe('capDecision', () => {
  it('allows a first email', () => {
    expect(capDecision(now, 'nurture_step', [])).toEqual({ allowed: true })
  })
  it('holds a second email inside a day and says when', () => {
    const d = capDecision(now, 'operator_lifecycle', [{ kind: 'nurture_step', sentAt: ago(3) }])
    expect(d).toEqual({ allowed: false, why: 'daily', retryAfter: new Date(now.getTime() + 21 * 3_600_000).toISOString() })
  })
  it('allows one after a day has passed', () => {
    expect(capDecision(now, 'operator_lifecycle', [{ kind: 'nurture_step', sentAt: ago(25) }])).toEqual({ allowed: true })
  })
  it('never holds a rank 1 email for the daily cap', () => {
    expect(capDecision(now, 'launched_welcome', [{ kind: 'nurture_step', sentAt: ago(1) }])).toEqual({ allowed: true })
  })
  it('holds everything, rank 1 included, at three in a week', () => {
    const recent = [ago(30), ago(80), ago(120)].map((sentAt) => ({ kind: 'this_week', sentAt }))
    const d = capDecision(now, 'launched_welcome', recent)
    expect(d.allowed).toBe(false)
    expect(d).toMatchObject({ why: 'weekly', retryAfter: new Date(now.getTime() + (168 - 120) * 3_600_000).toISOString() })
  })
  it('treats an unregistered kind as the strictest rank and ignores junk times', () => {
    expect(capDecision(now, 'mystery', [{ kind: 'x', sentAt: 'nope' }, { kind: 'x', sentAt: ago(2) }]).allowed).toBe(false)
  })
})
