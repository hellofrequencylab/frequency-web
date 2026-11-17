// FH-029: the partner store over a fake service-role client. The real decideSteward and decide() run on
// top, so these prove the wall itself: a forwarded link reads and writes nothing, the standing is read
// at the moment of the answer, a withdrawal changes only the partner row, and the organiser gate holds.
import { beforeEach, describe, expect, it, vi } from 'vitest'

type R = Record<string, unknown>
const tables: Record<string, R[]> = {}
const stewards: Record<string, { owner: string; admins: string[] }> = {}

function query(table: string) {
  const filters: [string, unknown][] = []
  let patch: R | null = null
  const rows = () => (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v))
  const run = () => {
    const hit = rows()
    if (patch) hit.forEach((r) => Object.assign(r, patch))
    return { data: hit, error: null }
  }
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => (filters.push([c, v]), q),
    in: () => q,
    order: () => q,
    limit: () => q,
    update: (p: R) => ((patch = p), q),
    insert: async (row: R) => ((tables[table] ??= []).push(row), { error: null }),
    upsert: async (row: R) => {
      const list = (tables[table] ??= [])
      const at = list.findIndex((r) => r.hunt_id === row.hunt_id && r.space_id === row.space_id)
      if (at >= 0) list[at] = { ...list[at], ...row }
      else list.push(row)
      return { error: null }
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
  }
  return q
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => query(t) }) }))
vi.mock('@/lib/spaces/store', () => ({
  getSpaceById: async (id: string) => (stewards[id] ? { id, name: `Space ${id}`, ownerProfileId: stewards[id].owner } : null),
  getSpaceBySlug: async (slug: string) => (stewards[slug] ? { id: slug, name: `Space ${slug}`, ownerProfileId: stewards[slug].owner } : null),
}))
vi.mock('@/lib/spaces/membership', () => ({
  getSpaceMembership: async (spaceId: string, profileId: string) =>
    stewards[spaceId]?.admins.includes(profileId) ? { role: 'admin', status: 'active' } : profileId === 'editor' ? { role: 'editor', status: 'active' } : null,
}))

import { invitePartner, isStewardNow, listPartners, loadStewardInvite, respondAsSteward, revokePartner } from './partner-store'

const NOW = '2026-11-16T12:00:00Z'
const APPROVED = { hash: 'terms-v1', approved: true }
const partner = () => tables.hunt_partners.find((r) => r.space_id === 'venue')!
const answer = (action: 'accept' | 'decline' | 'withdraw', actorId: string) =>
  respondAsSteward(action, { huntId: 'h1', spaceId: 'venue', actorId, now: NOW, terms: APPROVED })

beforeEach(() => {
  stewards.venue = { owner: 'venue-owner', admins: ['steward', 'second-steward'] }
  stewards.home = { owner: 'organiser', admins: [] }
  tables.hunts = [{ id: 'h1', slug: 'h1', visibility: 'private', owner_profile_id: 'organiser', owner_space_id: null, status: 'draft', current_version_id: null, revision: 1 }]
  tables.hunt_roles = []
  tables.hunt_audit = []
  tables.profiles = [{ id: 'steward', handle: 'steward', display_name: 'Sam Steward' }, { id: 'editor', handle: 'editor', display_name: 'Ed' }]
  tables.hunt_progress = [{ run_id: 'r1', mission_key: 'm1', disposition: 'credited' }]
  tables.hunt_claims = [{ id: 'c1', run_id: 'r1', mission_key: 'm1', state: 'accepted' }]
  tables.hunt_partners = [{ hunt_id: 'h1', space_id: 'venue', status: 'invited', effective_at: null, revoked_at: null, permitted_roles: ['operator'], invitee_profile_id: 'steward', terms_version: 'terms-v1' }]
})

describe('who is a steward', () => {
  it('is the owner or an active admin, never an editor or a stranger', async () => {
    expect(await isStewardNow('venue', 'venue-owner')).toBe(true)
    expect(await isStewardNow('venue', 'steward')).toBe(true)
    expect(await isStewardNow('venue', 'editor')).toBe(false)
    expect(await isStewardNow('venue', 'stranger')).toBe(false)
    expect(await isStewardNow('nowhere', 'steward')).toBe(false)
  })
})

