import { describe, it, expect } from 'vitest'
import { SPACE_MANIFEST } from '@/lib/studio/entities/space'
import type { EntityManifest } from '@/lib/studio/kernel/manifest'
import { postCreateLanding, spaceSetupFields, spaceSetupFinishHref, spaceSetupHref, spaceSetupSteps } from './setup'

// SPACE SETUP (ADR-1733): the step order comes from the Space manifest, and a new console Space
// walks it before LIVE-261's Circles landing. Both rules are pure, so both are pinned here.

describe('spaceSetupSteps', () => {
  it('walks story, identity, contact and links, offerings, then the doors, off the real manifest', () => {
    const steps = spaceSetupSteps(SPACE_MANIFEST)
    expect(steps.map((s) => s.key)).toEqual(['story', 'identity', 'contact', 'offerings', 'first-things'])
    expect(steps.map((s) => s.sections)).toEqual([['story'], ['identity'], ['contact', 'links'], ['offerings'], []])
  })

  it('drops a step whose sections the manifest does not declare, and always ends on the doors', () => {
    const slim: EntityManifest = {
      ...SPACE_MANIFEST,
      sections: SPACE_MANIFEST.sections.filter((s) => s.key !== 'offerings' && s.key !== 'links'),
    }
    const steps = spaceSetupSteps(slim)
    expect(steps.map((s) => s.key)).toEqual(['story', 'identity', 'contact', 'first-things'])
    expect(steps[2]!.sections).toEqual(['contact'])
  })

  it('never asks again what creation already asked (the spark fields)', () => {
    const identity = spaceSetupSteps(SPACE_MANIFEST).find((s) => s.key === 'identity')!
    const paths = spaceSetupFields(SPACE_MANIFEST, identity).map((f) => f.path)
    expect(paths).not.toContain('name')
    expect(paths).not.toContain('slug')
    expect(paths).toContain('brandName')
    expect(paths).toContain('brandLogoUrl')
    expect(paths).toContain('brandAccent')
  })

  it('the story step carries exactly the three prose fields Vera may draft', () => {
    const story = spaceSetupSteps(SPACE_MANIFEST).find((s) => s.key === 'story')!
    const fields = spaceSetupFields(SPACE_MANIFEST, story)
    expect(fields.map((f) => f.path)).toEqual(['tagline', 'about', 'profileData.about'])
    expect(fields.every((f) => f.veraDrafts === true)).toBe(true)
  })
})

describe('postCreateLanding', () => {
  it('sends a Business or Nonprofit Space through setup first', () => {
    expect(postCreateLanding('business', 'river-yoga')).toBe('/spaces/river-yoga/setup')
    expect(postCreateLanding('nonprofit', 'river-fund')).toBe('/spaces/river-fund/setup')
    // A legacy stored type folds into business (normalizeSpaceType), so it walks setup too.
    expect(postCreateLanding('organization', 'old-org')).toBe('/spaces/old-org/setup')
  })

  it('keeps LIVE-261 for every other type: straight to the Circles manager', () => {
    expect(postCreateLanding('root', 'frequency')).toBe('/spaces/frequency/manage/circles')
  })

  it('the setup finishes where LIVE-261 landed', () => {
    expect(spaceSetupFinishHref('river-yoga')).toBe('/spaces/river-yoga/manage/circles')
    expect(spaceSetupHref('river-yoga')).toBe('/spaces/river-yoga/setup')
  })
})
