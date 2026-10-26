import { describe, expect, it } from 'vitest'
import { rankSpaceCoachingTask, summarizeCoachingAttendance, type ProfileCoachingEvidence } from './coaching-evidence'

const observed: ProfileCoachingEvidence = { windowDays: 30, observedFrom: '2026-09-25T00:00:00.000Z', observedThrough: '2026-10-25T00:00:00.000Z', profileViews: 20, ctaClicks: 3 }
const identity = { name: 'Thursday walks', tagline: 'Walk with neighbors', about: 'We meet at the park.' }

describe('rankSpaceCoachingTask', () => {
  it('ranks a confirmed missing field before speculative marketing advice', () => {
    const task = rankSpaceCoachingTask({ ...identity, tagline: ' ', about: '' }, observed)
    expect(task.id).toBe('tagline')
    expect(task.confidence).toBe('confirmed gap')
    expect(task.evidence).toContain('The Space tagline is blank.')
    expect(task.question).toContain('your own words')
  })
  it('does not turn a failed measurement into poor performance', () => {
    const task = rankSpaceCoachingTask(identity, { ...observed, profileViews: null, ctaClicks: null })
    expect(task.id).toBe('measurement')
    expect(task.confidence).toBe('unavailable')
    expect(task.evidence).toEqual([])
    expect(task.missingData.join(' ')).toContain('It is not zero')
  })
  it('does not call an unloaded identity incomplete', () => {
    expect(rankSpaceCoachingTask(null, observed).id).toBe('outcome')
    expect(rankSpaceCoachingTask(null, observed).missingData.join(' ')).toContain('Missing fields cannot be assessed')
  })
  it('offers a profile walk-through when the known count is zero without claiming there are no visitors', () => {
    const task = rankSpaceCoachingTask(identity, { ...observed, profileViews: 0, ctaClicks: 0 })
    expect(task.id).toBe('preview')
    expect(task.evidence[0]).toContain('0 recorded profile-view buckets')
    expect(task.rationale).toContain('not a prediction')
  })
  it('uses views with no clicks only to suggest checking the button, not a failed conversion claim', () => {
    expect(rankSpaceCoachingTask(identity, { ...observed, ctaClicks: 0 })).toMatchObject({ id: 'action', destination: 'header', confidence: 'observed signal' })
  })
  it('never equates repeat clicks or view buckets with real-world outcomes', () => {
    const task = rankSpaceCoachingTask(identity, { ...observed, profileViews: 1, ctaClicks: 50 })
    expect(task.id).toBe('outcome')
    expect(task.missingData.join(' ')).toContain('not measured')
    expect(JSON.stringify(task)).not.toContain('%')
  })
  it('rejects invalid count values as unavailable', () => {
    for (const n of [NaN, Infinity, -1, 0.5]) expect(rankSpaceCoachingTask(identity, { ...observed, profileViews: n }).id).toBe('measurement')
  })
})


describe('verified attendance evidence', () => {
  it('counts people who returned to a different event, not duplicate check-in rows', () => {
    const result = summarizeCoachingAttendance([
      { profileId: 'a', at: 20, eventId: 'one' },
      { profileId: 'a', at: 20, eventId: 'one' },
      { profileId: 'a', at: 30, eventId: 'two' },
      { profileId: 'b', at: 25, eventId: 'one' },
      { profileId: 'old', at: 1, eventId: 'old' },
      { profileId: 'future', at: 100, eventId: 'future' },
    ], 10, 50)
    expect(result).toEqual({ checkins: 4, people: 2, returnPeople: 1 })
    const task = rankSpaceCoachingTask(identity, { ...observed, attendance: result })
    expect(task.id).toBe('attendance')
    expect(task.evidence.join(' ')).toContain('2 distinct attendees')
    expect(task.missingData.join(' ')).toContain('do not establish what caused')
  })
  it('keeps unavailable attendance and unknown event references honest', () => {
    expect(summarizeCoachingAttendance(null, 10, 50)).toBeNull()
    expect(summarizeCoachingAttendance([{ profileId: 'a', at: 20 }], 10, 50)?.returnPeople).toBeNull()
    expect(summarizeCoachingAttendance([], 10, 50)).toEqual({ checkins: 0, people: 0, returnPeople: 0 })
  })
})