describe('a forwarded invite', () => {
  it('shows nothing to anyone but the named steward, including another steward of the Space', async () => {
    expect(await loadStewardInvite('h1', 'venue', 'stranger', NOW, APPROVED)).toBeNull()
    expect(await loadStewardInvite('h1', 'venue', 'second-steward', NOW, APPROVED)).toBeNull()
    expect((await loadStewardInvite('h1', 'venue', 'steward', NOW, APPROVED))?.isInvitee).toBe(true)
  })

  it('writes nothing when someone else tries to accept', async () => {
    expect(await answer('accept', 'second-steward')).toEqual({ ok: false, reason: 'not_invitee' })
    expect(await answer('accept', 'stranger')).toEqual({ ok: false, reason: 'not_invitee' })
    expect(partner().status).toBe('invited')
    expect(tables.hunt_audit).toEqual([])
  })

  it('refuses the named person once they lost the role, at the moment they answer', async () => {
    stewards.venue.admins = ['second-steward']
    expect(await answer('accept', 'steward')).toEqual({ ok: false, reason: 'not_steward_now' })
    expect(partner().status).toBe('invited')
  })
})

describe('acceptance', () => {
  it('records who accepted, when, and under which terms', async () => {
    expect(await answer('accept', 'steward')).toEqual({ ok: true, status: 'accepted' })
    expect(partner()).toMatchObject({ status: 'accepted', accepted_by: 'steward', effective_at: NOW, revoked_at: null, terms_version: 'terms-v1' })
    expect(tables.hunt_audit).toEqual([expect.objectContaining({ action: 'partner_accepted', target_kind: 'partner', target_id: 'venue', actor_profile_id: 'steward', after_state: { status: 'accepted', terms_version: 'terms-v1' } })])
  })

  it('cannot land twice', async () => {
    await answer('accept', 'steward')
    expect(await answer('accept', 'steward')).toEqual({ ok: false, reason: 'no_invite' })
    expect(tables.hunt_audit).toHaveLength(1)
  })

  it('is closed with the real terms, which are not approved yet', async () => {
    const out = await respondAsSteward('accept', { huntId: 'h1', spaceId: 'venue', actorId: 'steward', now: NOW })
    expect(out.ok).toBe(false)
    expect(partner().status).toBe('invited')
  })
})

describe('withdrawal', () => {
  beforeEach(async () => {
    await answer('accept', 'steward')
  })

  it('ends the partner at once and leaves earned credit alone', async () => {
    expect(await answer('withdraw', 'second-steward')).toEqual({ ok: true, status: 'withdrawn' })
    expect(partner()).toMatchObject({ status: 'withdrawn', revoked_at: NOW })
    expect(tables.hunt_progress).toEqual([{ run_id: 'r1', mission_key: 'm1', disposition: 'credited' }])
    expect(tables.hunt_claims).toEqual([{ id: 'c1', run_id: 'r1', mission_key: 'm1', state: 'accepted' }])
    expect((await loadStewardInvite('h1', 'venue', 'steward', NOW, APPROVED))?.live).toBe(false)
  })

  it('is refused for a person outside the Space', async () => {
    expect(await answer('withdraw', 'stranger')).toEqual({ ok: false, reason: 'not_steward_now' })
    expect(partner().status).toBe('accepted')
  })
})

describe('the organiser', () => {
  it('lists partners for the Hunt owner only', async () => {
    expect(await listPartners('h1', 'stranger', NOW)).toBeNull()
    const view = await listPartners('h1', 'organiser', NOW)
    expect(view?.partners).toEqual([{ spaceId: 'venue', spaceName: 'Space venue', stewardName: 'Sam Steward', status: 'invited', live: false, termsCurrent: false }])
  })

  it('invites only through a named current steward, and pins the current terms', async () => {
    tables.hunt_partners = []
    expect((await invitePartner('h1', 'stranger', { spaceSlug: 'venue', stewardHandle: 'steward' }, NOW)).ok).toBe(false)
    expect((await invitePartner('h1', 'organiser', { spaceSlug: 'venue', stewardHandle: 'editor' }, NOW)).ok).toBe(false)
    expect((await invitePartner('h1', 'organiser', { spaceSlug: 'nowhere', stewardHandle: 'steward' }, NOW)).ok).toBe(false)
    expect(tables.hunt_partners).toEqual([])
    expect(await invitePartner('h1', 'organiser', { spaceSlug: 'venue', stewardHandle: '@Steward' }, NOW)).toEqual({ ok: true })
    expect(partner()).toMatchObject({ status: 'invited', invitee_profile_id: 'steward', invited_by: 'organiser', permitted_roles: ['operator'] })
    expect(partner().terms_version).toMatch(/^[0-9a-f]{64}$/)
  })

  it('suspends a live partner, and only the Hunt owner can', async () => {
    await answer('accept', 'steward')
    expect((await revokePartner('h1', 'steward', 'venue', NOW)).ok).toBe(false)
    expect(partner().status).toBe('accepted')
    expect(await revokePartner('h1', 'organiser', 'venue', NOW)).toEqual({ ok: true })
    expect(partner()).toMatchObject({ status: 'suspended', revoked_at: NOW })
  })
})
