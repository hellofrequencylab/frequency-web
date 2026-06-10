import { describe, it, expect } from 'vitest'
import { resolveCapabilities, capabilityGaps, can, type Scope } from '@/lib/core/capabilities'
import { atLeastRole } from '@/lib/core/roles'

describe('atLeastRole', () => {
  it('orders the community ladder', () => {
    expect(atLeastRole('host', 'crew')).toBe(true)
    expect(atLeastRole('member', 'crew')).toBe(false)
    expect(atLeastRole('janitor', 'host')).toBe(true)
    expect(atLeastRole('crew', 'crew')).toBe(true)
  })
})

describe('resolveCapabilities · global (admin.access rides the STAFF axis, ADR-208)', () => {
  it('grants admin.access to web_role staff (admin/janitor), NOT the community ladder', () => {
    // Community standing alone never opens admin now — only web_role.
    expect(can(resolveCapabilities({ profileId: 'm', role: 'member' }, { kind: 'global' }), 'admin.access')).toBe(false)
    expect(can(resolveCapabilities({ profileId: 'h', role: 'host' }, { kind: 'global' }), 'admin.access')).toBe(false)
    expect(can(resolveCapabilities({ profileId: 'mn', role: 'mentor' }, { kind: 'global' }), 'admin.access')).toBe(false)
    // Staff axis opens it — even for a community member.
    expect(can(resolveCapabilities({ profileId: 'a', role: 'member', webRole: 'admin' }, { kind: 'global' }), 'admin.access')).toBe(true)
    expect(can(resolveCapabilities({ profileId: 'j', role: 'member', webRole: 'janitor' }, { kind: 'global' }), 'admin.access')).toBe(true)
  })
})

describe('resolveCapabilities · profile', () => {
  it('owner or STAFF janitor (web_role) can edit, others cannot', () => {
    expect(can(resolveCapabilities({ profileId: 'p1', role: 'member' }, { kind: 'profile', ownerId: 'p1' }), 'profile.edit')).toBe(true)
    expect(can(resolveCapabilities({ profileId: 'p2', role: 'member' }, { kind: 'profile', ownerId: 'p1' }), 'profile.edit')).toBe(false)
    // A community 'janitor'-rung with no web_role does NOT get moderation edit now.
    expect(can(resolveCapabilities({ profileId: 'jc', role: 'janitor' }, { kind: 'profile', ownerId: 'p1' }), 'profile.edit')).toBe(false)
    expect(can(resolveCapabilities({ profileId: 'j', role: 'member', webRole: 'janitor' }, { kind: 'profile', ownerId: 'p1' }), 'profile.edit')).toBe(true)
  })
})

