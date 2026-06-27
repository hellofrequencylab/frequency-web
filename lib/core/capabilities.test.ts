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

describe('resolveCapabilities · global creation gates (ADR-414 — real Crew to create)', () => {
  const CREATES = ['event.create', 'circle.create', 'journey.create', 'practice.create'] as const
  const hasAllCreates = (caps: ReturnType<typeof resolveCapabilities>) => CREATES.every((c) => caps.has(c))
  const hasNoCreates = (caps: ReturnType<typeof resolveCapabilities>) => CREATES.every((c) => !caps.has(c))

  it('grants all four create gates to a real paid Crew (or Supporter) member', () => {
    expect(hasAllCreates(resolveCapabilities({ profileId: 'p', role: 'member', realTier: 'crew' }, { kind: 'global' }))).toBe(true)
    expect(hasAllCreates(resolveCapabilities({ profileId: 'p', role: 'member', realTier: 'supporter' }, { kind: 'global' }))).toBe(true)
  })

  it('denies all four to a genuinely free member EVEN under the beta tier override', () => {
    // The beta override sets the effective `tier` to crew while the REAL tier stays free.
    // The gates read realTier, so the upgrade popup still fires (the whole point of ADR-414).
    const betaFree = resolveCapabilities({ profileId: 'p', role: 'member', tier: 'crew', realTier: 'free' }, { kind: 'global' })
    expect(hasNoCreates(betaFree)).toBe(true)
  })

  it('grants to community stewards (crew+ on the trust ladder) regardless of billing', () => {
    expect(hasAllCreates(resolveCapabilities({ profileId: 'p', role: 'crew', realTier: 'free' }, { kind: 'global' }))).toBe(true)
    expect(hasAllCreates(resolveCapabilities({ profileId: 'p', role: 'host', realTier: 'free' }, { kind: 'global' }))).toBe(true)
    expect(hasAllCreates(resolveCapabilities({ profileId: 'p', role: 'mentor', realTier: 'free' }, { kind: 'global' }))).toBe(true)
  })

  it('grants to platform staff (web_role) regardless of billing', () => {
    expect(hasAllCreates(resolveCapabilities({ profileId: 'p', role: 'member', webRole: 'admin', realTier: 'free' }, { kind: 'global' }))).toBe(true)
  })

  it('falls back to `tier` when realTier is omitted (no beta override in play)', () => {
    expect(hasAllCreates(resolveCapabilities({ profileId: 'p', role: 'member', tier: 'crew' }, { kind: 'global' }))).toBe(true)
    expect(hasNoCreates(resolveCapabilities({ profileId: 'p', role: 'member', tier: 'free' }, { kind: 'global' }))).toBe(true)
  })

  it('an anonymous viewer gets no create gates', () => {
    expect(hasNoCreates(resolveCapabilities({ profileId: null, role: 'member' }, { kind: 'global' }))).toBe(true)
  })

  it('a free member can reach the gates via the paid rung (capabilityGaps → needs-paid-tier)', () => {
    const gaps = capabilityGaps({ profileId: 'p', role: 'member', tier: 'free', realTier: 'free' }, { kind: 'global' })
    expect(gaps['event.create']).toBe('needs-paid-tier')
    expect(gaps['circle.create']).toBe('needs-paid-tier')
    expect(gaps['journey.create']).toBe('needs-paid-tier')
    expect(gaps['practice.create']).toBe('needs-paid-tier')
  })
})

