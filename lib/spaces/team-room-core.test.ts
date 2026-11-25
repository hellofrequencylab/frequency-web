import { describe, expect, it } from 'vitest'
import { teamRoomName, teamRoomPlan } from './team-room-core'

describe('teamRoomName', () => {
  it('names the room after the Space', () => {
    expect(teamRoomName('Sunset Yoga')).toBe('Sunset Yoga team')
    expect(teamRoomName('  ')).toBe('Space team')
  })
})

describe('teamRoomPlan', () => {
  it('seats the owner as an admin and every active member in a new room', () => {
    const plan = teamRoomPlan({ ownerId: 'o', team: [{ profileId: 'a', admin: false }, { profileId: 'b', admin: true }], current: [] })
    expect(plan.upsert).toEqual(
      expect.arrayContaining([
        { profileId: 'o', admin: true },
        { profileId: 'a', admin: false },
        { profileId: 'b', admin: true },
      ]),
    )
    expect(plan.remove).toEqual([])
  })

  it('writes nothing when the room already matches the team', () => {
    const plan = teamRoomPlan({
      ownerId: 'o',
      team: [{ profileId: 'o', admin: true }, { profileId: 'a', admin: false }],
      current: [{ profileId: 'o', admin: true }, { profileId: 'a', admin: false }],
    })
    expect(plan).toEqual({ upsert: [], remove: [] })
  })

  it('takes out someone who left the team and fixes a changed role', () => {
    const plan = teamRoomPlan({
      ownerId: 'o',
      team: [{ profileId: 'a', admin: true }],
      current: [{ profileId: 'o', admin: true }, { profileId: 'a', admin: false }, { profileId: 'gone', admin: false }],
    })
    expect(plan.upsert).toEqual([{ profileId: 'a', admin: true }])
    expect(plan.remove).toEqual(['gone'])
  })
})
