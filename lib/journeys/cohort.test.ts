import { describe, it, expect } from 'vitest'
import { aggregateCohort, type MemberCompletion } from './cohort'

const phaseIds = ['p1', 'p2']

describe('cohort aggregation (ADR-252)', () => {
  it('shared meter is the mean of member percents', () => {
    const members: MemberCompletion[] = [
      { profileId: 'a', percent: 100, completedPhaseIds: ['p1', 'p2'], journeyComplete: true },
      { profileId: 'b', percent: 50, completedPhaseIds: ['p1'], journeyComplete: false },
      { profileId: 'c', percent: 0, completedPhaseIds: [], journeyComplete: false },
    ]
    const c = aggregateCohort(members, phaseIds)
    expect(c.memberCount).toBe(3)
    expect(c.meanPercent).toBe(50) // (100+50+0)/3
  })

  it('per-phase completion counts members and flags group-complete', () => {
    const members: MemberCompletion[] = [
      { profileId: 'a', percent: 100, completedPhaseIds: ['p1', 'p2'], journeyComplete: true },
      { profileId: 'b', percent: 50, completedPhaseIds: ['p1'], journeyComplete: false },
    ]
    const c = aggregateCohort(members, phaseIds)
    expect(c.phases[0]).toMatchObject({ phaseId: 'p1', completed: 2, total: 2, allComplete: true })
    expect(c.phases[1]).toMatchObject({ phaseId: 'p2', completed: 1, total: 2, allComplete: false })
  })

  it('the Circle group trophy fires only when EVERY member finished', () => {
    const notAll = aggregateCohort(
      [
        { profileId: 'a', percent: 100, completedPhaseIds: ['p1', 'p2'], journeyComplete: true },
        { profileId: 'b', percent: 80, completedPhaseIds: ['p1'], journeyComplete: false },
      ],
      phaseIds,
    )
    expect(notAll.allComplete).toBe(false)
    expect(notAll.journeyCompleted).toBe(1)

    const all = aggregateCohort(
      [
        { profileId: 'a', percent: 100, completedPhaseIds: ['p1', 'p2'], journeyComplete: true },
        { profileId: 'b', percent: 100, completedPhaseIds: ['p1', 'p2'], journeyComplete: true },
      ],
      phaseIds,
    )
    expect(all.allComplete).toBe(true)
  })

  it('an empty cohort is 0% and not complete', () => {
    const c = aggregateCohort([], phaseIds)
    expect(c.meanPercent).toBe(0)
    expect(c.allComplete).toBe(false)
    expect(c.phases.every((p) => !p.allComplete)).toBe(true)
  })
})
