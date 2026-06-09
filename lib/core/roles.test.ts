import { describe, it, expect } from 'vitest'
import { atLeastRole, roleRank, ROLE_HIERARCHY, type CommunityRole } from './roles'

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
