// FH-020S: the door route's decisions and the review wrappers, against a fake database that keeps the
// same rules as the migration (a nonce spends once; a held claim resumes once). The real transaction is
// proved under pgTAP by supabase/tests/hunt_staff_review.test.sql; the migration source guard below
// keeps the pieces that carry the guarantee from being edited out.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appealClaim, reviewClaim, reviewRequestHash, spendNonce, verifyAtDoor, type StaffFacts } from './staff-review'
import { issueChallenge } from './staff-proof'

const secret = 'test-secret'
const NOW = 1_800_000_000
const scope = { huntId: 'hunt-1', placementId: 'pl-1', venueSpaceId: 'space-a', runId: 'run-1' }
const token = (over: Partial<typeof scope> = {}, now = NOW) => issueChallenge({ secret, scope: { ...scope, ...over }, now })

const facts = (over: Partial<StaffFacts> = {}): StaffFacts => ({
  hunt: { id: 'hunt-1', visibility: 'public', ownerProfileId: 'owner-1', ownerSpaceId: null },
  grants: [],
  partners: [{ huntId: 'hunt-1', spaceId: 'space-a', status: 'accepted', effectiveAt: '2026-01-01T00:00:00Z', revokedAt: null, permittedRoles: ['operator'] }],
  actor: { profileId: 'staff-1' },
  staffVenueSpaceIds: ['space-a'],
  placementActive: true,
  runSubjectId: 'player-1',
  ...over,
})

/** A fake of the two functions the door calls. */
function fakeDb() {
  const nonces = new Set<string>()
  const claims: Record<string, unknown>[] = []
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'hunt_staff_nonce_consume') {
      const n = args.p_nonce as string
      if (nonces.has(n)) return { data: false, error: null }
      nonces.add(n)
      return { data: true, error: null }
    }
    if (fn === 'hunt_claim_apply') {
      claims.push(args)
      return { data: { result: 'credited', claim_id: 'claim-1' }, error: null }
    }
    return { data: null, error: { message: `unexpected ${fn}` } }
  }
  return { rpc, nonces, claims }
}

const run = (db: ReturnType<typeof fakeDb>, f: StaffFacts | null, tok: string, over: Partial<typeof scope> = {}) =>
  verifyAtDoor({ secret, rpc: db.rpc, loadFacts: async () => f }, { staffId: 'staff-1', token: tok, scope: { ...scope, ...over }, missionKey: 'm1', nowEpoch: NOW + 5 })

describe('verifyAtDoor', () => {
  it('credits the player at assurance staff and keys the claim to the nonce', async () => {
    const db = fakeDb()
    const out = await run(db, facts(), token())
    expect(out).toMatchObject({ ok: true, claimId: 'claim-1' })
    expect(db.claims).toHaveLength(1)
    expect(db.claims[0]).toMatchObject({ p_actor: 'player-1', p_assurance: 'staff', p_run_id: 'run-1', p_mission_key: 'm1' })
    expect(String(db.claims[0].p_idempotency_key)).toMatch(/^staff-/)
  })

  it('refuses staff of another Space, and writes nothing', async () => {
    const db = fakeDb()
    const out = await run(db, facts({ staffVenueSpaceIds: ['space-b'], partners: [] }), token())
    expect(out).toEqual({ ok: false, reason: 'forbidden' })
    expect(db.nonces.size).toBe(0)
    expect(db.claims).toHaveLength(0)
  })

  it('refuses a replay: the second presentation of one challenge credits nothing more', async () => {
    const db = fakeDb()
    const tok = token()
    expect((await run(db, facts(), tok)).ok).toBe(true)
    expect(await run(db, facts(), tok)).toEqual({ ok: false, reason: 'replay' })
    expect(db.claims).toHaveLength(1)
  })

  it('refuses an expired proof without spending the nonce', async () => {
    const db = fakeDb()
    const out = await run(db, facts(), token({}, NOW - 1000))
    expect(out).toEqual({ ok: false, reason: 'expired' })
    expect(db.nonces.size).toBe(0)
  })

  it('refuses a paused placement without spending the nonce, so the retry works once it resumes', async () => {
    const db = fakeDb()
    const tok = token()
    expect(await run(db, facts({ placementActive: false }), tok)).toEqual({ ok: false, reason: 'placement_paused' })
    expect(db.nonces.size).toBe(0)
    expect((await run(db, facts(), tok)).ok).toBe(true)
  })

  it('refuses a token for another run or venue, and a signed-out or unknown run', async () => {
    const db = fakeDb()
    expect(await run(db, facts(), token({ runId: 'run-2' }))).toEqual({ ok: false, reason: 'wrong_scope' })
    expect(await run(db, null, token())).toEqual({ ok: false, reason: 'not_found' })
    expect(await run(db, facts({ runSubjectId: null }), token())).toEqual({ ok: false, reason: 'not_found' })
  })

  it('refuses an actor the role matrix does not allow, before it reads the token', async () => {
    const db = fakeDb()
    const out = await run(db, facts({ actor: { profileId: null }, staffVenueSpaceIds: [] }), 'garbage')
    expect(out).toEqual({ ok: false, reason: 'forbidden' })
  })
})

