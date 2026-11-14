import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  issueRedeemToken, mayRedeem, readRedeemToken, redeemGrant, redeemMessage, redeemRequestHash, stationView, voidGrant, voidRequestHash,
  type StationFacts,
} from './redemption'

const SECRET = 'test-secret-for-redemption'
const GRANT = '00000000-0000-4000-a022-0000000000c1'
const NOW = 1_800_000_000

describe('redeem token', () => {
  it('reads back the grant it was issued for', () => {
    const { token } = issueRedeemToken({ secret: SECRET, grantId: GRANT, now: NOW })
    expect(readRedeemToken(SECRET, token, NOW + 5)).toEqual({ ok: true, grantId: GRANT })
  })
  it('expires', () => {
    const { token, expiresAtEpoch } = issueRedeemToken({ secret: SECRET, grantId: GRANT, now: NOW, ttlSeconds: 60 })
    expect(expiresAtEpoch).toBe(NOW + 60)
    expect(readRedeemToken(SECRET, token, NOW + 60)).toEqual({ ok: false, reason: 'expired' })
  })
  it('refuses a token signed with another secret, a tampered body and junk', () => {
    const { token } = issueRedeemToken({ secret: 'other', grantId: GRANT, now: NOW })
    expect(readRedeemToken(SECRET, token, NOW)).toEqual({ ok: false, reason: 'bad_signature' })
    const good = issueRedeemToken({ secret: SECRET, grantId: GRANT, now: NOW }).token.split('.')
    const forged = Buffer.from(JSON.stringify({ g: 'someone-elses', iat: NOW, exp: NOW + 999 })).toString('base64url')
    expect(readRedeemToken(SECRET, `${good[0]}.${forged}.${good[2]}`, NOW)).toEqual({ ok: false, reason: 'bad_signature' })
    expect(readRedeemToken(SECRET, 'nope', NOW)).toEqual({ ok: false, reason: 'malformed' })
    expect(readRedeemToken(SECRET, 'g1.not-json.sig', NOW)).toEqual({ ok: false, reason: 'malformed' })
  })
})

const facts = (over: Partial<StationFacts> = {}): StationFacts => ({
  hunt: { id: 'h1', visibility: 'public', ownerProfileId: 'owner', ownerSpaceId: null },
  grants: [],
  partners: [{ huntId: 'h1', spaceId: 'venue', status: 'accepted', effectiveAt: '2026-01-01T00:00:00Z', revokedAt: null, permittedRoles: ['operator'] }],
  actor: { profileId: 'staff' },
  venueSpaceId: 'venue',
  staffVenueSpaceIds: ['venue'],
  ...over,
})

describe('who may redeem', () => {
  it('lets current staff of an accepted partner venue', () => {
    expect(mayRedeem(facts(), 'h1', NOW)).toBe(true)
  })
  it('lets a Hunt operator with no venue', () => {
    const f = facts({ partners: [], venueSpaceId: null, staffVenueSpaceIds: [], grants: [{ huntId: 'h1', profileId: 'staff', role: 'operator', expiresAt: null, revokedAt: null }] })
    expect(mayRedeem(f, 'h1', NOW)).toBe(true)
  })
  it('refuses a stranger, an editor, an ended partner and another Hunt', () => {
    expect(mayRedeem(facts({ staffVenueSpaceIds: [] }), 'h1', NOW)).toBe(false)
    expect(mayRedeem(facts({ partners: [], venueSpaceId: null, staffVenueSpaceIds: [], grants: [{ huntId: 'h1', profileId: 'staff', role: 'editor', expiresAt: null, revokedAt: null }] }), 'h1', NOW)).toBe(false)
    expect(mayRedeem(facts({ partners: [{ huntId: 'h1', spaceId: 'venue', status: 'accepted', effectiveAt: '2026-01-01T00:00:00Z', revokedAt: '2026-02-01T00:00:00Z', permittedRoles: ['operator'] }] }), 'h1', NOW)).toBe(false)
    expect(mayRedeem(facts(), 'other-hunt', NOW)).toBe(false)
  })
  it('refuses a signed-out caller', () => {
    expect(mayRedeem(facts({ actor: { profileId: null } }), 'h1', NOW)).toBe(false)
  })
})

