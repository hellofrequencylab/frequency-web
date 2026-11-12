import { describe, it, expect } from 'vitest'
import { campaignDedupeKey, dailyLimitNote, deadlineAfter, mapLimit, parseDailyLimit } from './fan-out'

describe('fan-out helpers', () => {
  it('mapLimit keeps input order and never exceeds the concurrency limit', async () => {
    let inFlight = 0
    let peak = 0
    const out = await mapLimit([5, 1, 4, 2, 3, 6, 7], 3, async (n) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, n))
      inFlight--
      return n * 2
    })
    expect(out).toEqual([10, 2, 8, 4, 6, 12, 14])
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('mapLimit handles an empty list and rejects like Promise.all', async () => {
    expect(await mapLimit([], 4, async (x) => x)).toEqual([])
    await expect(mapLimit([1, 2], 2, async (n) => { if (n === 2) throw new Error('x'); return n })).rejects.toThrow('x')
  })

  it('deadlineAfter turns true once the budget is spent', () => {
    let t = 1_000
    const spent = deadlineAfter(500, () => t)
    expect(spent()).toBe(false)
    t = 1_499
    expect(spent()).toBe(false)
    t = 1_500
    expect(spent()).toBe(true)
  })

  it('dedupe keys are per campaign and per recipient, falling back to the lowercased address', () => {
    expect(campaignDedupeKey('c1', { contactId: 'k1', email: 'A@x.test' })).toBe('campaign:c1:k1')
    expect(campaignDedupeKey('c1', { contactId: '', email: 'A@x.test' })).toBe('campaign:c1:a@x.test')
    expect(campaignDedupeKey('c2', { contactId: 'k1', email: 'a@x.test' })).not.toBe(campaignDedupeKey('c1', { contactId: 'k1', email: 'a@x.test' }))
  })
})

describe('daily limit note', () => {
  it('parses the env value, blank or junk means unknown', () => {
    expect(parseDailyLimit('100')).toBe(100)
    expect(parseDailyLimit('')).toBeNull()
    expect(parseDailyLimit(undefined)).toBeNull()
    expect(parseDailyLimit('abc')).toBeNull()
  })
  it('only speaks when the audience is bigger than the cap, and says how many days', () => {
    expect(dailyLimitNote(500, null)).toBeNull()
    expect(dailyLimitNote(100, 100)).toBeNull()
    expect(dailyLimitNote(585, 100)).toContain('about 6 days')
    expect(dailyLimitNote(585, 100)).not.toMatch(/[\u2013\u2014]/)
    expect(dailyLimitNote(585, 100)).not.toMatch(/upgrad|plan/i)
  })
})