describe('resolveCapabilities · circle', () => {
  const base: Scope = { kind: 'circle', circleId: 'c1', hostId: 'host1' }

  it('the host manages and can post', () => {
    const caps = resolveCapabilities({ profileId: 'host1', role: 'host' }, base)
    expect(can(caps, 'circle.editSettings')).toBe(true)
    expect(can(caps, 'circle.post')).toBe(true)
  })

  it('platform staff (web_role admin + janitor) manage any circle', () => {
    expect(can(resolveCapabilities({ profileId: 'jx', role: 'member', webRole: 'janitor' }, base), 'circle.editSettings')).toBe(true)
    expect(can(resolveCapabilities({ profileId: 'ax', role: 'member', webRole: 'admin' }, base), 'circle.editSettings')).toBe(true)
    // The deprecated community 'admin' rung no longer manages circles on its own.
    expect(can(resolveCapabilities({ profileId: 'ac', role: 'admin' }, base), 'circle.editSettings')).toBe(false)
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

  it('a PAID (Crew tier) active member can volunteer only when tasks are open', () => {
    const open = resolveCapabilities({ profileId: 'cr', role: 'member', tier: 'crew' }, { ...base, membership: { status: 'active' }, openTaskCount: 2 })
    expect(can(open, 'task.volunteer')).toBe(true)
    const none = resolveCapabilities({ profileId: 'cr', role: 'member', tier: 'crew' }, { ...base, membership: { status: 'active' }, openTaskCount: 0 })
    expect(can(none, 'task.volunteer')).toBe(false)
  })

  it('a FREE active member cannot volunteer (membership perk, gated on tier not role)', () => {
    const free = resolveCapabilities({ profileId: 'fm', role: 'member', tier: 'free' }, { ...base, membership: { status: 'active' }, openTaskCount: 2 })
    expect(can(free, 'task.volunteer')).toBe(false)
  })
})

describe('capabilityGaps (PB.1g — why is a capability absent?)', () => {
  const circle: Scope = { kind: 'circle', circleId: 'c1', hostId: 'host1', openTaskCount: 2 }

  it('a FREE active member is one upgrade away from task.volunteer', () => {
    const gaps = capabilityGaps(
      { profileId: 'fm', role: 'member', tier: 'free' },
      { ...circle, membership: { status: 'active' } },
    )
    expect(gaps['task.volunteer']).toBe('needs-paid-tier')
    expect(gaps['task.claim']).toBe('needs-paid-tier')
  })

  it('a PAID non-member needs to join the circle first', () => {
    const gaps = capabilityGaps({ profileId: 'cr', role: 'member', tier: 'crew' }, circle)
    expect(gaps['circle.post']).toBe('needs-membership')
    expect(gaps['task.volunteer']).toBe('needs-membership')
  })

  it('a FREE non-member: posting needs membership; volunteering needs the tier on top', () => {
    const gaps = capabilityGaps({ profileId: 'fm', role: 'member', tier: 'free' }, circle)
    expect(gaps['circle.post']).toBe('needs-membership')
    expect(gaps['task.volunteer']).toBe('needs-paid-tier')
  })

  it('management capabilities are role-gated', () => {
    const gaps = capabilityGaps(
      { profileId: 'fm', role: 'member', tier: 'free' },
      { ...circle, membership: { status: 'active' } },
    )
    expect(gaps['circle.editSettings']).toBe('needs-role')
    expect(gaps['circle.moderate']).toBe('needs-role')
  })

  it('global admin.access for a member is a role gap', () => {
    const gaps = capabilityGaps({ profileId: 'm', role: 'member' }, { kind: 'global' })
    expect(gaps['admin.access']).toBe('needs-role')
  })

  it('reports nothing for capabilities the viewer already holds', () => {
    const viewer = { profileId: 'cr', role: 'member' as const, tier: 'crew' as const }
    const scope: Scope = { ...circle, membership: { status: 'active' } }
    const gaps = capabilityGaps(viewer, scope)
    expect(gaps['circle.post']).toBeUndefined()
    expect(gaps['task.volunteer']).toBeUndefined()
  })

  it('no gap when there is nothing to unlock (zero open tasks)', () => {
    const gaps = capabilityGaps(
      { profileId: 'fm', role: 'member', tier: 'free' },
      { kind: 'circle', circleId: 'c1', hostId: 'host1', openTaskCount: 0, membership: { status: 'active' } },
    )
    expect(gaps['task.volunteer']).toBeUndefined()
  })

  it('unreachable capabilities get no entry (another member’s profile.edit needs ownership, not a rung)', () => {
    // A janitor probe WOULD unlock profile.edit (moderation), so it reads as a
    // role gap; but for an anonymous viewer nothing on the ladder helps.
    const anon = capabilityGaps({ profileId: null, role: 'member' }, { kind: 'profile', ownerId: 'p1' })
    expect(anon['profile.edit']).toBeUndefined()
    const member = capabilityGaps({ profileId: 'p2', role: 'member' }, { kind: 'profile', ownerId: 'p1' })
    expect(member['profile.edit']).toBe('needs-role')
  })

  it('does not disturb the resolver (same inputs still resolve identically)', () => {
    const viewer = { profileId: 'fm', role: 'member' as const, tier: 'free' as const }
    const scope: Scope = { ...circle, membership: { status: 'active' } }
    const before = [...resolveCapabilities(viewer, scope)].sort()
    capabilityGaps(viewer, scope)
    expect([...resolveCapabilities(viewer, scope)].sort()).toEqual(before)
  })
})

describe('resolveCapabilities · event', () => {
  const base: Scope = { kind: 'event', eventId: 'e1', hostId: 'host1' }

  it('the event host can edit', () => {
    expect(can(resolveCapabilities({ profileId: 'host1', role: 'member' }, base), 'event.editSettings')).toBe(true)
  })

  it('platform staff (web_role admin + janitor) can edit any event', () => {
    expect(can(resolveCapabilities({ profileId: 'ax', role: 'member', webRole: 'admin' }, base), 'event.editSettings')).toBe(true)
    expect(can(resolveCapabilities({ profileId: 'jx', role: 'member', webRole: 'janitor' }, base), 'event.editSettings')).toBe(true)
  })

  it('whoever manages the parent scope can edit (caller-computed)', () => {
    expect(can(resolveCapabilities({ profileId: 'g', role: 'guide' }, { ...base, viewerManagesScope: true }), 'event.editSettings')).toBe(true)
  })

  it('an unrelated member cannot edit', () => {
    expect(can(resolveCapabilities({ profileId: 'x', role: 'member' }, base), 'event.editSettings')).toBe(false)
  })
})
