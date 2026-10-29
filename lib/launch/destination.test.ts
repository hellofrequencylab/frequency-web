import { describe, expect, it } from 'vitest'
import { inFlowHref, launchHomeHref, spotlightArrivalGoesHome } from './destination'

const LID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'

describe('launchHomeHref', () => {
  it('is /launch for anyone signed in', () => {
    expect(launchHomeHref()).toBe('/launch')
    expect(launchHomeHref({ signedIn: true })).toBe('/launch')
  })
  it('sends a visitor with no account to the Spotlight form that holds their answers', () => {
    expect(launchHomeHref({ signedIn: false })).toBe('/launch/step/spotlight')
  })
  it('carries a launch id and nothing else', () => {
    expect(launchHomeHref({ signedIn: true, lid: LID })).toBe(`/launch?lid=${LID}`)
    expect(launchHomeHref({ signedIn: true, lid: 'x&next=//evil.test' })).toBe('/launch')
    expect(launchHomeHref({ signedIn: true, lid: null })).toBe('/launch')
  })
})

describe('inFlowHref', () => {
  it('marks a step address and respects an existing query', () => {
    expect(inFlowHref('/launch/step/spotlight')).toBe('/launch/step/spotlight?go=1')
    expect(inFlowHref('/launch/step/spotlight?e=name')).toBe('/launch/step/spotlight?e=name&go=1')
  })
})

describe('spotlightArrivalGoesHome', () => {
  it('sends a cold arrival with a started launch home', () => {
    expect(spotlightArrivalGoesHome({ hasLaunch: true })).toBe(true)
  })
  it('keeps in-flow links, error lines and the new-Space choice on the step', () => {
    expect(spotlightArrivalGoesHome({ hasLaunch: true, go: '1' })).toBe(false)
    expect(spotlightArrivalGoesHome({ hasLaunch: true, e: 'name' })).toBe(false)
    expect(spotlightArrivalGoesHome({ hasLaunch: true, new: '1' })).toBe(false)
  })
  it('leaves a visitor with no launch on the form', () => {
    expect(spotlightArrivalGoesHome({ hasLaunch: false })).toBe(false)
  })
})
