import { describe, it, expect } from 'vitest'
import {
  deriveStatus,
  deriveIsBusiness,
  deriveIsActive,
  normalizeRelationshipKinds,
  classifyContact,
  BUSINESS_SPACE_TYPES,
  ACTIVE_WINDOW_MS,
  type ClassifyContext,
} from './classification'

const BASE_CTX: ClassifyContext = {
  communityRole: null,
  spacesOwned: 0,
  ownedBusinessSpaces: 0,
  isSpaceAdmin: false,
  wamStatus: null,
  lastActiveAt: null,
  relationshipKinds: [],
}

describe('deriveStatus', () => {
  it('is member when a profile is linked (regardless of consent)', () => {
    expect(deriveStatus({ profileId: 'p1', consentState: 'unknown' })).toBe('member')
    expect(deriveStatus({ profileId: 'p1', consentState: 'unsubscribed' })).toBe('member')
  })
  it('is subscriber when opted in but no profile', () => {
    expect(deriveStatus({ profileId: null, consentState: 'subscribed' })).toBe('subscriber')
  })
  it('is lead otherwise', () => {
    expect(deriveStatus({ profileId: null, consentState: 'unknown' })).toBe('lead')
    expect(deriveStatus({ profileId: null, consentState: null })).toBe('lead')
    expect(deriveStatus({ profileId: null, consentState: 'unsubscribed' })).toBe('lead')
  })
})

describe('deriveIsBusiness', () => {
  it('is true with an owned business-ish space', () => {
    expect(deriveIsBusiness({ ownedBusinessSpaces: 1, isSpaceAdmin: false })).toBe(true)
  })
  it('is true with a space admin seat even with no owned business space', () => {
    expect(deriveIsBusiness({ ownedBusinessSpaces: 0, isSpaceAdmin: true })).toBe(true)
  })
  it('is false with neither', () => {
    expect(deriveIsBusiness({ ownedBusinessSpaces: 0, isSpaceAdmin: false })).toBe(false)
  })
  it('BUSINESS_SPACE_TYPES excludes root + lab', () => {
    expect(BUSINESS_SPACE_TYPES).not.toContain('root')
    expect(BUSINESS_SPACE_TYPES).not.toContain('lab')
    expect(BUSINESS_SPACE_TYPES).toContain('business')
    expect(BUSINESS_SPACE_TYPES).toContain('practitioner')
  })
})

describe('deriveIsActive', () => {
  const now = Date.parse('2026-07-16T00:00:00.000Z')
  it('is true when weekly-active', () => {
    expect(deriveIsActive({ wamStatus: true, lastActiveAt: null }, now)).toBe(true)
  })
  it('is true when last active within the window', () => {
    const recent = new Date(now - ACTIVE_WINDOW_MS + 1000).toISOString()
    expect(deriveIsActive({ wamStatus: false, lastActiveAt: recent }, now)).toBe(true)
  })
  it('is false when last active is stale', () => {
    const stale = new Date(now - ACTIVE_WINDOW_MS - 1000).toISOString()
    expect(deriveIsActive({ wamStatus: false, lastActiveAt: stale }, now)).toBe(false)
  })
  it('is false with no signal and tolerates a bad timestamp', () => {
    expect(deriveIsActive({ wamStatus: null, lastActiveAt: null }, now)).toBe(false)
    expect(deriveIsActive({ wamStatus: false, lastActiveAt: 'not-a-date' }, now)).toBe(false)
  })
})

describe('normalizeRelationshipKinds', () => {
  it('keeps only known assignable kinds, de-duplicated', () => {
    expect(
      normalizeRelationshipKinds(['donor', 'donor', 'partner', 'member', 'bogus', null, undefined]),
    ).toEqual(['donor', 'partner'])
  })
  it('drops derived kinds (they are never stored)', () => {
    expect(normalizeRelationshipKinds(['member', 'business', 'lead', 'subscriber'])).toEqual([])
  })
})

describe('classifyContact', () => {
  it('nulls communityRole for a non-member even if context carries one', () => {
    const cls = classifyContact(
      { profileId: null, consentState: 'subscribed' },
      { ...BASE_CTX, communityRole: 'host' },
    )
    expect(cls.status).toBe('subscriber')
    expect(cls.communityRole).toBeNull()
  })
  it('keeps communityRole for a member', () => {
    const cls = classifyContact(
      { profileId: 'p1', consentState: 'unknown' },
      { ...BASE_CTX, communityRole: 'guide' },
    )
    expect(cls.status).toBe('member')
    expect(cls.communityRole).toBe('guide')
  })
  it('assembles the full verdict', () => {
    const now = Date.parse('2026-07-16T00:00:00.000Z')
    const cls = classifyContact(
      { profileId: 'p1', consentState: 'subscribed' },
      {
        ...BASE_CTX,
        communityRole: 'mentor',
        spacesOwned: 2,
        ownedBusinessSpaces: 1,
        isSpaceAdmin: false,
        wamStatus: true,
        relationshipKinds: ['donor', 'volunteer', 'member', 'nope'],
        now,
      },
    )
    expect(cls).toEqual({
      status: 'member',
      communityRole: 'mentor',
      isBusiness: true,
      isActive: true,
      spacesOwned: 2,
      relationshipKinds: ['donor', 'volunteer'],
    })
  })
  it('never emits a negative spacesOwned', () => {
    const cls = classifyContact({ profileId: 'p1', consentState: null }, { ...BASE_CTX, spacesOwned: -3 })
    expect(cls.spacesOwned).toBe(0)
  })
})
