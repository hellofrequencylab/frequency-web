import { describe, it, expect } from 'vitest'
import {
  journeyBuySignInPath,
  journeyLearnPath,
  journeyMemberPath,
  journeyPublicPath,
} from './sales-path'

describe('journey sales paths', () => {
  it('keeps the till on the member slug and the canonical on discover', () => {
    expect(journeyMemberPath('heart-on-fire')).toBe('/journeys/heart-on-fire')
    expect(journeyPublicPath('heart-on-fire')).toBe('/discover/journeys/heart-on-fire')
    expect(journeyLearnPath('heart-on-fire')).toBe('/journeys/heart-on-fire/learn')
  })

  it('sends a signed-out buyer to sign-in carrying the till as next', () => {
    expect(journeyBuySignInPath('heart-on-fire')).toBe(
      '/sign-in?next=%2Fjourneys%2Fheart-on-fire',
    )
  })
})
