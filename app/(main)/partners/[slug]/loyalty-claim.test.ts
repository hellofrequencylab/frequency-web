// SCAN-841: a filled loyalty card is claimed once, even from two taps at the same moment.
//
// The behaviour itself is proved by pgTAP (supabase/tests/claim_loyalty_reward_atomic.test.sql),
// which runs against a real Postgres in CI. This vitest half pins the SHAPE that the pgTAP file
// and claimLoyaltyReward rely on, so a later edit cannot quietly weaken it:
//
//   * the RPC takes a per-(member, card) advisory xact lock before counting visits
//   * it re-checks visits since the last loyalty claim of THIS card, then inserts source=loyalty
//   * it is service_role only
//   * claimLoyaltyReward calls the RPC and never inserts partner_redemptions itself
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

const MIGRATION = 'supabase/migrations/20270346010100_claim_loyalty_reward_atomic.sql'
const PGTAP = 'supabase/tests/claim_loyalty_reward_atomic.test.sql'

const h = vi.hoisted(() => {
  const PROFILE = '00000000-0000-4000-a841-000000000001'
  const OFFER = '00000000-0000-4000-a841-0000000000c1'
  const PARTNER = '00000000-0000-4000-a841-0000000000aa'
  const state = {
    PROFILE,
    OFFER,
    PARTNER,
    offer: {
      id: OFFER,
      partner_id: PARTNER,
      active: true,
      valid_until: null as string | null,
      visits_required: 3,
      partners: { slug: 'scan841-cafe', status: 'active' },
    } as Record<string, unknown> | null,
    rpc: { data: '2026-10-19T15:00:00.000Z' as string | null, error: null as { message: string } | null },
    inserts: [] as unknown[],
    rpcCalls: [] as unknown[],
  }
  const admin = {
    from(table: string) {
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'insert', 'eq']) {
        c[m] = (...args: unknown[]) => {
          if (m === 'insert') state.inserts.push([table, ...args])
          return c
        }
      }
      c.maybeSingle = async () => ({ data: table === 'partner_offers' ? state.offer : null, error: null })
      c.single = async () => ({ data: null, error: { message: 'unexpected' } })
      return c
    },
    async rpc(fn: string, args: unknown) {
      state.rpcCalls.push([fn, args])
      return state.rpc
    },
  }
  return { state, admin }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: vi.fn() }))
vi.mock('@/lib/partners/read', () => ({ getMyLoyalty: vi.fn() }))

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { getMyLoyalty } from '@/lib/partners/read'
import { claimLoyaltyReward } from './loyalty-actions'

const PROFILE = h.state.PROFILE
const OFFER = h.state.OFFER
const PARTNER = h.state.PARTNER

describe('claim_loyalty_reward migration (20270346010100)', () => {
  const sql = readFileSync(MIGRATION, 'utf8')
  const code = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

  it('takes a per-(member, card) advisory xact lock before counting', () => {
    expect(code).toMatch(
      /pg_advisory_xact_lock\(\s*hashtextextended\(\s*_profile::text\s*\|\|\s*':'\s*\|\|\s*_offer::text/i,
    )
  })

  it('counts plaque taps at this partner after the last loyalty claim of this card', () => {
    expect(code).toMatch(/source\s*=\s*'loyalty'/)
    expect(code).toMatch(/source\s+is distinct from\s+'loyalty'/)
    expect(code).toMatch(/redeemed_at\s*>\s*v_last_claim/)
    expect(code).toMatch(/v_visits\s*<\s*v_required/)
  })

  it('inserts source=loyalty only after the re-check, and is not a browser RPC', () => {
    expect(code).toMatch(/insert into public\.partner_redemptions[\s\S]*source[\s\S]*'loyalty'/)
    expect(code).toMatch(
      /revoke execute on function public\.claim_loyalty_reward\(uuid, uuid\) from public, anon, authenticated/,
    )
  })

  it('is the last migration to mention claim_loyalty_reward, and pgTAP exercises the second claim', () => {
    const touching = readdirSync('supabase/migrations')
      .filter((f) => f.endsWith('.sql'))
      .filter((f) => /claim_loyalty_reward/.test(readFileSync(`supabase/migrations/${f}`, 'utf8')))
      .sort()
    expect(touching[touching.length - 1]).toBe('20270346010100_claim_loyalty_reward_atomic.sql')

    const tap = readFileSync(PGTAP, 'utf8')
    expect(tap).toMatch(/not_earned/)
    expect(tap).toMatch(/second claim/)
    expect(tap).toMatch(/has_function_privilege\('anon'/)
  })
})

describe('claimLoyaltyReward', () => {
  beforeEach(() => {
    h.state.offer = {
      id: OFFER,
      partner_id: PARTNER,
      active: true,
      valid_until: null,
      visits_required: 3,
      partners: { slug: 'scan841-cafe', status: 'active' },
    }
    h.state.rpc = { data: '2026-10-19T15:00:00.000Z', error: null }
    h.state.inserts = []
    h.state.rpcCalls = []
    vi.mocked(getMyProfileId).mockResolvedValue(PROFILE)
    vi.mocked(getMyLoyalty).mockResolvedValue(new Map([[OFFER, { visits: 3, required: 3, earned: true }]]))
    vi.mocked(revalidatePath).mockClear()
  })

  it('refuses a signed-out caller without touching the database', async () => {
    vi.mocked(getMyProfileId).mockResolvedValue(null as never)
    expect(await claimLoyaltyReward(OFFER)).toEqual({ error: 'Sign in to claim your reward.' })
    expect(h.state.rpcCalls).toEqual([])
    expect(h.state.inserts).toEqual([])
  })

  it('calls the RPC and never inserts partner_redemptions itself', async () => {
    expect(await claimLoyaltyReward(OFFER)).toEqual({ data: { claimedAt: '2026-10-19T15:00:00.000Z' } })
    expect(h.state.rpcCalls).toEqual([['claim_loyalty_reward', { _profile: PROFILE, _offer: OFFER }]])
    expect(h.state.inserts).toEqual([])
    expect(revalidatePath).toHaveBeenCalledWith('/partners/scan841-cafe')
  })

  it('maps a not_running RPC error to the live-card copy', async () => {
    h.state.rpc = { data: null, error: { message: 'not_running' } }
    expect(await claimLoyaltyReward(OFFER)).toEqual({ error: 'That loyalty card is not running right now.' })
    expect(h.state.inserts).toEqual([])
  })

  it('fails closed when the RPC is missing', async () => {
    h.state.rpc = { data: null, error: { message: 'Could not find the function' } }
    expect(await claimLoyaltyReward(OFFER)).toEqual({ error: 'Could not claim it. Please try again.' })
    expect(h.state.inserts).toEqual([])
  })
})
