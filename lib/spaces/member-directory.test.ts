import { describe, it, expect } from 'vitest'
import {
  canSeeSpaceMemberDirectory,
  isDirectoryMembership,
  isDirectoryProfile,
} from './member-directory'

describe('canSeeSpaceMemberDirectory', () => {
  it('ROOT never lists, even to a manager', () => {
    expect(
      canSeeSpaceMemberDirectory({ spaceType: 'root', isActiveMember: true, canManage: true }),
    ).toBe(false)
  })

  it('an active member of a real Space can see it', () => {
    expect(
      canSeeSpaceMemberDirectory({ spaceType: 'business', isActiveMember: true, canManage: false }),
    ).toBe(true)
  })

  it('a manager who is not a member can still see it', () => {
    expect(
      canSeeSpaceMemberDirectory({ spaceType: 'business', isActiveMember: false, canManage: true }),
    ).toBe(true)
  })

  it('a visitor cannot', () => {
    expect(
      canSeeSpaceMemberDirectory({ spaceType: 'business', isActiveMember: false, canManage: false }),
    ).toBe(false)
  })
})

describe('isDirectoryMembership', () => {
  it('active is a membership', () => {
    expect(isDirectoryMembership('active')).toBe(true)
  })

  it('waitlist is not a membership', () => {
    expect(isDirectoryMembership('waitlist')).toBe(false)
  })

  it('cancelled is not a membership', () => {
    expect(isDirectoryMembership('cancelled')).toBe(false)
  })
})

describe('isDirectoryProfile', () => {
  it('needs a handle so the card can open', () => {
    expect(isDirectoryProfile({ handle: 'maya', ghost_mode: false })).toBe(true)
    expect(isDirectoryProfile({ handle: '  ', ghost_mode: false })).toBe(false)
    expect(isDirectoryProfile({ handle: null, ghost_mode: false })).toBe(false)
  })

  it('ghost mode stays invisible', () => {
    expect(isDirectoryProfile({ handle: 'maya', ghost_mode: true })).toBe(false)
  })
})
