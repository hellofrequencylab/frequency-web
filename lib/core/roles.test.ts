import { describe, it, expect } from 'vitest'
import {
  asWebRole,
  atLeastRole,
  canModeratePlatform,
  isCuratedModerator,
  isStaff,
  roleRank,
  ROLE_HIERARCHY,
  type CommunityRole,
} from './roles'

describe('ROLE_HIERARCHY', () => {
  it('has exactly 7 roles in ascending order', () => {
    expect(ROLE_HIERARCHY).toEqual([
      'member',
      'crew',
      'host',
      'guide',
      'mentor',
      'admin',
      'janitor',
    ])
  })

  it('member is the lowest rank (0)', () => {
    expect(roleRank('member')).toBe(0)
  })

  it('janitor is the highest rank', () => {
    expect(roleRank('janitor')).toBe(ROLE_HIERARCHY.length - 1)
  })

  it('null/undefined returns -1', () => {
    expect(roleRank(null)).toBe(-1)
    expect(roleRank(undefined)).toBe(-1)
  })
})

describe('roleRank — numeric ordering', () => {
  const ordered: CommunityRole[] = ['member', 'crew', 'host', 'guide', 'mentor', 'admin', 'janitor']

  it('each role outranks every role before it', () => {
    for (let i = 1; i < ordered.length; i++) {
      expect(roleRank(ordered[i])).toBeGreaterThan(roleRank(ordered[i - 1]))
    }
  })
})

describe('atLeastRole', () => {
  it('a role meets itself', () => {
    expect(atLeastRole('host', 'host')).toBe(true)
    expect(atLeastRole('admin', 'admin')).toBe(true)
    expect(atLeastRole('member', 'member')).toBe(true)
  })

  it('a higher role passes a lower minimum', () => {
    expect(atLeastRole('admin', 'host')).toBe(true)
    expect(atLeastRole('janitor', 'member')).toBe(true)
    expect(atLeastRole('mentor', 'crew')).toBe(true)
  })

  it('a lower role fails a higher minimum', () => {
    expect(atLeastRole('member', 'crew')).toBe(false)
    expect(atLeastRole('host', 'guide')).toBe(false)
    expect(atLeastRole('admin', 'janitor')).toBe(false)
  })

  it('null/undefined role never meets any minimum', () => {
    expect(atLeastRole(null, 'member')).toBe(false)
    expect(atLeastRole(undefined, 'member')).toBe(false)
    expect(atLeastRole(null, 'janitor')).toBe(false)
  })

  it('admin is NOT at least janitor (janitor has the most sensitive keys)', () => {
    expect(atLeastRole('admin', 'janitor')).toBe(false)
  })
})

describe('web_role · staff stays admin/janitor; moderator is granted (OWN-054)', () => {
  it('asWebRole admits moderator and fails closed on unknown values', () => {
    expect(asWebRole('admin')).toBe('admin')
    expect(asWebRole('janitor')).toBe('janitor')
    expect(asWebRole('moderator')).toBe('moderator')
    expect(asWebRole('none')).toBe('none')
    expect(asWebRole('host')).toBe('none')
    expect(asWebRole(null)).toBe('none')
  })

  it('isStaff does not treat a curated moderator as staff', () => {
    expect(isStaff('admin')).toBe(true)
    expect(isStaff('janitor')).toBe(true)
    expect(isStaff('moderator')).toBe(false)
    expect(isStaff('none')).toBe(false)
  })

  it('canModeratePlatform admits staff and a granted moderator, not a host rung', () => {
    expect(canModeratePlatform('moderator')).toBe(true)
    expect(canModeratePlatform('admin')).toBe(true)
    expect(isCuratedModerator('moderator')).toBe(true)
    expect(isCuratedModerator('admin')).toBe(false)
    expect(canModeratePlatform('none')).toBe(false)
  })
})
