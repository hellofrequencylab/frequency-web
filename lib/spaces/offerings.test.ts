import { describe, it, expect } from 'vitest'
import {
  OFFERING_SECTIONS,
  offeringSectionsForType,
  typeHasOfferings,
  offeringFunctionsForType,
} from './offerings'
import type { SpaceType } from './types'

// The deeper Offerings merge: the pure catalog that decides which commerce sections stack on the unified
// /settings/offerings page per Space type, and gates the console's single Offerings card. These lock the
// type -> sections mapping the merge replaced the five separate type-gated surfaces with.

describe('offerings catalog · offeringSectionsForType', () => {
  const CASES: ReadonlyArray<{ type: SpaceType; anchors: string[] }> = [
    { type: 'practitioner', anchors: ['availability'] },
    { type: 'business', anchors: ['memberships'] },
    { type: 'organization', anchors: ['donations', 'enroll'] },
    { type: 'event_space', anchors: ['tickets', 'checkin'] },
    { type: 'coaching', anchors: [] },
    { type: 'lab', anchors: [] },
    { type: 'partner', anchors: [] },
    { type: 'root', anchors: [] },
  ]

  for (const { type, anchors } of CASES) {
    it(`gives ${type} the sections [${anchors.join(', ') || 'none'}] in stack order`, () => {
      expect(offeringSectionsForType(type).map((s) => s.anchor)).toEqual(anchors)
    })
  }

  it('marks only the commerce-bearing types as having offerings', () => {
    expect(typeHasOfferings('practitioner')).toBe(true)
    expect(typeHasOfferings('business')).toBe(true)
    expect(typeHasOfferings('organization')).toBe(true)
    expect(typeHasOfferings('event_space')).toBe(true)
    expect(typeHasOfferings('coaching')).toBe(false)
    expect(typeHasOfferings('lab')).toBe(false)
    expect(typeHasOfferings('partner')).toBe(false)
    expect(typeHasOfferings('root')).toBe(false)
  })

  it('exposes each section\'s per-Space function so the console can gate the card on usability', () => {
    expect(offeringFunctionsForType('event_space')).toEqual(['tickets', 'checkin'])
    expect(offeringFunctionsForType('organization')).toEqual(['donations', 'enroll'])
    expect(offeringFunctionsForType('lab')).toEqual([])
  })

  it('has unique anchors (each is a distinct page section id)', () => {
    const anchors = OFFERING_SECTIONS.map((s) => s.anchor)
    expect(new Set(anchors).size).toBe(anchors.length)
  })
})
