import { describe, expect, it } from 'vitest'
import { BETA_ENDS_LABEL } from './beta-notices'
import { FOUNDING_MEMBER_COPY, LAUNCH_ON } from './launch-dates'
import { FOUNDER_BADGE_ENDS_LABEL } from '@/lib/pricing/beta'

describe('launch campaign dates', () => {
  it('the beta ends the day before the official launch', () => {
    const day = 24 * 60 * 60 * 1000
    expect(Date.parse(LAUNCH_ON) - Date.parse(FOUNDING_MEMBER_COPY.endsOn)).toBe(day)
  })
  it('the beta and founder badge labels read the one contract', () => {
    expect(BETA_ENDS_LABEL).toBe('December 31')
    expect(FOUNDER_BADGE_ENDS_LABEL).toBe(BETA_ENDS_LABEL)
  })
  it('the recognition line names Founding Member and has no dashes', () => {
    expect(FOUNDING_MEMBER_COPY.line).toContain('Founding Member')
    expect(FOUNDING_MEMBER_COPY.line).not.toMatch(/[–—]/)
  })
})
