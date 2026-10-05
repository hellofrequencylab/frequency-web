import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE OPERATOR'S RETRY (LIVE-624, ADR-1616). One planned or failed transfer sent again through the
// same executePlannedTransfers the settle and the reconciler use. What this file pins:
//   - a landed row, and a row of a fully refunded order, are refused before anything moves;
//   - a row of a PARTIALLY refunded order is retried, as the reconciler would pay it;
//   - a row past the attempt ceiling is reopened for exactly ONE more attempt: attempts goes to one
//     under the ceiling, never to zero, because the adoption lookup in ./transfers.ts runs only when
//     attempts > 0 and is what stops a retry after the key window from paying a seller twice;
//   - the reopen is a compare-and-set, so a row that moved underneath the operator is not touched.

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: ((r: Row) => boolean)[] = []
      let patch: Row | null = null
      const run = () => {
        const hit = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
        if (patch) for (const r of hit) Object.assign(r, patch)
        return hit.map((r) => ({ ...r }))
      }
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: (p: Row) => ((patch = p), chain),
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), chain),
        maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve(resolve({ data: run(), error: null })),
      }
      return chain
    },
  }),
}))

const { executePlannedTransfers } = vi.hoisted(() => ({ executePlannedTransfers: vi.fn() }))
vi.mock('./transfers', () => ({ executePlannedTransfers, MAX_TRANSFER_ATTEMPTS: 8 }))
vi.mock('@/lib/log', () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

import { retryOrderTransfer } from './transfer-retry'

const transfer = (over: Row = {}): Row => ({
  id: 't-1',
  order_id: 'o-1',
  status: 'failed',
  attempts: 3,
  last_error: 'account restricted',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  tables = {
    commerce_order_transfers: [transfer()],
    commerce_orders: [{ id: 'o-1', status: 'paid', refunded_at: null }],
  }
  // The executor lands the row, as a successful attempt would.
  executePlannedTransfers.mockImplementation(async () => {
    Object.assign(tables.commerce_order_transfers[0], { status: 'created', last_error: null })
    return { created: 1, adopted: 0, failed: 0, skipped: 0, held: 0 }
  })
})

describe('retryOrderTransfer', () => {
  it('sends a failed row under the ceiling through the one executor, and reports how it ended', async () => {
    const res = await retryOrderTransfer('t-1')
    expect(executePlannedTransfers).toHaveBeenCalledWith('o-1')
    expect(res).toEqual({ ok: true, status: 'created', lastError: null })
    // Under the ceiling nothing is reopened; the executor's own claim does the counting.
    expect(tables.commerce_order_transfers[0].attempts).toBe(3)
  })

  it('reopens a stuck row for exactly one more attempt, never from zero', async () => {
    tables.commerce_order_transfers[0].attempts = 8
    let attemptsSeenByExecutor: unknown
    executePlannedTransfers.mockImplementationOnce(async () => {
      attemptsSeenByExecutor = tables.commerce_order_transfers[0].attempts
      return { created: 0, adopted: 0, failed: 1, skipped: 0, held: 0 }
    })
    const res = await retryOrderTransfer('t-1')
    expect(attemptsSeenByExecutor).toBe(7)
    expect(res).toEqual({ ok: true, status: 'failed', lastError: 'account restricted' })
  })

  it('refuses a row that already landed', async () => {
    tables.commerce_order_transfers[0].status = 'created'
    const res = await retryOrderTransfer('t-1')
    expect(res.ok).toBe(false)
    expect(executePlannedTransfers).not.toHaveBeenCalled()
  })

  it('refuses a row of a refunded order and leaves its attempts alone', async () => {
    tables.commerce_order_transfers[0].attempts = 8
    tables.commerce_orders[0].status = 'refunded'
    tables.commerce_orders[0].refunded_at = '2026-09-29T00:00:00Z'
    const res = await retryOrderTransfer('t-1')
    expect(res.ok).toBe(false)
    expect(tables.commerce_order_transfers[0].attempts).toBe(8)
    expect(executePlannedTransfers).not.toHaveBeenCalled()
  })

  it('retries a row of a partially refunded order, which still pays its sellers', async () => {
    tables.commerce_orders[0].refunded_at = '2026-09-29T00:00:00Z'
    const res = await retryOrderTransfer('t-1')
    expect(res.ok).toBe(true)
    expect(executePlannedTransfers).toHaveBeenCalledWith('o-1')
  })

  it('refuses an unknown row', async () => {
    const res = await retryOrderTransfer('t-missing')
    expect(res).toEqual({ ok: false, error: 'That transfer is not on record.' })
  })
})
