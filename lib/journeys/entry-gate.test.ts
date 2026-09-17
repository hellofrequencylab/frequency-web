import { describe, it, expect } from 'vitest'
import { canEnterJourney, entersAsLearner, type JourneyEntryFacts } from './entry-gate'

const base: JourneyEntryFacts = {
  viewerProfileId: 'viewer-1',
  authorId: 'author-1',
  canManage: false,
  enrolled: false,
}

describe('canEnterJourney', () => {
  it('refuses a signed-out visitor even when everything else would admit them', () => {
    expect(canEnterJourney({ ...base, viewerProfileId: null, enrolled: true, canManage: true })).toBe(false)
  })

  // The whole point of the change: being signed in is no longer a way in.
  it('refuses a signed-in member who is not enrolled', () => {
    expect(canEnterJourney(base)).toBe(false)
  })

  it('admits an enrolled member', () => {
    expect(canEnterJourney({ ...base, enrolled: true })).toBe(true)
  })

  it('admits the author without an enrolment', () => {
    expect(canEnterJourney({ ...base, viewerProfileId: 'author-1' })).toBe(true)
  })

  it('admits a manager (staff or the owning Space) without an enrolment', () => {
    expect(canEnterJourney({ ...base, canManage: true })).toBe(true)
  })

  // A null author must never match a null viewer into a way in.
  it('does not treat a missing author as a match for a missing viewer', () => {
    expect(canEnterJourney({ ...base, viewerProfileId: null, authorId: null })).toBe(false)
  })

  // Nor may a null author id match a viewer whose id is somehow also nullish-adjacent.
  it('does not admit a viewer when the author id is null', () => {
    expect(canEnterJourney({ ...base, authorId: null })).toBe(false)
  })
})

describe('entersAsLearner', () => {
  it('is true only for a real enrolment', () => {
    expect(entersAsLearner({ ...base, enrolled: true })).toBe(true)
  })

  // A manager previewing is inside, but is not a learner: their progress is nobody's progress.
  it('is false for a manager who is not enrolled', () => {
    expect(entersAsLearner({ ...base, canManage: true })).toBe(false)
  })

  it('is false for the author who has not enrolled', () => {
    expect(entersAsLearner({ ...base, viewerProfileId: 'author-1' })).toBe(false)
  })

  it('is false when signed out', () => {
    expect(entersAsLearner({ ...base, viewerProfileId: null, enrolled: true })).toBe(false)
  })
})
