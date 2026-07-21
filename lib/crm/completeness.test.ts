import { describe, it, expect } from 'vitest'
import { completenessScore, isRealName, MAX_COMPLETENESS } from './completeness'

// Roster completeness scoring: the signal the space Resonance "Most complete" sort orders on. What is
// locked here is the ORDERING it induces (rich rows above bare email-only imports), not exact weights.

describe('isRealName', () => {
  it('is false for an empty / whitespace name', () => {
    expect(isRealName(null, 'a@b.com')).toBe(false)
    expect(isRealName('', 'a@b.com')).toBe(false)
    expect(isRealName('   ', 'a@b.com')).toBe(false)
  })
  it('is false when the name is just the email local-part (the import fallback)', () => {
    expect(isRealName('zoe.butler1655', 'zoe.butler1655@gmail.com')).toBe(false)
    expect(isRealName('ZOE.BUTLER1655', 'zoe.butler1655@gmail.com')).toBe(false) // case-insensitive
  })
  it('is true for a genuine display name', () => {
    expect(isRealName('Zoe Butler', 'zoe.butler1655@gmail.com')).toBe(true)
    expect(isRealName('Daniel Tyack', null)).toBe(true)
  })
})

describe('completenessScore', () => {
  it('is 0 for a row with no signals (a bare email-only import)', () => {
    expect(completenessScore({})).toBe(0)
    expect(completenessScore({ hasRealName: false, hasPhone: false })).toBe(0)
  })

  it('sums the weights of the set signals and never exceeds MAX_COMPLETENESS', () => {
    const everything = completenessScore({
      hasRealName: true, hasPhone: true, hasCompany: true, hasTitle: true, hasCity: true,
      hasWebsite: true, hasTags: true, hasNotes: true, hasCustomFields: true, isMember: true,
      hasAvatar: true, hasActivity: true,
    })
    expect(everything).toBe(MAX_COMPLETENESS)
    expect(everything).toBeGreaterThan(0)
  })

  it('ranks a filled-out contact ABOVE a bare email-only contact', () => {
    const bare = completenessScore({}) // email only
    const rich = completenessScore({ hasRealName: true, hasPhone: true, hasCompany: true, hasCity: true })
    expect(rich).toBeGreaterThan(bare)
  })

  it('ranks a named member above an email-only contact, and a fully rich contact at least as high', () => {
    const emailOnlyContact = completenessScore({})
    const namedMember = completenessScore({ isMember: true, hasRealName: true, hasAvatar: true })
    const richContact = completenessScore({
      hasRealName: true, hasPhone: true, hasCompany: true, hasTitle: true, hasCity: true, hasNotes: true,
    })
    expect(namedMember).toBeGreaterThan(emailOnlyContact)
    expect(richContact).toBeGreaterThanOrEqual(namedMember)
  })

  it('weights a real name and membership above any single soft field', () => {
    const soft = completenessScore({ hasCity: true }) // 1
    const name = completenessScore({ hasRealName: true }) // 3
    const member = completenessScore({ isMember: true }) // 3
    expect(name).toBeGreaterThan(soft)
    expect(member).toBeGreaterThan(soft)
  })
})
