// FH-029: the partner invite rules. A forwarded invite confers nothing, acceptance pins approved terms,
// withdrawal ends the partner at once, and publish refuses a venue with no live partner row. The claim
// side of the live check is SQL and is proved under pgTAP by supabase/tests/hunt_partner_state.test.sql.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyClaim } from './apply-claim'
import {
  decideInvite,
  decideSteward,
  PARTNER_DEFAULT_ROLES,
  PARTNER_TERMS,
  partnerLive,
  partnerTermsHash,
  publishVenueBlocks,
  revokeTarget,
  stewardRefusalMessage,
  type PartnerInvite,
} from './partners'

const NOW = '2026-11-16T12:00:00Z'
const TERMS = { hash: 'terms-v1', approved: true }
const invite = (over: Partial<PartnerInvite> = {}): PartnerInvite => ({
  huntId: 'h1',
  spaceId: 'venue',
  status: 'invited',
  effectiveAt: null,
  revokedAt: null,
  permittedRoles: ['operator'],
  inviteeProfileId: 'steward',
  termsVersion: 'terms-v1',
  ...over,
})
const accepted = (over: Partial<PartnerInvite> = {}) => invite({ status: 'accepted', effectiveAt: '2026-11-01T00:00:00Z', ...over })
const act = (action: 'accept' | 'decline' | 'withdraw', over: Partial<Parameters<typeof decideSteward>[1]> = {}) =>
  decideSteward(action, { invite: invite(), actorId: 'steward', actorIsStewardNow: true, terms: TERMS, now: NOW, ...over })

describe('the pinned terms', () => {
  const text = readFileSync(join(process.cwd(), 'docs/hunts/PARTNER-AGREEMENT.md'), 'utf8')

  it('pins the exact agreement text: change the doc and PARTNER_TERMS.hash must change in the same commit', () => {
    expect(PARTNER_TERMS.hash).toBe(partnerTermsHash(text))
  })

  it('reads as approved only when the agreement carries the owner approval (FH-028S)', () => {
    expect(PARTNER_TERMS.approved).toBe(/APPROVED BY OWNER/.test(text))
  })
})

describe('a forwarded invite confers no rights', () => {
  it('lets the named steward accept', () => {
    expect(act('accept')).toEqual({ ok: true, from: 'invited', to: 'accepted' })
  })

  it('refuses anyone else who opens the link, even another steward of the same Space', () => {
    expect(act('accept', { actorId: 'someone-else' })).toEqual({ ok: false, reason: 'not_invitee' })
    expect(act('decline', { actorId: 'someone-else' })).toEqual({ ok: false, reason: 'not_invitee' })
  })

  it('refuses the named person once they are no longer a steward of that Space', () => {
    expect(act('accept', { actorIsStewardNow: false })).toEqual({ ok: false, reason: 'not_steward_now' })
  })

  it('refuses an invite that names nobody', () => {
    expect(act('accept', { invite: invite({ inviteeProfileId: null }) })).toEqual({ ok: false, reason: 'not_invitee' })
  })

  it('has nothing to accept when there is no open invite', () => {
    expect(act('accept', { invite: null })).toEqual({ ok: false, reason: 'no_invite' })
    for (const status of ['declined', 'expired', 'withdrawn', 'suspended', 'accepted'] as const) {
      expect(act('accept', { invite: invite({ status }) })).toEqual({ ok: false, reason: 'no_invite' })
    }
  })

  it('tells a forwarded reader the same thing as a missing invite', () => {
    expect(stewardRefusalMessage('not_invitee')).toBe(stewardRefusalMessage('no_invite'))
  })
})

describe('acceptance pins the terms', () => {
  it('refuses while the terms are not owner approved', () => {
    expect(act('accept', { terms: { hash: 'terms-v1', approved: false } })).toEqual({ ok: false, reason: 'terms_not_approved' })
  })

  it('refuses when the terms changed after the invite was sent', () => {
    expect(act('accept', { terms: { hash: 'terms-v2', approved: true } })).toEqual({ ok: false, reason: 'terms_changed' })
    expect(act('accept', { invite: invite({ termsVersion: null }) })).toEqual({ ok: false, reason: 'terms_changed' })
  })

  it('still lets the named steward decline whatever the terms say', () => {
    expect(act('decline', { terms: { hash: 'terms-v2', approved: false } })).toEqual({ ok: true, from: 'invited', to: 'declined' })
  })

  it('cannot be accepted today, because the real terms are not approved yet', () => {
    if (PARTNER_TERMS.approved) return
    expect(act('accept', { invite: invite({ termsVersion: PARTNER_TERMS.hash }), terms: PARTNER_TERMS })).toEqual({ ok: false, reason: 'terms_not_approved' })
  })
})

