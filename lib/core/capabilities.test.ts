import { describe, it, expect } from 'vitest'
import { resolveCapabilities, can, type Scope } from '@/lib/core/capabilities'
import { atLeastRole } from '@/lib/core/roles'

describe('atLeastRole', () => {
  it('orders the community ladder', () => {
    expect(atLeastRole('host', 'crew')).toBe(true)
    expect(atLeastRole('member', 'crew')).toBe(false)
    expect(atLeastRole('janitor', 'host')).toBe(true)
    expect(atLeastRole('crew', 'crew')).toBe(true)
  })
})

describe('resolveCapabilities · global', () => {
  it('grants admin.access to host+ only', () => {
    expect(can(resolveCapabilities({ profileId: 'm', role: 'member' }, { kind: 'global' }), 'admin.access')).toBe(false)
    expect(can(resolveCapabilities({ profileId: 'h', role: 'host' }, { kind: 'global' }), 'admin.access')).toBe(true)
    expect(can(resolveCapabilities({ profileId: 'j', role: 'janitor' }, { kind: 'global' }), 'admin.access')).toBe(true)
  })
})

describe('resolveCapabilities · profile', () => {
  it('owner or janitor can edit, others cannot', () => {
    expect(can(resolveCapabilities({ profileId: 'p1', role: 'member' }, { kind: 'profile', ownerId: 'p1' }), 'profile.edit')).toBe(true)
    expect(can(resolveCapabilities({ profileId: 'p2', role: 'member' }, { kind: 'profile', ownerId: 'p1' }), 'profile.edit')).toBe(false)
    expect(can(resolveCapabilities({ profileId: 'j', role: 'janitor' }, { kind: 'profile', ownerId: 'p1' }), 'profile.edit')).toBe(true)
  })
})

describe('resolveCapabilities · circle', () => {
  const base: Scope = { kind: 'circle', circleId: 'c1', hostId: 'host1' }

  it('the host manages and can post', () => {
    const caps = resolveCapabilities({ profileId: 'host1', role: 'host' }, base)
    expect(can(caps, 'circle.editSettings')).toBe(true)
    expect(can(caps, 'circle.post')).toBe(true)
  })

  it('a janitor manages any circle', () => {
    expect(can(resolveCapabilities({ profileId: 'jx', role: 'janitor' }, base), 'circle.editSettings')).toBe(true)
  })

  it('an active member can post but not manage', () => {
    const caps = resolveCapabilities({ profileId: 'm1', role: 'member' }, { ...base, membership: { status: 'active' } })
    expect(can(caps, 'circle.post')).toBe(true)
    expect(can(caps, 'circle.editSettings')).toBe(false)
  })

  it('a non-member sees only view', () => {
    const caps = resolveCapabilities({ profileId: 'x', role: 'member' }, base)
    expect(can(caps, 'circle.view')).toBe(true)
    expect(can(caps, 'circle.post')).toBe(false)
  })

  it('an area guide manages via viewerManagesParent', () => {
    const caps = resolveCapabilities({ profileId: 'g', role: 'guide' }, { ...base, viewerManagesParent: true })
    expect(can(caps, 'circle.editSettings')).toBe(true)
  })

  it('a crew active member can volunteer only when tasks are open', () => {
    const open = resolveCapabilities({ profileId: 'cr', role: 'crew' }, { ...base, membership: { status: 'active' }, openTaskCount: 2 })
    expect(can(open, 'task.volunteer')).toBe(true)
    const none = resolveCapabilities({ profileId: 'cr', role: 'crew' }, { ...base, membership: { status: 'active' }, openTaskCount: 0 })
    expect(can(none, 'task.volunteer')).toBe(false)
  })
})