describe('resolveCapabilities · profile', () => {
  it('owner or STAFF janitor (web_role) can edit, others cannot', () => {
    expect(can(resolveCapabilities({ profileId: 'p1', role: 'member' }, { kind: 'profile', ownerId: 'p1' }), 'profile.edit')).toBe(true)
    expect(can(resolveCapabilities({ profileId: 'p2', role: 'member' }, { kind: 'profile', ownerId: 'p1' }), 'profile.edit')).toBe(false)
    // A community 'janitor'-rung with no web_role does NOT get moderation edit now.
    expect(can(resolveCapabilities({ profileId: 'jc', role: 'janitor' }, { kind: 'profile', ownerId: 'p1' }), 'profile.edit')).toBe(false)
    expect(can(resolveCapabilities({ profileId: 'j', role: 'member', webRole: 'janitor' }, { kind: 'profile', ownerId: 'p1' }), 'profile.edit')).toBe(true)
    // Platform STAFF admin (web_role) also gets basic moderation edit now.
    expect(can(resolveCapabilities({ profileId: 'a', role: 'member', webRole: 'admin' }, { kind: 'profile', ownerId: 'p1' }), 'profile.edit')).toBe(true)
  })

  it('spotlight.manage requires the owner (or janitor) AND the owner having it enabled', () => {
    const owner = { profileId: 'p1', role: 'member' as const }
    // off by default → no manage even for the owner
    expect(can(resolveCapabilities(owner, { kind: 'profile', ownerId: 'p1' }), 'spotlight.manage')).toBe(false)
    // enabled → owner manages
    expect(can(resolveCapabilities(owner, { kind: 'profile', ownerId: 'p1', ownerSpotlightEnabled: true }), 'spotlight.manage')).toBe(true)
    // a different member never manages someone else's, even when enabled
    expect(can(resolveCapabilities({ profileId: 'p2', role: 'member' }, { kind: 'profile', ownerId: 'p1', ownerSpotlightEnabled: true }), 'spotlight.manage')).toBe(false)
    // a janitor may manage (moderation) when enabled
    expect(can(resolveCapabilities({ profileId: 'j', role: 'member', webRole: 'janitor' }, { kind: 'profile', ownerId: 'p1', ownerSpotlightEnabled: true }), 'spotlight.manage')).toBe(true)
  })

  it('spotlight.view is a Crew+ entitlement on the REAL tier (beta override cannot widen it)', () => {
    const scope: Scope = { kind: 'profile', ownerId: 'p1', ownerSpotlightEnabled: true, ownerSpotlightPublished: true }
    // free member (incl. a beta-granted effective Crew but realTier free) → no view
    expect(can(resolveCapabilities({ profileId: 'p2', role: 'member', tier: 'free' }, scope), 'spotlight.view')).toBe(false)
    expect(can(resolveCapabilities({ profileId: 'p2', role: 'member', tier: 'crew', realTier: 'free' }, scope), 'spotlight.view')).toBe(false)
    // real paid Crew → view
    expect(can(resolveCapabilities({ profileId: 'p2', role: 'member', realTier: 'crew' }, scope), 'spotlight.view')).toBe(true)
    // crew on the trust ladder, or staff → view
    expect(can(resolveCapabilities({ profileId: 'p2', role: 'crew' }, scope), 'spotlight.view')).toBe(true)
    expect(can(resolveCapabilities({ profileId: 'a', role: 'member', webRole: 'admin' }, scope), 'spotlight.view')).toBe(true)
  })

  it('spotlight.enable is a Crew+ self-serve switch — only the OWNER, only Crew+', () => {
    const scope: Scope = { kind: 'profile', ownerId: 'p1' }
    // a free owner cannot self-enable (the upgrade nudge lives elsewhere)
    expect(can(resolveCapabilities({ profileId: 'p1', role: 'member', tier: 'free' }, scope), 'spotlight.enable')).toBe(false)
    // a real paid-Crew owner, or crew-on-the-ladder owner, or staff owner → can enable their own
    expect(can(resolveCapabilities({ profileId: 'p1', role: 'member', realTier: 'crew' }, scope), 'spotlight.enable')).toBe(true)
    expect(can(resolveCapabilities({ profileId: 'p1', role: 'crew' }, scope), 'spotlight.enable')).toBe(true)
    expect(can(resolveCapabilities({ profileId: 'p1', role: 'member', webRole: 'admin' }, scope), 'spotlight.enable')).toBe(true)
    // a Crew+ NON-owner never gets enable on someone else's profile (it's self-serve only)
    expect(can(resolveCapabilities({ profileId: 'p2', role: 'crew' }, scope), 'spotlight.enable')).toBe(false)
    // even a janitor doesn't self-enable a member here — they use the admin toggle instead
    expect(can(resolveCapabilities({ profileId: 'j', role: 'member', webRole: 'janitor' }, scope), 'spotlight.enable')).toBe(false)
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

describe('resolveCapabilities · practice', () => {
  const base: Scope = { kind: 'practice', practiceId: 'pr1', ownerId: 'owner1' }

  it('the practice owner can edit', () => {
    expect(can(resolveCapabilities({ profileId: 'owner1', role: 'member' }, base), 'practice.editSettings')).toBe(true)
  })

  it('platform staff (web_role admin + janitor) can edit any practice', () => {
    expect(can(resolveCapabilities({ profileId: 'ax', role: 'member', webRole: 'admin' }, base), 'practice.editSettings')).toBe(true)
    expect(can(resolveCapabilities({ profileId: 'jx', role: 'member', webRole: 'janitor' }, base), 'practice.editSettings')).toBe(true)
  })

  it('whoever manages the parent scope can edit (caller-computed)', () => {
    expect(can(resolveCapabilities({ profileId: 'g', role: 'guide' }, { ...base, viewerManagesScope: true }), 'practice.editSettings')).toBe(true)
  })

  it('an unrelated member cannot edit', () => {
    expect(can(resolveCapabilities({ profileId: 'x', role: 'member' }, base), 'practice.editSettings')).toBe(false)
  })
})

describe('resolveCapabilities · scoped stewardship edges (P1.6, ADR-218→220)', () => {
  // A leadsScope predicate over a set of (scopeType:scopeId) the viewer holds.
  const edgesOn = (...keys: string[]) =>
    (scopeType: string, scopeId: string) => keys.includes(`${scopeType}:${scopeId}`)

  it('an edge host manages a circle even with NO host_id FK match', () => {
    const caps = resolveCapabilities(
      { profileId: 'e1', role: 'member', leadsScope: edgesOn('circle:c1') },
      { kind: 'circle', circleId: 'c1', hostId: null },
    )
    expect(can(caps, 'circle.editSettings')).toBe(true)
    expect(can(caps, 'circle.post')).toBe(true)
  })

  it('a circle edge is SCOPE-ISOLATED — it does not leak to another circle', () => {
    const viewer = { profileId: 'e1', role: 'member' as const, leadsScope: edgesOn('circle:c1') }
    expect(can(resolveCapabilities(viewer, { kind: 'circle', circleId: 'c1', hostId: null }), 'circle.editSettings')).toBe(true)
    expect(can(resolveCapabilities(viewer, { kind: 'circle', circleId: 'c2', hostId: null }), 'circle.editSettings')).toBe(false)
  })

  it('edge leadership lights hub.manage and nexus.manage in-scope only', () => {
    const viewer = { profileId: 'e2', role: 'member' as const, leadsScope: edgesOn('hub:h1', 'nexus:n1') }
    expect(can(resolveCapabilities(viewer, { kind: 'hub', hubId: 'h1' }), 'hub.manage')).toBe(true)
    expect(can(resolveCapabilities(viewer, { kind: 'hub', hubId: 'h2' }), 'hub.manage')).toBe(false)
    expect(can(resolveCapabilities(viewer, { kind: 'nexus', nexusId: 'n1' }), 'nexus.manage')).toBe(true)
    expect(can(resolveCapabilities(viewer, { kind: 'nexus', nexusId: 'n2' }), 'nexus.manage')).toBe(false)
  })

  it('PARITY: edges that mirror the leader FKs resolve identically to FK-only (the backfill state)', () => {
    // The provable "PR-1 is behavior-preserving" guarantee: for every leader who has
    // both an FK and a matching edge (ADR-218 backfill), the resolved caps are equal
    // whether or not leadsScope is supplied.
    const scopes: Scope[] = [
      { kind: 'circle', circleId: 'c1', hostId: 'leader' },
      { kind: 'hub', hubId: 'h1', guideId: 'leader' },
      { kind: 'nexus', nexusId: 'n1', mentorId: 'leader' },
    ]
    const withEdges = edgesOn('circle:c1', 'hub:h1', 'nexus:n1')
    for (const scope of scopes) {
      const fkOnly = [...resolveCapabilities({ profileId: 'leader', role: 'host' }, scope)].sort()
      const fkPlusEdge = [...resolveCapabilities({ profileId: 'leader', role: 'host', leadsScope: withEdges }, scope)].sort()
      expect(fkPlusEdge).toEqual(fkOnly)
    }
  })

  it('back-compat: a viewer with no edges (predicate absent or false) is unchanged', () => {
    const fk = resolveCapabilities({ profileId: 'host1', role: 'host' }, { kind: 'circle', circleId: 'c1', hostId: 'host1' })
    const fkFalse = resolveCapabilities(
      { profileId: 'host1', role: 'host', leadsScope: () => false },
      { kind: 'circle', circleId: 'c1', hostId: 'host1' },
    )
    expect([...fkFalse].sort()).toEqual([...fk].sort())
    // And a non-leader with no edges still cannot manage.
    expect(can(resolveCapabilities({ profileId: 'x', role: 'member', leadsScope: () => false }, { kind: 'circle', circleId: 'c1', hostId: 'host1' }), 'circle.editSettings')).toBe(false)
  })
})
