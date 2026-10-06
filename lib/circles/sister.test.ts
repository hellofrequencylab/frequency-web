import { describe, it, expect } from 'vitest'

// LIVE-665: a full Circle seeds a sister instead of turning people away. The offer is pure.

const { sisterCircleOffer, sisterCircleName } = await import('./sister')

const base = { memberCap: 10, isLive: true, signedIn: true, isHost: false, isMember: false }

describe('sisterCircleOffer', () => {
  it('offers the host a sister once the Circle is nearly full, and not before', () => {
    expect(sisterCircleOffer({ ...base, isHost: true, isMember: true, memberCount: 8 })).toBeNull()
    expect(sisterCircleOffer({ ...base, isHost: true, isMember: true, memberCount: 9 })).toBe('host')
    expect(sisterCircleOffer({ ...base, isHost: true, isMember: true, memberCount: 10 })).toBe('host')
  })

  it('offers a signed-in non-member a sister when the Circle is full', () => {
    expect(sisterCircleOffer({ ...base, memberCount: 9 })).toBeNull()
    expect(sisterCircleOffer({ ...base, memberCount: 10 })).toBe('full')
  })

  it('never offers a member who already belongs, a signed-out visitor, or a Circle that is not live', () => {
    expect(sisterCircleOffer({ ...base, isMember: true, memberCount: 10 })).toBeNull()
    expect(sisterCircleOffer({ ...base, signedIn: false, memberCount: 10 })).toBeNull()
    expect(sisterCircleOffer({ ...base, isLive: false, memberCount: 10 })).toBeNull()
    expect(sisterCircleOffer({ ...base, memberCap: 0, memberCount: 0 })).toBeNull()
  })
})

describe('sisterCircleName', () => {
  it('marks the sister and keeps the name a sane length', () => {
    expect(sisterCircleName('Sunrise Walkers')).toBe('Sunrise Walkers (Sister Circle)')
    expect(sisterCircleName('  ')).toBe('Circle (Sister Circle)')
    expect(sisterCircleName('x'.repeat(300)).length).toBeLessThanOrEqual(120)
  })
})