describe('spendNonce', () => {
  it('passes the scope and an ISO expiry, and throws on a database error', async () => {
    let seen: Record<string, unknown> = {}
    const ok = await spendNonce(async (_f, a) => { seen = a; return { data: true, error: null } }, { nonce: 'n-0000001', scope, staffId: 's', expiresAtEpoch: 1_800_000_120 })
    expect(ok).toBe(true)
    expect(seen.p_expires_at).toBe(new Date(1_800_000_120 * 1000).toISOString())
    await expect(spendNonce(async () => ({ data: null, error: { message: 'boom' } }), { nonce: 'n-0000001', scope, staffId: 's', expiresAtEpoch: 1 })).rejects.toThrow('boom')
  })
})

describe('reviewClaim', () => {
  const base = { claimId: 'c1', reviewerId: 'r1', decision: 'approve' as const, reason: 'Saw them', idempotencyKey: 'key-0000001' }

  it('hashes the payload but not the key, and trims the reason', () => {
    const h = reviewRequestHash(base)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(reviewRequestHash({ ...base, reason: ' Saw them ' })).toBe(h)
    expect(reviewRequestHash({ ...base, decision: 'reject' })).not.toBe(h)
  })

  it('resumes a held claim once: the first approval credits, the second is already decided', async () => {
    let state = 'needs_review'
    const rpc = async () => {
      if (state === 'needs_review') { state = 'accepted'; return { data: { result: 'credited' }, error: null } }
      return { data: { result: 'already_decided' }, error: null }
    }
    expect((await reviewClaim(rpc, base)).result).toBe('credited')
    expect((await reviewClaim(rpc, { ...base, idempotencyKey: 'key-0000002' })).result).toBe('already_decided')
  })

  it('throws on a database error and on an answer it does not know', async () => {
    await expect(reviewClaim(async () => ({ data: null, error: { message: 'boom' } }), base)).rejects.toThrow('boom')
    await expect(reviewClaim(async () => ({ data: { result: 'maybe' }, error: null }), base)).rejects.toThrow('does not know')
  })
})

describe('appealClaim', () => {
  it('narrows the answer', async () => {
    expect(await appealClaim(async () => ({ data: { result: 'opened' }, error: null }), { claimId: 'c', actorId: 'a', reason: 'I was there' })).toBe('opened')
    await expect(appealClaim(async () => ({ data: { result: '?' }, error: null }), { claimId: 'c', actorId: 'a', reason: 'x' })).rejects.toThrow('does not know')
  })
})

describe('the migration', () => {
  const code = readFileSync(join('supabase', 'migrations', '20270346038000_hunt_staff_review.sql'), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')

  it('spends a nonce with a unique insert', () => {
    expect(code).toContain('nonce text primary key')
    expect(code).toContain('on conflict (nonce) do nothing')
  })
  it('locks the claim and the run before it decides, and keeps the decision once', () => {
    expect(code).toContain('select * into c from public.hunt_claims where id = p_claim_id for update')
    expect(code).toContain('select * into run from public.hunt_runs where id = c.run_id for update')
    expect(code).toContain("'already_decided'")
    expect(code).toContain("'claim_override'")
  })
  it('limits every function and the table to the service role', () => {
    expect(code).toContain('alter table public.hunt_staff_nonces enable row level security')
    for (const fn of ['hunt_staff_nonce_consume', 'hunt_claim_review', 'hunt_claim_appeal']) {
      expect(code).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`))
      expect(code).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`))
    }
  })
})
