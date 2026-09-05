import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// scan2 R3 (2026-09-05): grantConnectorOutcome reported EVERY reward_grants insert error as
// `{ duplicate: true }` ("already paid") — a transient failure forfeited the inviter's Zaps silently.
// Only 23505 is a duplicate; anything else now returns `{ failed: true }` and logs at error level,
// with nothing paid and nothing claimed, so the caller can retry.

type Row = Record<string, unknown>
const store: Record<string, Row[]> = { reward_grants: [] }
let claimError: { code: string; message: string } | null = null
const zapAwards: { profileId: string; amount: number }[] = []
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
vi.mock('@/lib/zaps', () => ({
  awardZaps: async (profileId: string, amount: number) => {
    zapAwards.push({ profileId, amount })
    return { awarded: true, amount }
  },
}))
vi.mock('@/lib/gems', () => ({ awardGems: async () => ({ awarded: false, amount: 0 }) }))
vi.mock('@/lib/achievements', () => ({ processGamificationEvent: async () => undefined }))

import { grantConnectorOutcome } from './connector'

beforeEach(() => {
  store.reward_grants = []
  claimError = null
  zapAwards.length = 0
  errors.length = 0
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map((x) => (typeof x === 'object' && x !== null ? JSON.stringify(x) : String(x))).join(' '))
  })
})
afterEach(() => vi.restoreAllMocks())

const input = { inviterProfileId: 'inviter-1', guestKey: 'guest-1', outcome: 'rsvp' as const }

describe('grantConnectorOutcome — claim error handling (scan2 R3)', () => {
  it('pays on a fresh claim', async () => {
    const res = await grantConnectorOutcome(input)
    expect(res.granted).toBe(true)
    expect(zapAwards).toHaveLength(1)
    expect(res.failed).toBeUndefined()
  })

  it('23505 is a duplicate: `{ duplicate: true }`, nothing paid, no error log (unchanged)', async () => {
    claimError = { code: '23505', message: 'duplicate key value violates unique constraint' }
    const res = await grantConnectorOutcome(input)
    expect(res).toMatchObject({ granted: false, duplicate: true, zaps: 0, gems: 0 })
    expect(res.failed).toBeUndefined()
    expect(zapAwards).toHaveLength(0)
    expect(errors).toHaveLength(0)
  })

  it('a NON-duplicate claim error is `{ failed: true }` (not duplicate), logged at error level, nothing paid', async () => {
    claimError = { code: '08006', message: 'connection failure' }
    const res = await grantConnectorOutcome(input)
    expect(res).toMatchObject({ granted: false, failed: true, zaps: 0, gems: 0 })
    expect(res.duplicate).toBeUndefined()
    expect(zapAwards).toHaveLength(0)
    expect(errors.some((e) => e.includes('reward_grants claim failed') && e.includes('connection failure'))).toBe(true)
    // Retryable: the same outcome pays once the blip clears.
    claimError = null
    expect((await grantConnectorOutcome(input)).granted).toBe(true)
  })
})
