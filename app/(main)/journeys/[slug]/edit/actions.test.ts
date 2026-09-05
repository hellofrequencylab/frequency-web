import { describe, it, expect, vi, beforeEach } from 'vitest'

// Journey structure editor actions (ADR-252, J4b). What is locked here (scan2 L5-13):
//
//   1. REORDER NEVER LEAVES DUPLICATE sort_order. The swap is two updates. When the SECOND is
//      refused the FIRST is put back before the refusal is returned, so two siblings never share the
//      neighbor's position. A refused first write returns the refusal with nothing written.
//   2. VERA'S BULK OPS COUNT ONLY WHAT LANDED. `applied` excludes a refused op and the refused ops
//      come back by index in `failed`.
//
// Network-free: auth, the plan read, the capability read, Vera, and the admin client are stubbed.

const mocks = vi.hoisted(() => ({
  getCallerProfile: vi.fn(),
  getPlan: vi.fn(),
  getGlobalCapabilities: vi.fn(),
  planJourneyEdits: vi.fn(),
  getPillars: vi.fn(),
  pillarIdsBySlug: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getCallerProfile: mocks.getCallerProfile }))
vi.mock('@/lib/journey-plans', () => ({ getPlan: mocks.getPlan }))
vi.mock('@/lib/core/load-capabilities', () => ({ getGlobalCapabilities: mocks.getGlobalCapabilities }))
vi.mock('@/lib/ai/journey-edit', () => ({ planJourneyEdits: mocks.planJourneyEdits }))
vi.mock('@/lib/pillars', () => ({ getPillars: mocks.getPillars }))
vi.mock('@/lib/journeys/compose', () => ({
  pillarIdsBySlug: mocks.pillarIdsBySlug,
  composeIntoPhase: vi.fn(),
  insertChildren: vi.fn(),
  extraCreditRow: vi.fn(),
  PILLAR_SLOTS: [],
  EXTRA_CREDIT_PLACEHOLDER: { title: '', body: '' },
}))
vi.mock('@/lib/practices', () => ({ createPractice: vi.fn() }))
vi.mock('@/lib/ai/journey-slot-coaching', () => ({ draftSlotCoaching: vi.fn() }))
vi.mock('@/lib/seasons', () => ({ getCurrentSeason: vi.fn() }))
vi.mock('@/lib/journeys/portable', () => ({ toPortable: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

// ── A recording admin client. Writes are logged as { table, op, payload, filters }; `refuse`
// decides per write whether it is refused; reads answer from `reads` by table + shape. ─────────
interface Write {
  table: string
  op: 'update' | 'insert' | 'delete'
  payload: unknown
  filters: Array<[string, unknown]>
}
const writes: Write[] = []
let refuse: (w: Write) => boolean = () => false
const reads: { self: unknown; siblings: unknown[] } = { self: null, siblings: [] }

function builder(table: string) {
  const api: Record<string, unknown> = {}
  let write: Write | null = null
  const filter = (col: string, val: unknown) => {
    write?.filters.push([col, val])
    return api
  }
  api.eq = filter
  api.is = filter
  api.order = () => api
  api.limit = () => api
  api.select = () => api
  api.maybeSingle = async () => ({ data: reads.self, error: null })
  api.then = (resolve: (r: { data: unknown; error: unknown }) => unknown) => {
    if (write) {
      const error = refuse(write) ? { message: `${write.op} refused` } : null
      return Promise.resolve(resolve({ data: null, error }))
    }
    return Promise.resolve(resolve({ data: reads.siblings, error: null }))
  }
  const start = (op: Write['op'], payload: unknown = null) => {
    write = { table, op, payload, filters: [] }
    writes.push(write)
    return api
  }
  api.update = (p: unknown) => start('update', p)
  api.insert = (p: unknown) => start('insert', p)
  api.delete = () => start('delete')
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))

import { moveBlockAction, applyVeraChangeAction } from './actions'

const ME = 'profile-me'
const PLAN = 'plan-1'
const SLUG = 'first-light'

beforeEach(() => {
  vi.clearAllMocks()
  writes.length = 0
  refuse = () => false
  reads.self = null
  reads.siblings = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.getCallerProfile.mockResolvedValue({ id: ME })
  mocks.getGlobalCapabilities.mockResolvedValue(new Set())
  mocks.getPillars.mockResolvedValue([])
  mocks.pillarIdsBySlug.mockResolvedValue({})
})

describe('moveBlockAction (the sibling swap)', () => {
  const A = { id: 'item-a', parent_id: 'phase-1', sort_order: 0 }
  const B = { id: 'item-b', sort_order: 1 }

  beforeEach(() => {
    mocks.getPlan.mockResolvedValue({ plan: { id: PLAN, author_id: ME }, items: [] })
    reads.self = A
    reads.siblings = [{ id: A.id, sort_order: A.sort_order }, B]
  })

  it('swaps both siblings when both writes land', async () => {
    expect(await moveBlockAction(SLUG, A.id, 'down')).toEqual({ data: undefined })
    expect(writes.map((w) => [w.payload, w.filters[0]])).toEqual([
      [{ sort_order: 1 }, ['id', A.id]],
      [{ sort_order: 0 }, ['id', B.id]],
    ])
  })

  it('SECOND WRITE REFUSED: the first is put back so the siblings never share a sort_order', async () => {
    refuse = (w) => w.filters[0]?.[1] === B.id

    expect(await moveBlockAction(SLUG, A.id, 'down')).toEqual({ error: 'Could not move that step.' })

    expect(writes.map((w) => [w.payload, w.filters[0]])).toEqual([
      [{ sort_order: 1 }, ['id', A.id]],
      [{ sort_order: 0 }, ['id', B.id]],
      // The revert: A goes back to its own position.
      [{ sort_order: 0 }, ['id', A.id]],
    ])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('FIRST WRITE REFUSED: nothing else is written and the refusal is returned', async () => {
    refuse = (w) => w.filters[0]?.[1] === A.id

    expect(await moveBlockAction(SLUG, A.id, 'down')).toEqual({ error: 'Could not move that step.' })
    expect(writes).toHaveLength(1)
  })
})

describe('applyVeraChangeAction (bulk ops)', () => {
  beforeEach(() => {
    mocks.getPlan.mockResolvedValue({
      plan: { id: PLAN, author_id: ME, title: 'First Light', summary: '', intro: '' },
      items: [
        { id: 'phase-1', block_type: 'phase', parent_id: null, title: 'Week 1', body: '', domain_id: null, sort_order: 0 },
        { id: 'pr-1', block_type: 'practice', parent_id: 'phase-1', title: 'Sit', body: '', domain_id: null, sort_order: 0 },
        { id: 'pr-2', block_type: 'practice', parent_id: 'phase-1', title: 'Walk', body: '', domain_id: null, sort_order: 1 },
      ],
    })
    mocks.planJourneyEdits.mockResolvedValue([
      { op: 'practice', id: 'pr-1', title: 'Morning sit' },
      { op: 'remove', id: 'pr-2' },
      { op: 'add_practice', phaseId: 'phase-1', pillar: 'mind', title: 'Breathe', body: 'Five minutes.' },
    ])
  })

  it('counts every landed op when nothing is refused', async () => {
    expect(await applyVeraChangeAction(SLUG, 'rename the sit')).toEqual({ data: { applied: 3, failed: [] } })
  })

  it('ONE OP REFUSED: applied excludes it and its index comes back in failed', async () => {
    refuse = (w) => w.op === 'delete'

    expect(await applyVeraChangeAction(SLUG, 'rename the sit')).toEqual({ data: { applied: 2, failed: [1] } })
    // The refused delete was attempted (so the refusal is real) and the later insert still ran.
    expect(writes.map((w) => w.op)).toEqual(['update', 'delete', 'insert'])
  })
})
