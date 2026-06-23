import { describe, it, expect, vi, beforeEach } from 'vitest'

// E3 (claimed-but-unpaid): the claim-then-pay Gem grant inserts the reward_grants lock
// FIRST, then the gem_transactions ledger row. If the ledger insert fails and the error
// is swallowed, the lock is permanent and the Gems are never paid — a member is charged
// the idempotency lock but never credited. The fix releases (deletes) the just-claimed
// reward_grants row when the ledger insert errors, so a retry can re-pay.
//
// This drives grantJourneyRewards (the exported caller of the private grantGemsOnce) over
// a tiny in-memory fake of the admin client whose gem_transactions insert can be forced
// to fail.

type Row = Record<string, unknown>
type Store = Record<string, Row[]>

const store: Store = { reward_grants: [], gem_transactions: [] }

// When true, the next gem_transactions insert returns an error (simulating a transient DB failure).
let failGemTx = false

function from(table: string) {
  if (!store[table]) store[table] = []
  const filters: Array<[string, unknown]> = []
  let op: 'select' | 'insert' | 'delete' = 'select'
  let insertPayload: Row | Row[] | null = null

  const match = (r: Row) => filters.every(([c, v]) => r[c] === v)

  const run = () => {
    if (op === 'insert') {
      if (table === 'gem_transactions' && failGemTx) {
        return { data: null, error: { message: 'transient ledger failure', code: 'XX000' } }
      }
      const rows = Array.isArray(insertPayload) ? insertPayload : [insertPayload!]
      for (const r of rows) store[table].push({ ...r })
      return { data: rows.map((r) => ({ ...r })), error: null }
    }
    if (op === 'delete') {
      store[table] = store[table].filter((r) => !match(r))
      return { data: null, error: null }
    }
    return { data: store[table].filter(match), error: null }
  }

  const api: Record<string, unknown> = {
    select: () => api,
    insert: (payload: Row | Row[]) => {
      op = 'insert'
      insertPayload = payload
      return api
    },
    delete: () => {
      op = 'delete'
      return api
    },
    eq: (c: string, v: unknown) => {
      filters.push([c, v])
      return api
    },
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve(run()).then(resolve)
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => from(t) }),
}))
vi.mock('@/lib/zaps', () => ({ awardZaps: async () => ({ awarded: true, amount: 0 }) }))

import { grantJourneyRewards } from './grants'
import type { JourneyRewardEvent } from './rewards'

function reset() {
  store.reward_grants = []
  store.gem_transactions = []
  failGemTx = false
}

beforeEach(reset)

const phaseEvent: JourneyRewardEvent = {
  kind: 'phase_complete',
  idempotencyKey: 'journey_phase:plan1:phase1',
  phaseTitle: 'Foundations',
}

describe('grantJourneyRewards — claimed-but-unpaid (E3)', () => {
  it('pays the Gems and keeps the claim when the ledger insert succeeds', async () => {
    const granted = await grantJourneyRewards({ profileId: 'u1', events: [phaseEvent] })
    expect(granted).toHaveLength(1)
    expect(store.reward_grants).toHaveLength(1)
    expect(store.gem_transactions).toHaveLength(1) // the Gems landed
  })

  it('RELEASES the claim (so a retry can re-pay) when the ledger insert fails', async () => {
    failGemTx = true
    const granted = await grantJourneyRewards({ profileId: 'u1', events: [phaseEvent] })
    // Nothing reported granted…
    expect(granted).toHaveLength(0)
    // …no ledger row landed…
    expect(store.gem_transactions).toHaveLength(0)
    // …and crucially the claim row was rolled back, so the lock is NOT permanent.
    expect(store.reward_grants).toHaveLength(0)

    // A retry (ledger now healthy) succeeds and pays exactly once.
    failGemTx = false
    const retry = await grantJourneyRewards({ profileId: 'u1', events: [phaseEvent] })
    expect(retry).toHaveLength(1)
    expect(store.reward_grants).toHaveLength(1)
    expect(store.gem_transactions).toHaveLength(1)
  })
})
