import { describe, expect, it } from 'vitest'
import { circleKind } from './kind'

describe('circleKind', () => {
  it('puts a Space-owned circle on the business shelf', () => {
    expect(circleKind({ spaceType: 'business' })).toBe('business')
    expect(circleKind({ spaceType: 'nonprofit', featuredAt: '2026-10-01' })).toBe('business')
  })
  it('treats the platform root as no owner', () => {
    expect(circleKind({ spaceType: 'root' })).toBe('community')
    expect(circleKind({ spaceType: 'root', hubId: 'h1' })).toBe('frequency')
  })
  it('calls an unowned featured or hub circle Frequency, the rest community', () => {
    expect(circleKind({ featuredAt: '2026-10-01' })).toBe('frequency')
    expect(circleKind({ hubId: 'h1' })).toBe('frequency')
    expect(circleKind({})).toBe('community')
  })
})
