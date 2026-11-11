import { describe, expect, it } from 'vitest'
import { BETA_ENDS_LABEL } from './beta-notices'
import { FOUNDING_MEMBER_COPY, LAUNCH_ON } from './launch-dates'
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
})
