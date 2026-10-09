import { describe, expect, it } from 'vitest'
import { canRespondToCrossListing, crossListingVisible } from './cross-listing'
describe('Collective cross-listing permission and visibility',()=>{
  it('requires target consent, even if the sender owns a Collective',()=>{
    expect(canRespondToCrossListing('pending','source','accepted')).toBe(false)
    expect(canRespondToCrossListing('pending','target','accepted')).toBe(true)
    expect(canRespondToCrossListing('pending','target','declined')).toBe(true)
    expect(canRespondToCrossListing('accepted','target','declined')).toBe(false)
  })
  it('lets either side revoke live or pending listings, never revive removed ones',()=>{
    for(const side of ['source','target'] as const){
      expect(canRespondToCrossListing('accepted',side,'revoked')).toBe(true)
      expect(canRespondToCrossListing('pending',side,'revoked')).toBe(true)
      expect(canRespondToCrossListing('revoked',side,'accepted')).toBe(false)
    }
  })
  it('private journeys and unlisted or inactive Circles never become discovery listings',()=>{
    expect(crossListingVisible('journey',{visibility:'private'})).toBe(false)
    expect(crossListingVisible('journey',{visibility:'public'})).toBe(true)
    expect(crossListingVisible('journey',{})).toBe(false)
    expect(crossListingVisible('journey',{visibility:'public',status:'rejected'})).toBe(false)
    expect(crossListingVisible('circle',{status:'active',unlisted:true})).toBe(false)
    expect(crossListingVisible('circle',{status:'inactive',unlisted:false})).toBe(false)
    expect(crossListingVisible('circle',{status:'forming',unlisted:null})).toBe(true)
  })
})
