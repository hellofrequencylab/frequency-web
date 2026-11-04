import { describe, expect, it } from 'vitest'
import { circleKind, FREQUENCY_PRIMARY_SLUGS } from './kind'

describe('circleKind', () => {
  it('puts a Space-owned circle on the business shelf', () => {
    expect(circleKind({ spaceType: 'business' })).toBe('business')
    expect(circleKind({ spaceType: 'nonprofit', featuredAt: '2026-10-01' })).toBe('business')
  })
  it('treats the platform root as no owner', () => {
    expect(circleKind({ spaceType: 'root' })).toBe('community')
    expect(circleKind({ spaceType: 'root', isSpacePrimary: true })).toBe('community')
    expect(circleKind({ spaceType: 'root', hubId: 'h1' })).toBe('frequency')
  })
  it('calls an unowned featured or hub circle Frequency, the rest community', () => {
    expect(circleKind({ featuredAt: '2026-10-01' })).toBe('frequency')
    expect(circleKind({ hubId: 'h1' })).toBe('frequency')
    expect(circleKind({})).toBe('community')
  })
  it('keeps the named primary circles on the Frequency shelf even when a Space owns them', () => {
    for (const slug of FREQUENCY_PRIMARY_SLUGS) expect(circleKind({ slug, spaceType: 'business' })).toBe('frequency')
    expect(circleKind({ slug: 'some-other-circle', spaceType: 'business' })).toBe('business')
  })
  it('a Space\'s own built-in Circle is its own kind, but a Circle a Space started is a regular business one', () => {
    expect(circleKind({ spaceType: 'business', isSpacePrimary: true })).toBe('space')
    expect(circleKind({ spaceType: 'nonprofit', isSpacePrimary: true, featuredAt: '2026-10-01' })).toBe('space')
    expect(circleKind({ spaceType: 'business', isSpacePrimary: false })).toBe('business')
    expect(circleKind({ slug: FREQUENCY_PRIMARY_SLUGS[0], spaceType: 'business', isSpacePrimary: true })).toBe('frequency')
  })
})
