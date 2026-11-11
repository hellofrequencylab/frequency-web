// FH-021: the spec rules, the eligibility rule the database mirrors, the answer narrowing, and a source
// guard on the migration so a later edit cannot drop the reward-row lock, the stock constraint or the
// browser-role revoke. The race itself is proved by supabase/tests/hunt_rewards.test.sql and, with two
// live sessions, by hand against Postgres (the second claimant waits on the lock and answers sold_out).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_STOCK_TERMS, eligibilityJson, grantMessage, grantRequestHash, grantReward, isEligible, parseRewardSpec, stockLeft } from './rewards'

describe('parseRewardSpec', () => {
  it('accepts a minimal spec and fills the defaults', () => {
    const out = parseRewardSpec({ key: 'free-cookie', title: ' Free cookie ' })
    expect(out).toEqual({
      ok: true,
      spec: { key: 'free-cookie', title: 'Free cookie', kind: 'perk', eligibility: { runState: 'completed' }, stock: null, perPlayerLimit: 1, stockTerms: DEFAULT_STOCK_TERMS },
    })
  })
  it('sorts and dedupes named stops, and refuses an empty or malformed list', () => {
    const out = parseRewardSpec({ key: 'k', title: 't', eligibility: { missions: ['stop-2', 'stop-1', 'stop-2'] } })
    expect(out.ok && out.spec.eligibility).toEqual({ missions: ['stop-1', 'stop-2'] })
    expect(parseRewardSpec({ key: 'k', title: 't', eligibility: { missions: [] } }).ok).toBe(false)
    expect(parseRewardSpec({ key: 'k', title: 't', eligibility: { missions: ['Bad Key'] } }).ok).toBe(false)
  })
  it('refuses a bad key, title, stock, limit or terms', () => {
    expect(parseRewardSpec({ key: 'Bad Key', title: 't' }).ok).toBe(false)
    expect(parseRewardSpec({ key: 'k', title: '  ' }).ok).toBe(false)
    expect(parseRewardSpec({ key: 'k', title: 't', stock: -1 }).ok).toBe(false)
    expect(parseRewardSpec({ key: 'k', title: 't', stock: 1.5 }).ok).toBe(false)
    expect(parseRewardSpec({ key: 'k', title: 't', perPlayerLimit: 0 }).ok).toBe(false)
    expect(parseRewardSpec({ key: 'k', title: 't', stockTerms: 'x'.repeat(281) }).ok).toBe(false)
  })
  it('keeps a zero stock (sold out from the start) distinct from no limit', () => {
    const out = parseRewardSpec({ key: 'k', title: 't', stock: 0 })
    expect(out.ok && out.spec.stock).toBe(0)
  })
})

describe('eligibility and stock', () => {
  it('maps to the stored json and answers like the database', () => {
    expect(eligibilityJson({ runState: 'completed' })).toEqual({ run_state: 'completed' })
    expect(eligibilityJson({ missions: ['a'] })).toEqual({ missions: ['a'] })
    expect(isEligible({ runState: 'completed' }, { state: 'completed', creditedMissions: [] })).toBe(true)
    expect(isEligible({ runState: 'completed' }, { state: 'active', creditedMissions: ['a'] })).toBe(false)
    expect(isEligible({ missions: ['a', 'b'] }, { state: 'active', creditedMissions: ['a'] })).toBe(false)
    expect(isEligible({ missions: ['a'] }, { state: 'active', creditedMissions: ['a', 'z'] })).toBe(true)
  })
  it('counts stock left, never below zero', () => {
    expect(stockLeft({ stock: null }, 5)).toBeNull()
    expect(stockLeft({ stock: 3 }, 1)).toBe(2)
    expect(stockLeft({ stock: 1 }, 4)).toBe(0)
  })
})

describe('grantReward', () => {
  const input = { actorId: 'a', runId: 'r', rewardKey: 'k', idempotencyKey: 'key-0000001' }
  it('passes the hash and narrows the answer, including the published terms', async () => {
    let seen: Record<string, unknown> = {}
    const out = await grantReward(async (_f, a) => { seen = a; return { data: { result: 'sold_out', terms: 'All claimed.' }, error: null } }, input)
    expect(out).toEqual({ result: 'sold_out', grantId: undefined, terms: 'All claimed.', replayed: false })
    expect(seen.p_request_hash).toBe(grantRequestHash(input))
    expect(grantRequestHash({ ...input, rewardKey: 'z' })).not.toBe(grantRequestHash(input))
  })
  it('throws on a database error and on an answer it does not know', async () => {
    await expect(grantReward(async () => ({ data: null, error: { message: 'boom' } }), input)).rejects.toThrow('boom')
    await expect(grantReward(async () => ({ data: { result: 'maybe' }, error: null }), input)).rejects.toThrow('does not know')
  })
  it('shows the reward\'s own stock terms to the loser', () => {
    expect(grantMessage({ result: 'sold_out', terms: 'All claimed. Your finish still counts.' })).toBe('All claimed. Your finish still counts.')
    expect(grantMessage({ result: 'sold_out' })).toBe(DEFAULT_STOCK_TERMS)
  })
})

describe('the migration', () => {
  const code = readFileSync(join('supabase', 'migrations', '20270346042000_hunt_rewards.sql'), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
  it('serialises on the reward row and keeps the count inside the stock', () => {
    expect(code).toContain('for update')
    expect(code).toContain('check (stock is null or granted_count <= stock)')
    expect(code).toContain("'sold_out'")
  })
  it('writes the outbox row and the idempotency record, and limits everything to the service role', () => {
    expect(code).toContain('insert into public.hunt_outbox')
    expect(code).toContain('insert into public.hunt_command_keys')
    expect(code).toContain('alter table public.hunt_rewards enable row level security')
    expect(code).toContain('alter table public.hunt_reward_grants enable row level security')
    expect(code).toMatch(/revoke all on function public\.hunt_reward_grant\([^)]*\) from public, anon, authenticated/)
    expect(code).toMatch(/grant execute on function public\.hunt_reward_grant\([^)]*\) to service_role/)
  })
})
