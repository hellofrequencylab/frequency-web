import { describe, it, expect } from 'vitest'
import { sunSign, signCompatibility, SIGN_INFO, type ZodiacSign } from './signs'

describe('sunSign', () => {
  it('maps representative mid-sign dates correctly', () => {
    const cases: [string, ZodiacSign][] = [
      ['1990-01-05', 'capricorn'],
      ['1990-01-25', 'aquarius'],
      ['1990-02-25', 'pisces'],
      ['1990-04-01', 'aries'],
      ['1990-04-25', 'taurus'],
      ['1990-06-01', 'gemini'],
      ['1990-07-01', 'cancer'],
      ['1990-08-01', 'leo'],
      ['1990-09-01', 'virgo'],
      ['1990-10-01', 'libra'],
      ['1990-11-01', 'scorpio'],
      ['1990-12-01', 'sagittarius'],
      ['1990-12-25', 'capricorn'],
    ]
    for (const [d, s] of cases) expect(sunSign(d)).toBe(s)
  })

  it('handles cusp boundaries on the exact start day', () => {
    expect(sunSign('2000-03-21')).toBe('aries') // first day of Aries
    expect(sunSign('2000-03-20')).toBe('pisces') // last day of Pisces
    expect(sunSign('2000-12-22')).toBe('capricorn') // Capricorn begins
    expect(sunSign('2000-12-21')).toBe('sagittarius')
    expect(sunSign('2000-01-20')).toBe('aquarius') // Aquarius begins
    expect(sunSign('2000-01-19')).toBe('capricorn') // year-wrap tail
  })

  it('returns null for unparseable or invalid input', () => {
    expect(sunSign(null)).toBeNull()
    expect(sunSign('')).toBeNull()
    expect(sunSign('not-a-date')).toBeNull()
    expect(sunSign('1990-13-01')).toBeNull()
    expect(sunSign('1990-00-10')).toBeNull()
  })
})

describe('signCompatibility', () => {
  it('is symmetric and bounded in [0,1]', () => {
    const signs = Object.keys(SIGN_INFO) as ZodiacSign[]
    for (const a of signs) {
      for (const b of signs) {
        const ab = signCompatibility(a, b).score
        const ba = signCompatibility(b, a).score
        expect(ab).toBeGreaterThanOrEqual(0)
        expect(ab).toBeLessThanOrEqual(1)
        expect(Math.abs(ab - ba)).toBeLessThan(1e-9)
      }
    }
  })

  it('rates a complementary element pair (fire+air) above a tense one (fire+water)', () => {
    expect(signCompatibility('aries', 'gemini').score).toBeGreaterThan(
      signCompatibility('aries', 'cancer').score,
    )
  })

  it('same sign reads as familiar but never a perfect 1', () => {
    const c = signCompatibility('leo', 'leo')
    expect(c.score).toBeGreaterThan(0.5)
    expect(c.score).toBeLessThanOrEqual(0.9)
    expect(c.reason).toContain('fire')
  })
})
