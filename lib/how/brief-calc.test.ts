import { describe, expect, it } from 'vitest'
import { computeBrief, briefValue, isBriefKey, BRIEF_DEFAULTS } from './brief-calc'

describe('the /how brief calculators', () => {
  it('reproduces the designed default region (100 hosts, live prices)', () => {
    const r = computeBrief()
    expect(r.o.paying).toBe('38')
    expect(r.o.plans).toBe('$2,612')
    expect(r.o.fees).toBe('$596')
    expect(r.o.adds).toBe('$80')
    expect(r.o.total).toBe('$3,288')
    expect(r.o.annual).toBe('$39,456')
    expect(r.o.months).toBe('4')
  })
  it('scales across regions and resolves holes', () => {
    const r = computeBrief({ regions: 5 })
    expect(r.o.allAnnual).toBe('$197,280')
    expect(briefValue(r, 'v.regions')).toBe('5 regions')
    expect(briefValue(r, 'o.nope')).toBe('')
  })
  it('never divides by zero when nobody signs up', () => {
    expect(computeBrief({ joinRate: 0 }).o.months).toBe('never')
  })
  it('knows its own slider keys', () => {
    expect(Object.keys(BRIEF_DEFAULTS).every(isBriefKey)).toBe(true)
    expect(isBriefKey('__proto__')).toBe(false)
  })
})
