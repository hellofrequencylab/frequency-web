import { describe, it, expect } from 'vitest'
import {
  deriveCommunityLevel,
  communityRoleToLevel,
  roleToLevel,
  leadsScope,
  levelRank,
  type StewardshipEdge,
} from '@/lib/core/stewardship'

// Edge builders for readable cases.
const host = (scopeId = 'c1'): StewardshipEdge => ({ role: 'host', scopeType: 'circle', scopeId })
const guide = (scopeId = 'h1'): StewardshipEdge => ({ role: 'guide', scopeType: 'hub', scopeId })
const mentor = (scopeId = 'n1'): StewardshipEdge => ({ role: 'mentor', scopeType: 'nexus', scopeId })
const outpostLead = (scopeId = 'o1'): StewardshipEdge => ({ role: 'outpost_lead', scopeType: 'outpost', scopeId })

describe('roleToLevel', () => {
  it('maps each steward role to its trust level', () => {
    expect(roleToLevel('crew')).toBe('crew')
    expect(roleToLevel('host')).toBe('host')
    expect(roleToLevel('guide')).toBe('guide')
    expect(roleToLevel('mentor')).toBe('mentor')
  })
  it('treats outpost_lead as an overlay that does not raise the level on its own', () => {
    expect(roleToLevel('outpost_lead')).toBe('member')
  })
})

describe('communityRoleToLevel (the floor)', () => {
  it('maps the community ladder onto the level subset', () => {
    expect(communityRoleToLevel('member')).toBe('member')
    expect(communityRoleToLevel('crew')).toBe('crew')
    expect(communityRoleToLevel('host')).toBe('host')
    expect(communityRoleToLevel('guide')).toBe('guide')
    expect(communityRoleToLevel('mentor')).toBe('mentor')
  })
  it('floors deprecated staff rungs to mentor so community gates are preserved', () => {
    expect(communityRoleToLevel('admin')).toBe('mentor')
    expect(communityRoleToLevel('janitor')).toBe('mentor')
  })
  it('fails closed on null/undefined', () => {
    expect(communityRoleToLevel(null)).toBe('member')
    expect(communityRoleToLevel(undefined)).toBe('member')
  })
})

describe('deriveCommunityLevel', () => {
  it('is member with no edges and no floor', () => {
    expect(deriveCommunityLevel([])).toBe('member')
  })

  it('takes a single edge as the level', () => {
    expect(deriveCommunityLevel([host()])).toBe('host')
  })

  it('takes the MAX across mixed edges', () => {
    expect(deriveCommunityLevel([host(), guide(), mentor()])).toBe('mentor')
    expect(deriveCommunityLevel([host('a'), host('b')])).toBe('host')
  })

  it('outpost_lead alone does not raise the level above its floor', () => {
    expect(deriveCommunityLevel([outpostLead()])).toBe('member')
    // but a co-held host edge still counts
    expect(deriveCommunityLevel([outpostLead(), host()])).toBe('host')
  })

  it('excludes suspended edges from the derivation', () => {
    expect(deriveCommunityLevel([{ ...mentor(), state: 'suspended' }])).toBe('member')
    expect(deriveCommunityLevel([{ ...mentor(), state: 'suspended' }, host()])).toBe('host')
  })

  it('treats an absent state as active', () => {
    expect(deriveCommunityLevel([{ role: 'guide', scopeType: 'hub', scopeId: 'h1' }])).toBe('guide')
  })

  it('floors by the legacy community_role so a global rank never regresses', () => {
    // A global host with zero edges keeps host-level access.
    expect(deriveCommunityLevel([], 'host')).toBe('host')
    // The higher of (floor, edges) wins.
    expect(deriveCommunityLevel([host()], 'mentor')).toBe('mentor')
    expect(deriveCommunityLevel([mentor()], 'host')).toBe('mentor')
  })
})

describe('leadsScope', () => {
  const edges = [host('circle-a'), guide('hub-b')]
  it('is true for a scope the person holds an active edge on', () => {
    expect(leadsScope(edges, 'circle', 'circle-a')).toBe(true)
    expect(leadsScope(edges, 'hub', 'hub-b')).toBe(true)
  })
  it('is false for an unheld scope or a type mismatch', () => {
    expect(leadsScope(edges, 'circle', 'circle-z')).toBe(false)
    expect(leadsScope(edges, 'nexus', 'circle-a')).toBe(false)
  })
  it('ignores suspended edges', () => {
    expect(leadsScope([{ ...host('circle-a'), state: 'suspended' }], 'circle', 'circle-a')).toBe(false)
  })
})

describe('levelRank', () => {
  it('orders member < crew < host < guide < mentor', () => {
    expect(levelRank('member')).toBeLessThan(levelRank('crew'))
    expect(levelRank('crew')).toBeLessThan(levelRank('host'))
    expect(levelRank('host')).toBeLessThan(levelRank('guide'))
    expect(levelRank('guide')).toBeLessThan(levelRank('mentor'))
  })
})
