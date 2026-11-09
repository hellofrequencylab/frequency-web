import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WALL_SETTINGS,
  standingCanPost,
  standingCanRead,
  wallSettingsFromRow,
  type WallSettings,
} from './community-wall'

const open: WallSettings = DEFAULT_WALL_SETTINGS
const membersOnly: WallSettings = { ...DEFAULT_WALL_SETTINGS, readAccess: 'members' }
const teamPosts: WallSettings = { ...DEFAULT_WALL_SETTINGS, postAccess: 'team' }
const followersIn: WallSettings = { ...DEFAULT_WALL_SETTINGS, followersInteract: true }

describe('wallSettingsFromRow', () => {
  it('no row is the owner-untouched defaults', () => {
    expect(wallSettingsFromRow(null)).toEqual(DEFAULT_WALL_SETTINGS)
    expect(DEFAULT_WALL_SETTINGS).toEqual({ readAccess: 'anyone', postAccess: 'members', followersInteract: false })
  })
  it('reads the three choices and falls back on anything unknown', () => {
    expect(wallSettingsFromRow({ read_access: 'members', post_access: 'team', followers_interact: true })).toEqual({
      readAccess: 'members',
      postAccess: 'team',
      followersInteract: true,
    })
    expect(wallSettingsFromRow({ read_access: 'weird', post_access: null, followers_interact: null })).toEqual(
      DEFAULT_WALL_SETTINGS,
    )
  })
})

describe('standingCanRead', () => {
  it('anyone reads an open wall on a public Space, signed in or not', () => {
    for (const s of ['signed-out', 'visitor', 'follower'] as const) expect(standingCanRead(s, open, false)).toBe(true)
  })
  it('a members-only wall is closed to everyone outside', () => {
    for (const s of ['signed-out', 'visitor', 'follower'] as const) expect(standingCanRead(s, membersOnly, false)).toBe(false)
    for (const s of ['owner', 'team', 'member'] as const) expect(standingCanRead(s, membersOnly, false)).toBe(true)
  })
  it('a private Space is never read from outside, whatever the wall setting says', () => {
    expect(standingCanRead('visitor', open, true)).toBe(false)
    expect(standingCanRead('signed-out', open, true)).toBe(false)
    expect(standingCanRead('member', open, true)).toBe(true)
  })
})

describe('standingCanPost', () => {
  it('the owner and the team always post', () => {
    expect(standingCanPost('owner', teamPosts)).toBe(true)
    expect(standingCanPost('team', teamPosts)).toBe(true)
  })
  it('members post unless the owner keeps posting to the team', () => {
    expect(standingCanPost('member', open)).toBe(true)
    expect(standingCanPost('member', teamPosts)).toBe(false)
  })
  it('a follower posts only when the owner lets followers interact', () => {
    expect(standingCanPost('follower', open)).toBe(false)
    expect(standingCanPost('follower', followersIn)).toBe(true)
  })
  it('a visitor and a signed-out viewer never post', () => {
    expect(standingCanPost('visitor', followersIn)).toBe(false)
    expect(standingCanPost('signed-out', followersIn)).toBe(false)
  })
})
