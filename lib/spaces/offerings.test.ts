import { describe, it, expect } from 'vitest'
import {
  OFFERING_SECTIONS,
  offeringSectionsForType,
  typeHasOfferings,
  offeringFunctionsForType,
} from './offerings'
import type { SpaceType } from './types'

// The unified Offerings surface, UNIVERSALIZED by ADR-517 Phase F: every Space has access to every
// offering, so every commerce section composes onto every type (each section body re-checks its own
// per-Space function gate, now universal, and keeps money dormant until the freemium tier lands). These
// lock that every type gets the full section stack in a stable order.

const ALL_ANCHORS = OFFERING_SECTIONS.map((s) => s.anchor)
const ALL_FNS = OFFERING_SECTIONS.map((s) => s.requiredFunction)

const CONSOLE_TYPES: readonly SpaceType[] = [
  'practitioner',
  'business',
  'organization',
  'event_space',
  'coaching',
  'lab',
  'partner',
]

describe('offerings catalog · offeringSectionsForType (UNIVERSAL)', () => {
  for (const type of CONSOLE_TYPES) {
    it(`gives ${type} every section in stack order`, () => {
      expect(offeringSectionsForType(type).map((s) => s.anchor)).toEqual(ALL_ANCHORS)
    })
  }

  it('marks every type as having offerings (universal access)', () => {
    for (const type of CONSOLE_TYPES) {
      expect(typeHasOfferings(type)).toBe(true)
    }
  })

  it('exposes every section function for every type so the console gates the card on usability', () => {
    expect(offeringFunctionsForType('event_space')).toEqual(ALL_FNS)
    expect(offeringFunctionsForType('lab')).toEqual(ALL_FNS)
  })

  it('has unique anchors (each is a distinct page section id)', () => {
    const anchors = OFFERING_SECTIONS.map((s) => s.anchor)
    expect(new Set(anchors).size).toBe(anchors.length)
  })
})
