import { describe, expect, it } from 'vitest'
import { firstOfferSeed, offerPageCount } from './offer-page'

describe('firstOfferSeed', () => {
  it('takes the first offering that has a title', () => {
    const prefs = { profileData: { offerings: [{ blurb: 'no title' }, { title: ' Class ', blurb: 'Tuesdays', price: 20, currency: 'USD' }] } }
    expect(firstOfferSeed(prefs)).toEqual({ title: 'Class', blurb: 'Tuesdays', price: 20, currency: 'USD', durationMinutes: undefined })
  })
  it('is null when there is nothing to seed from', () => {
    expect(firstOfferSeed(null)).toBeNull()
    expect(firstOfferSeed({ profileData: { offerings: [] } })).toBeNull()
  })
})

describe('offerPageCount', () => {
  it('is 0 until the page and its document both exist', () => {
    expect(offerPageCount(null)).toBe(0)
    expect(offerPageCount({ pages: [{ slug: 'home', label: 'Home', system: true }, { slug: 'offer', label: 'Offer' }] })).toBe(0)
  })
  it('is 1 once the offer page has a document', () => {
    const prefs = { pages: [{ slug: 'home', label: 'Home', system: true }, { slug: 'offer', label: 'Offer' }], pageDocs: { offer: { root: {}, content: [{ type: 'SpaceAbout', props: { id: 'a' } }] } } }
    expect(offerPageCount(prefs)).toBe(1)
  })
})
