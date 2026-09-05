import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// scan2 R3 (2026-09-05): awardCreationToken treated ANY reward_grants insert error as "already granted"
// and returned 0 — a timeout / RLS / network blip silently forfeited the creator's token with no log.
// Only a duplicate key (23505) means a prior grant; anything else must be logged at error level and
// must NOT touch the Gem ledger (nothing was claimed, so a later publish can re-pay).

type Row = Record<string, unknown>
const store: Record<string, Row[]> = { reward_grants: [] }
let claimError: { code: string; message: string } | null = null
const gemAwards: { profileId: string; amount: number }[] = []
const errors: string[] = []

function from(table: string) {
  if (!store[table]) store[table] = []
  let op: 'select' | 'insert' | 'delete' = 'select'
  let payload: Row | null = null
  let counting = false
  const preds: Array<(r: Row) => boolean> = []
  const api: Record<string, unknown> = {
    select: (_c?: string, opts?: { count?: string }) => {
      counting = !!opts?.count
      return api
    },
    insert: (p: Row) => {
      op = 'insert'
      payload = p
      return api
    },
    delete: () => {
      op = 'delete'
      return api
    },
    eq: (c: string, v: unknown) => {
      preds.push((r) => r[c] === v)
      return api
    },
    like: (c: string, pattern: string) => {
      const prefix = pattern.replace(/%$/, '')
      preds.push((r) => String(r[c]).startsWith(prefix))
      return api
    },
    gte: () => api,
    then(resolve: (v: unknown) => unknown) {
      const matched = store[table].filter((r) => preds.every((p) => p(r)))
      if (op === 'insert') {
        if (table === 'reward_grants' && claimError) return Promise.resolve({ data: null, error: claimError }).then(resolve)
        store[table].push({ ...payload })
        return Promise.resolve({ data: null, error: null }).then(resolve)
      }
      if (op === 'delete') {
        store[table] = store[table].filter((r) => !preds.every((p) => p(r)))
        return Promise.resolve({ data: null, error: null }).then(resolve)
      }
      return Promise.resolve(counting ? { count: matched.length, error: null } : { data: matched, error: null }).then(resolve)
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => from(t) }) }))
vi.mock('@/lib/zaps', () => ({ awardZaps: async () => ({ awarded: true, amount: 0 }) }))
vi.mock('@/lib/gems', () => ({
  awardGems: async (profileId: string, _action: string, amount: number) => {
    gemAwards.push({ profileId, amount })
    return { awarded: true, amount }
  },
}))

import { awardCreationToken } from './creation'

beforeEach(() => {
  store.reward_grants = []
  claimError = null
  gemAwards.length = 0
  errors.length = 0
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map((x) => (typeof x === 'object' && x !== null ? JSON.stringify(x) : String(x))).join(' '))
  })
})
afterEach(() => vi.restoreAllMocks())

describe('awardCreationToken — claim error handling (scan2 R3)', () => {
  it('pays the token on a fresh claim', async () => {
    const paid = await awardCreationToken('creator-1', 'event', 'event-1')
    expect(paid).toBe(5)
    expect(gemAwards).toEqual([{ profileId: 'creator-1', amount: 5 }])
    expect(store.reward_grants).toHaveLength(1)
  })

  it('a duplicate-key claim (23505) is "already granted": returns 0 silently and pays nothing (unchanged)', async () => {
    claimError = { code: '23505', message: 'duplicate key value violates unique constraint' }
    const paid = await awardCreationToken('creator-1', 'event', 'event-1')
    expect(paid).toBe(0)
    expect(gemAwards).toHaveLength(0)
    expect(errors).toHaveLength(0)
  })

  it('a NON-duplicate claim error is logged at error level, pays nothing, and leaves the token re-payable', async () => {
    claimError = { code: '57014', message: 'canceling statement due to statement timeout' }
    const paid = await awardCreationToken('creator-1', 'event', 'event-1')
    expect(paid).toBe(0)
    expect(gemAwards).toHaveLength(0)
    expect(errors.some((e) => e.includes('reward_grants claim failed') && e.includes('statement timeout'))).toBe(true)
    // The blip clears: the same publish now pays (nothing was claimed by the failed attempt).
    claimError = null
    expect(await awardCreationToken('creator-1', 'event', 'event-1')).toBe(5)
  })
})
