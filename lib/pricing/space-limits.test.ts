import { describe, it, expect } from 'vitest'
import { canCreateSpace, isPaidSpacePlan, spaceCreationBlockReason } from './space-limits'

// Space-creation cap (ADR-810), the PURE rule: free → 0, Crew/Supporter → 1, owning a paid space →
// unlimited. These lock the funnel boundaries + the plain-voice block reasons.

describe('isPaidSpacePlan', () => {
  it('business and nonprofit are paid; free (and legacy → free) is not', () => {
    expect(isPaidSpacePlan('business')).toBe(true)
    expect(isPaidSpacePlan('nonprofit')).toBe(true)
    expect(isPaidSpacePlan('free')).toBe(false)
    expect(isPaidSpacePlan(null)).toBe(false)
    expect(isPaidSpacePlan(undefined)).toBe(false)
  })

  it('legacy paid labels narrow through asSpacePlan and read paid', () => {
    // pro/practitioner/whitelabel/organization all remap forward (business or nonprofit), so a space
    // still carrying a legacy plan label is not wrongly treated as free.
    expect(isPaidSpacePlan('pro')).toBe(true)
    expect(isPaidSpacePlan('organization')).toBe(true)
  })
})

describe('canCreateSpace', () => {
  it('a free member cannot create any space (must go Crew)', () => {
    expect(canCreateSpace({ tier: 'free', ownedSpaceCount: 0, ownsPaidSpace: false })).toBe(false)
  })

  it('Crew unlocks exactly one space', () => {
    expect(canCreateSpace({ tier: 'crew', ownedSpaceCount: 0, ownsPaidSpace: false })).toBe(true)
    expect(canCreateSpace({ tier: 'crew', ownedSpaceCount: 1, ownsPaidSpace: false })).toBe(false)
  })

  it('Supporter behaves like Crew (paid personal tier)', () => {
    expect(canCreateSpace({ tier: 'supporter', ownedSpaceCount: 0, ownsPaidSpace: false })).toBe(true)
    expect(canCreateSpace({ tier: 'supporter', ownedSpaceCount: 1, ownsPaidSpace: false })).toBe(false)
  })

  it('owning a paid space lifts the cap entirely (run multiple)', () => {
    // Even a free personal tier can run more spaces once one of theirs is a paid Business/Non Profit.
    expect(canCreateSpace({ tier: 'crew', ownedSpaceCount: 5, ownsPaidSpace: true })).toBe(true)
    expect(canCreateSpace({ tier: 'free', ownedSpaceCount: 3, ownsPaidSpace: true })).toBe(true)
  })

  it('a null/undefined tier reads as free (default-deny)', () => {
    expect(canCreateSpace({ tier: null, ownedSpaceCount: 0, ownsPaidSpace: false })).toBe(false)
    expect(canCreateSpace({ tier: undefined, ownedSpaceCount: 0, ownsPaidSpace: false })).toBe(false)
  })
})

describe('spaceCreationBlockReason', () => {
  it('is null when the create is allowed', () => {
    expect(spaceCreationBlockReason({ tier: 'crew', ownedSpaceCount: 0, ownsPaidSpace: false })).toBeNull()
  })

  it('routes a free member to Crew for their first space', () => {
    const reason = spaceCreationBlockReason({ tier: 'free', ownedSpaceCount: 0, ownsPaidSpace: false })
    expect(reason).toContain('Crew')
    expect(reason).not.toContain('—') // CONTENT-VOICE §10: no em dash
  })

  it('routes a Crew member at their cap to Business for more than one', () => {
    const reason = spaceCreationBlockReason({ tier: 'crew', ownedSpaceCount: 1, ownsPaidSpace: false })
    expect(reason).toContain('Business')
    expect(reason).not.toContain('—')
  })
})
