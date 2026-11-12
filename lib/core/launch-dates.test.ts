import { describe, expect, it } from 'vitest'
import { BETA_ENDS_LABEL } from './beta-notices'
import { BETA_PHASES, FOUNDING_MEMBER_COPY, LAUNCH_ON, betaPhaseOn } from './launch-dates'
import { FOUNDER_BADGE_ENDS_LABEL } from '@/lib/pricing/beta'

describe('launch campaign dates', () => {
  it('the official launch falls inside the beta, which ends January 31, 2027', () => {
    expect(FOUNDING_MEMBER_COPY.endsOn).toBe('2027-01-31')
    expect(Date.parse(LAUNCH_ON)).toBeLessThan(Date.parse(FOUNDING_MEMBER_COPY.endsOn))
  })
  it('the beta and founder badge labels read the one contract', () => {
    expect(BETA_ENDS_LABEL).toBe('January 31')
    expect(FOUNDER_BADGE_ENDS_LABEL).toBe(BETA_ENDS_LABEL)
  })
  it('the recognition line names Founding Member and has no dashes', () => {
    expect(FOUNDING_MEMBER_COPY.line).toContain('Founding Member')
    expect(FOUNDING_MEMBER_COPY.line).not.toMatch(/[–—]/)
  })
  it('three beta phases close intake on Nov 30, Dec 31 and Jan 31, and the last is the one beta end', () => {
    expect(BETA_PHASES.map((p) => p.endsOn)).toEqual(['2026-11-30', '2026-12-31', '2027-01-31'])
    expect(BETA_PHASES[2].endsOn).toBe(FOUNDING_MEMBER_COPY.endsOn)
    expect(BETA_PHASES[2].endsLabel).toBe(BETA_ENDS_LABEL)
  })
  it('names the phase open on a date and none once the beta is over', () => {
    expect(betaPhaseOn('2026-11-17')?.id).toBe('early')
    expect(betaPhaseOn('2026-11-30')?.id).toBe('early')
    expect(betaPhaseOn('2026-12-08')?.id).toBe('hosts')
    expect(betaPhaseOn('2027-01-01')?.id).toBe('public')
    expect(betaPhaseOn('2027-02-01')).toBeNull()
  })
  it('phase copy has no dashes', () => {
    for (const p of BETA_PHASES) expect(`${p.name} ${p.focus} ${p.endsLabel}`).not.toMatch(/[–—]/)
  })
})
