import { describe, expect, it } from 'vitest'
import { canRespondToPartnerInvite, collectiveListings, COLLECTIVE_PARTNER_CAP, partnerHandle, partnerInviteRefusal, partnerSlotsLeft, partnershipLive, spacePlanTab, type PartnershipRow, type PartnerSpaceFacts } from './partners'

const hub: PartnerSpaceFacts = { id: 'hub', owner_profile_id: 'hub-owner', plan: 'collective', status: 'active', visibility: 'network', parent_id: null, type: 'business' }
const partner: PartnerSpaceFacts = { id: 'p1', owner_profile_id: 'other', plan: 'free', status: 'active', visibility: 'network', parent_id: null, type: 'business' }
const row = (over: Partial<PartnershipRow> = {}): PartnershipRow => ({ id: 'r', hub_space_id: 'hub', partner_space_id: 'p1', status: 'accepted', invited_by: 'hub-owner', responded_by: 'other', ...over })

describe('spacePlanTab', () => {
  it('renders exactly one tab, decided by the plan', () => {
    const base = { status: 'active', ownerProfileId: 'o', networkConnected: true, type: 'business' }
    expect(spacePlanTab({ ...base, plan: 'collective' })).toBe('partners')
    expect(spacePlanTab({ ...base, plan: 'nonprofit_collective' })).toBe('partners')
    expect(spacePlanTab({ ...base, plan: 'network' })).toBe('network')
    expect(spacePlanTab({ ...base, plan: 'network', networkConnected: false })).toBeNull()
    for (const change of [{ plan: 'business' }, { plan: 'collective', status: 'suspended' }, { plan: 'collective', ownerProfileId: null }, { plan: 'collective', type: 'root' }]) {
      expect(spacePlanTab({ ...base, ...change })).toBeNull()
    }
  })
})

describe('partner invites', () => {
  it('lets the hub owner invite a Space owned by someone else', () => {
    expect(partnerInviteRefusal(hub, partner, 'hub-owner', [])).toBeNull()
  })
  it('applies the ownership test: your own Space is not a partner', () => {
    expect(partnerInviteRefusal(hub, { ...partner, owner_profile_id: 'hub-owner' }, 'hub-owner', [])).toMatch(/yours/)
  })
  it('refuses strangers, non-Collective hubs, private or inactive partners and duplicates', () => {
    expect(partnerInviteRefusal(hub, partner, 'stranger', [])).toBe('Not allowed.')
    expect(partnerInviteRefusal(hub, partner, null, [])).toBe('Not allowed.')
    expect(partnerInviteRefusal({ ...hub, plan: 'network' }, partner, 'hub-owner', [])).toMatch(/Collective/)
    expect(partnerInviteRefusal({ ...hub, parent_id: 'x' }, partner, 'hub-owner', [])).toMatch(/Collective/)
    expect(partnerInviteRefusal(hub, { ...partner, visibility: 'private' }, 'hub-owner', [])).toMatch(/visible/)
    expect(partnerInviteRefusal(hub, { ...partner, status: 'suspended' }, 'hub-owner', [])).toMatch(/visible/)
    expect(partnerInviteRefusal(hub, hub, 'hub-owner', [])).toMatch(/visible|yours/)
    expect(partnerInviteRefusal(hub, partner, 'hub-owner', [row({ status: 'pending' })])).toMatch(/already/)
  })
  it(`caps a hub at ${COLLECTIVE_PARTNER_CAP} partners, counting pending invites`, () => {
    const full = Array.from({ length: COLLECTIVE_PARTNER_CAP }, (_, i) => row({ id: String(i), partner_space_id: `x${i}`, status: i % 2 ? 'pending' : 'accepted' }))
    expect(partnerSlotsLeft(full)).toBe(0)
    expect(partnerInviteRefusal(hub, partner, 'hub-owner', full)).toMatch(/up to 10/)
    const freed = full.map((r, i) => i === 0 ? { ...r, status: 'revoked' } : r)
    expect(partnerSlotsLeft(freed)).toBe(1)
    expect(partnerInviteRefusal(hub, partner, 'hub-owner', freed)).toBeNull()
  })
  it('only the partner owner answers; either side can withdraw or leave', () => {
    expect(canRespondToPartnerInvite('pending', 'partner', 'accepted')).toBe(true)
    expect(canRespondToPartnerInvite('pending', 'hub', 'accepted')).toBe(false)
    expect(canRespondToPartnerInvite('pending', 'partner', 'declined')).toBe(true)
    expect(canRespondToPartnerInvite('accepted', 'partner', 'accepted')).toBe(false)
    expect(canRespondToPartnerInvite('accepted', 'hub', 'revoked')).toBe(true)
    expect(canRespondToPartnerInvite('pending', 'hub', 'revoked')).toBe(true)
    expect(canRespondToPartnerInvite('declined', 'partner', 'revoked')).toBe(false)
  })
  it('reads a handle from a bare slug, an @handle or a pasted link', () => {
    expect(partnerHandle('their-space')).toBe('their-space')
    expect(partnerHandle('@Their-Space')).toBe('their-space')
    expect(partnerHandle('https://frequency.example/spaces/their-space/calendar?x=1')).toBe('their-space')
    expect(partnerHandle('not a handle')).toBeNull()
    expect(partnerHandle('')).toBeNull()
  })
})

describe('partnershipLive', () => {
  it('holds only while consent matches the current owners and both Spaces stand', () => {
    expect(partnershipLive(row(), hub, partner)).toBe(true)
    expect(partnershipLive(row({ status: 'pending' }), hub, partner)).toBe(false)
    expect(partnershipLive(row(), { ...hub, owner_profile_id: 'new-owner' }, partner)).toBe(false)
    expect(partnershipLive(row(), hub, { ...partner, owner_profile_id: 'new-owner' })).toBe(false)
    expect(partnershipLive(row(), { ...hub, plan: 'business' }, partner)).toBe(false)
    expect(partnershipLive(row(), hub, { ...partner, visibility: 'private' })).toBe(false)
    expect(partnershipLive(row(), hub, undefined)).toBe(false)
  })
})

describe('collectiveListings', () => {
  const members = new Set(['hub', 'p1', 'p2'])
  it('keeps listings whose two ends are both in the Collective, deduped and sorted', () => {
    const out = collectiveListings([
      { target: 'hub', kind: 'circle', subject: { id: 'c1', slug: 'c1', name: 'Zen', space_id: 'p1' } },
      { target: 'hub', kind: 'circle', subject: { id: 'c1', slug: 'c1', name: 'Zen', space_id: 'p1' } },
      { target: 'p2', kind: 'journey', subject: { id: 'j1', slug: 'j1', title: 'Arc', space_id: 'p1' } },
      { target: 'hub', kind: 'circle', subject: { id: 'c2', slug: 'c2', name: 'Stranger', space_id: 'outside' } },
      { target: 'outside', kind: 'circle', subject: { id: 'c3', slug: 'c3', name: 'Away', space_id: 'p1' } },
      { target: 'hub', kind: 'circle', subject: { id: 'c4', slug: 'c4', name: 'Self', space_id: 'hub' } },
    ], members)
    expect(out.map(l => `${l.kind}:${l.id}->${l.targetSpaceId}`)).toEqual(['journey:j1->p2', 'circle:c1->hub'])
  })
})
