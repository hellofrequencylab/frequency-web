import { describe, expect, it } from 'vitest'
import { WIZARD_INTENTS } from '@/lib/spaces/create-wizard'
import { OFFER_FALLBACK, OFFER_MAX, intentsFromOffer, offerReadsAsVenue } from '@/lib/create-space/intents-from-offer'

describe('what one sentence says a business does', () => {
  it('maps the handoff examples to goals the wizard knows', () => {
    expect(intentsFromOffer('Kitchen and home design for families who love to cook.')).toEqual(['bookings'])
    expect(intentsFromOffer('Weekly pottery classes and open studio nights.')).toEqual(['classes', 'events'])
    expect(intentsFromOffer('1:1 coaching for first-time managers.')).toEqual(['bookings'])
    for (const id of intentsFromOffer('classes, workshops, a shop, a circle and donations')) expect(WIZARD_INTENTS.some((i) => i.id === id)).toBe(true)
  })

  it('returns at most three, in catalog order, and never the goal "email" on its own', () => {
    expect(intentsFromOffer('We sell ceramics, run classes, host workshops and have a club.')).toEqual(['classes', 'events', 'products'])
    expect(intentsFromOffer('a newsletter')).toEqual([...OFFER_FALLBACK])
  })

  it('falls back to the sample three when nothing matches, and ignores text past the cap', () => {
    expect(intentsFromOffer('')).toEqual([...OFFER_FALLBACK])
    expect(intentsFromOffer('Something quite plain.')).toEqual([...OFFER_FALLBACK])
    expect(intentsFromOffer(`${'x'.repeat(OFFER_MAX)} workshop`)).toEqual([...OFFER_FALLBACK])
  })

  it('tells a venue from a practitioner for the lead persona', () => {
    expect(offerReadsAsVenue('A venue for weddings and gatherings in Carlsbad.')).toBe(true)
    expect(offerReadsAsVenue('We rent our hall to groups.')).toBe(true)
    expect(offerReadsAsVenue('1:1 coaching for first-time managers.')).toBe(false)
  })
})
