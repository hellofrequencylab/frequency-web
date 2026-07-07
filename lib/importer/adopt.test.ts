import { describe, it, expect } from 'vitest'
import { profileFromSpace } from './adopt'
import type { Space } from '@/lib/spaces/types'
import type { SpaceProfileData } from '@/lib/spaces/profile-data'

// profileFromSpace is the PURE reverse of the materializer: a live Space's content → a master-profile
// draft + a HUMAN-VERIFIED ledger (the owner already published it, so it publishes on a re-apply).

function space(partial: Partial<Space>): Space {
  return {
    id: 's1',
    slug: 'daniel-tyack',
    name: 'Daniel Tyack',
    type: 'business',
    brandName: null,
    tagline: null,
    brandAccent: null,
    brandLogoUrl: null,
    coverImageUrl: null,
    preferences: {},
    ...partial,
  } as unknown as Space
}

describe('profileFromSpace maps a live Space to a master profile', () => {
  it('carries identity, tagline, about, and offerings across', () => {
    const data: SpaceProfileData = {
      about: 'A hand-made business.',
      offerings: [{ title: 'Session', blurb: 'One hour', price: 120, currency: 'USD', priceModel: 'fixed' }],
    }
    const { draft } = profileFromSpace(space({ brandName: 'DT', tagline: 'Do the work.' }), data)
    expect(draft.name).toBe('Daniel Tyack')
    expect(draft.brandName).toBe('DT')
    expect(draft.tagline).toBe('Do the work.')
    expect(draft.about).toBe('A hand-made business.')
    expect(draft.offerings).toEqual([
      { title: 'Session', blurb: 'One hour', price: 120, currency: 'USD', priceModel: 'fixed' },
    ])
  })

  it('marks every PRESENT commercial fact human-verified so it publishes, and nothing else', () => {
    const data: SpaceProfileData = {
      address: '1 Main St',
      phone: '(555) 123-4567',
      email: 'hi@example.test',
      hours: 'Mon-Fri 9-5',
      rating: '4.9',
      ratingCount: '212',
      offerings: [{ title: 'Session', price: 120 }, { title: 'Free intro' }],
    }
    const { ledger } = profileFromSpace(space({}), data)
    for (const p of ['contact.address', 'contact.phone', 'contact.email', 'contact.hours', 'rating', 'offerings[0].price']) {
      expect(ledger[p]?.[0]).toMatchObject({ kind: 'fact', verifiedBy: 'human' })
    }
    // The second offering has no price → no ledger entry for it.
    expect(ledger['offerings[1].price']).toBeUndefined()
    // Identity + prose are hand-supplied (no ledger entry needed to publish).
    expect(ledger.name).toBeUndefined()
    expect(ledger.about).toBeUndefined()
  })

  it('leads the image list with the cover, then a distinct logo, de-duped', () => {
    const shared = 'https://cdn.test/pic.jpg'
    expect(profileFromSpace(space({ coverImageUrl: 'https://cdn.test/cover.jpg', brandLogoUrl: 'https://cdn.test/logo.png' }), {}).images).toEqual([
      'https://cdn.test/cover.jpg',
      'https://cdn.test/logo.png',
    ])
    // A cover === logo collapses to one image.
    expect(profileFromSpace(space({ coverImageUrl: shared, brandLogoUrl: shared }), {}).images).toEqual([shared])
    // No images → empty list, never undefined.
    expect(profileFromSpace(space({}), {}).images).toEqual([])
  })

  it('maps a nonprofit type through, and stays valid on sparse content', () => {
    const { draft } = profileFromSpace(space({ type: 'nonprofit' }), {})
    expect(draft.type).toBe('nonprofit')
    expect(draft.name).toBe('Daniel Tyack')
    expect(draft.offerings).toBeUndefined()
  })
})