describe('withdrawal', () => {
  it('lets any current steward of the Space withdraw a live partner', () => {
    expect(act('withdraw', { invite: accepted(), actorId: 'another-steward' })).toEqual({ ok: true, from: 'accepted', to: 'withdrawn' })
  })

  it('refuses a person who is not a steward now', () => {
    expect(act('withdraw', { invite: accepted(), actorIsStewardNow: false })).toEqual({ ok: false, reason: 'not_steward_now' })
  })

  it('has nothing to withdraw unless the partner is live', () => {
    expect(act('withdraw')).toEqual({ ok: false, reason: 'not_a_partner' })
    expect(act('withdraw', { invite: accepted({ status: 'withdrawn', revokedAt: NOW }) })).toEqual({ ok: false, reason: 'not_a_partner' })
  })
})

describe('partnerLive', () => {
  it('is true only for an accepted, effective, unrevoked row', () => {
    expect(partnerLive(accepted(), NOW)).toBe(true)
    expect(partnerLive(invite(), NOW)).toBe(false)
    expect(partnerLive(accepted({ effectiveAt: null }), NOW)).toBe(false)
    expect(partnerLive(accepted({ effectiveAt: '2026-12-01T00:00:00Z' }), NOW)).toBe(false)
    expect(partnerLive(accepted({ revokedAt: '2026-11-16T11:59:00Z' }), NOW)).toBe(false)
    expect(partnerLive(accepted({ status: 'withdrawn' }), NOW)).toBe(false)
    expect(partnerLive(accepted({ status: 'suspended' }), NOW)).toBe(false)
  })
})

describe('the organiser side', () => {
  const base = { current: null, ownerSpaceId: 'home', spaceId: 'venue', inviteeIsStewardNow: true, now: NOW }

  it('invites a Space through a named current steward', () => {
    expect(decideInvite(base)).toEqual({ ok: true })
    expect(decideInvite({ ...base, current: invite({ status: 'withdrawn' }) })).toEqual({ ok: true })
  })

  it('refuses a named person who is not a steward, the Hunt’s own Space, and a live partner', () => {
    expect(decideInvite({ ...base, inviteeIsStewardNow: false })).toEqual({ ok: false, reason: 'not_a_steward' })
    expect(decideInvite({ ...base, spaceId: 'home' })).toEqual({ ok: false, reason: 'own_space' })
    expect(decideInvite({ ...base, current: accepted() })).toEqual({ ok: false, reason: 'already_partner' })
  })

  it('suspends a live partner, expires an open invite, and leaves the rest alone', () => {
    expect(revokeTarget(accepted())).toEqual({ from: 'accepted', to: 'suspended' })
    expect(revokeTarget(invite())).toEqual({ from: 'invited', to: 'expired' })
    expect(revokeTarget(invite({ status: 'withdrawn' }))).toBeNull()
    expect(revokeTarget(null)).toBeNull()
  })

  it('grants a venue the operator lane only', () => {
    expect([...PARTNER_DEFAULT_ROLES]).toEqual(['operator'])
  })
})

describe('publish reads live partner state', () => {
  const at = (venueSpaceIds: (string | null)[], partners: PartnerInvite[]) =>
    publishVenueBlocks({ huntId: 'h1', ownerSpaceId: 'home', venueSpaceIds, partners, now: NOW })

  it('passes stops with no venue, at the Hunt’s own Space, and at a live partner', () => {
    expect(at([null, 'home', 'venue', 'venue'], [accepted()])).toEqual([])
  })

  it('blocks a venue that has not accepted, has withdrawn, or was never invited', () => {
    expect(at(['venue'], [invite()])).toEqual(['venue'])
    expect(at(['venue'], [accepted({ status: 'withdrawn', revokedAt: '2026-11-16T11:00:00Z' })])).toEqual(['venue'])
    expect(at(['venue', 'stranger'], [accepted()])).toEqual(['stranger'])
  })

  it('does not count another Hunt’s partner row', () => {
    expect(at(['venue'], [accepted({ huntId: 'h2' })])).toEqual(['venue'])
  })
})

describe('the claim side lives in the database', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20270346075000_hunt_partner_state.sql'), 'utf8')

  it('checks the partner row inside hunt_claim_apply and keeps the nine-argument, service-role-only shape', () => {
    expect(sql).toContain("return jsonb_build_object('result', 'venue_not_active')")
    expect(sql).toContain('join public.hunt_partners hp on hp.hunt_id = mp.hunt_id and hp.space_id = mp.venue_space_id')
    expect(sql).toContain('revoke all on function public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer) from public, anon, authenticated')
    // The refusal sits before any write: the first insert comes after it.
    expect(sql.indexOf("'venue_not_active'")).toBeLessThan(sql.indexOf('insert into public.hunt_claims'))
    // A replayed command answers before the partner check, so earlier credit still reads as credited.
    expect(sql.indexOf("jsonb_build_object('replayed', true)")).toBeLessThan(sql.indexOf("'venue_not_active'"))
  })

  it('is an answer the application knows', async () => {
    const out = await applyClaim(async () => ({ data: { result: 'venue_not_active' }, error: null }), {
      actorId: 'a', runId: 'r', missionKey: 'm', placementId: 'p', evidenceId: 'e', assurance: 'signed_node', idempotencyKey: 'key-0000001',
    })
    expect(out.result).toBe('venue_not_active')
  })
})