describe('what the station shows', () => {
  const row = { id: GRANT, state: 'granted', expires_at: null, reward_title: 'A free tea', reward_kind: 'perk', trail_title: 'Harbour Trail' }
  it('shows issuer data only, never the player', () => {
    const view = stationView({ ...row, profile_id: 'player', display_name: 'Sam', email: 'sam@example.com' } as typeof row, NOW)
    expect(Object.keys(view).sort()).toEqual(['grantId', 'redeemable', 'rewardKind', 'rewardTitle', 'state', 'trailTitle'])
    expect(JSON.stringify(view)).not.toMatch(/Sam|sam@|player/)
  })
  it('is redeemable only while granted and unexpired', () => {
    expect(stationView(row, NOW).redeemable).toBe(true)
    expect(stationView({ ...row, state: 'redeemed' }, NOW).redeemable).toBe(false)
    expect(stationView({ ...row, state: 'revoked' }, NOW).redeemable).toBe(false)
    expect(stationView({ ...row, expires_at: new Date((NOW - 1) * 1000).toISOString() }, NOW)).toMatchObject({ state: 'expired', redeemable: false })
  })
})

describe('redeem and void', () => {
  it('sends a stable request hash and returns the narrowed answer', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { result: 'redeemed', replayed: true }, error: null })
    const out = await redeemGrant(rpc, { staffId: 's', grantId: GRANT, venueSpaceId: 'v', idempotencyKey: 'key-12345678' })
    expect(out).toEqual({ result: 'redeemed', replayed: true })
    expect(rpc).toHaveBeenCalledWith('hunt_reward_redeem', expect.objectContaining({
      p_staff: 's', p_grant_id: GRANT, p_venue_space_id: 'v', p_idempotency_key: 'key-12345678',
      p_request_hash: redeemRequestHash({ staffId: 's', grantId: GRANT, venueSpaceId: 'v' }),
    }))
  })
  it('hashes a different request differently', () => {
    expect(redeemRequestHash({ staffId: 's', grantId: GRANT, venueSpaceId: 'v' })).not.toBe(redeemRequestHash({ staffId: 's', grantId: GRANT, venueSpaceId: null }))
    expect(voidRequestHash({ actorId: 'a', grantId: GRANT, reason: ' mistake ' })).toBe(voidRequestHash({ actorId: 'a', grantId: GRANT, reason: 'mistake' }))
  })
  it('throws on an answer it does not know and on an RPC error', async () => {
    await expect(redeemGrant(vi.fn().mockResolvedValue({ data: { result: 'mystery' }, error: null }), { staffId: 's', grantId: GRANT, venueSpaceId: null, idempotencyKey: 'key-12345678' })).rejects.toThrow(/does not know/)
    await expect(voidGrant(vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }), { actorId: 'a', grantId: GRANT, reason: 'mistake', idempotencyKey: 'key-12345678' })).rejects.toThrow(/boom/)
  })
  it('has words for every answer and tells staff not to hand over a used or cancelled one', () => {
    expect(redeemMessage('already_redeemed')).toMatch(/Do not hand over/)
    expect(redeemMessage('revoked')).toMatch(/cancelled/)
    expect(redeemMessage('grant_not_found')).toMatch(/could not find/)
  })
})

describe('the migration', () => {
  const sql = readFileSync(join('supabase', 'migrations', '20270346046000_hunt_reward_redeem.sql'), 'utf8')
  it('locks the grant row, so two terminals cannot both redeem', () => {
    expect(sql).toMatch(/from public\.hunt_reward_grants where id = p_grant_id for update/)
  })
  it('keeps both functions service role only', () => {
    expect(sql).toMatch(/revoke all on function public\.hunt_reward_redeem\(uuid, uuid, uuid, text, text\) from public, anon, authenticated/)
    expect(sql).toMatch(/revoke all on function public\.hunt_reward_void\(uuid, uuid, text, text, text\) from public, anon, authenticated/)
  })
})
