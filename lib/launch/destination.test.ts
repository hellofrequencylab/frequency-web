import { describe, expect, it } from 'vitest'
import { inFlowHref, launchHomeHref, launchResumeHref, launchResumeSignInHref, spotlightArrivalGoesHome, isAnonLaunchPage } from './destination'
import { safeNextPath } from '@/lib/auth/safe-next'

const LID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'

describe('launchHomeHref', () => {
  it('is /launch for anyone signed in', () => {
    expect(launchHomeHref()).toBe('/launch')
    expect(launchHomeHref({ signedIn: true })).toBe('/launch')
  })
  it('sends a visitor with no account to the Spotlight form that holds their answers', () => {
    expect(launchHomeHref({ signedIn: false })).toBe('/launch-your-business')
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

describe('isAnonLaunchPage (LIVE-2324)', () => {
  it('opens the Spotlight builder to a visitor with no account', () => {
    expect(isAnonLaunchPage('/launch/step/spotlight')).toBe(true)
    expect(isAnonLaunchPage('/launch/step/spotlight/')).toBe(true)
  })
  it('keeps every other launch page the account\'s own', () => {
    for (const p of ['/launch', '/launch/claim', '/launch/resume', '/launch/step/space', '/launch/step/spotlight/x', '/', null]) {
      expect(isAnonLaunchPage(p)).toBe(false)
    }
  })
})

describe('launchResumeHref (LIVE-2330)', () => {
  it('is /launch/resume, with the launch id when it is one', () => {
    expect(launchResumeHref()).toBe('/launch/resume')
    expect(launchResumeHref(LID.toUpperCase())).toBe(`/launch/resume?lid=${LID}`)
    expect(launchResumeHref('not-a-launch&x=1')).toBe('/launch/resume')
  })
  it('signed out, goes to sign-in with a next the sign-in page accepts and that leads back to the same launch', () => {
    const href = launchResumeSignInHref(LID)
    const u = new URL(href, 'https://frequencylocal.com')
    expect(u.pathname).toBe('/sign-in')
    const next = u.searchParams.get('next')
    expect(next).toBe(`/launch/resume?lid=${LID}`)
    expect(safeNextPath(next)).toBe(next)
    expect(new URL(launchResumeSignInHref(null), 'https://x.test').searchParams.get('next')).toBe('/launch/resume')
  })
})
