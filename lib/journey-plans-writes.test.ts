import { describe, it, expect, vi, beforeEach } from 'vitest'

// The Journey mutations' write contract (scan2 L5-13). Every mutation in lib/journey-plans used to
// be Promise<void> with its write unread, so an author saw "saved" and found the change missing
// on reload. Locked here:
//   1. A REFUSED WRITE COMES BACK AS { ok: false, error } (never a silent void).
//   2. A LANDED WRITE COMES BACK AS { ok: true }.
//   3. THE updated_at BUMP IS NOT ATTEMPTED AFTER A REFUSED CONTENT WRITE (the bump is a follow-on
//      to a landed change, never a way to make a refused one look fresh).
// Network-free: the admin client is a recording stub.

interface Write {
  table: string
  op: 'update' | 'upsert' | 'delete' | 'insert'
  payload: unknown
}
const writes: Write[] = []
let refuse: (w: Write) => boolean = () => false

function builder(table: string) {
  const api: Record<string, unknown> = {}
  let write: Write | null = null
  const self = () => api
  for (const m of ['eq', 'in', 'is', 'order', 'limit', 'select']) api[m] = self
  api.maybeSingle = async () => ({ data: null, error: null })
  api.single = async () => ({ data: null, error: write && refuse(write) ? { message: 'refused' } : null })
  api.then = (resolve: (r: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve(resolve({ data: null, error: write && refuse(write) ? { message: 'refused' } : null }))
  const start = (op: Write['op'], payload: unknown) => {
    write = { table, op, payload }
    writes.push(write)
    return api
  }
  api.update = (p: unknown) => start('update', p)
  api.upsert = (p: unknown) => start('upsert', p)
  api.insert = (p: unknown) => start('insert', p)
  api.delete = () => start('delete', null)
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => 'root' }))
vi.mock('@/lib/practices', () => ({ adoptPractice: async () => {} }))

import {
  addItem,
  updateItem,
  updatePlan,
  setPlanStatus,
  removeBlock,
  completeLesson,
  JOURNEY_WRITE_FAILED,
} from './journey-plans'

beforeEach(() => {
  writes.length = 0
  refuse = () => false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('journey-plans mutations return a checked result', () => {
  it('updatePlan: a refused write is { ok: false, error }', async () => {
    refuse = (w) => w.table === 'journey_plans'
    expect(await updatePlan('plan-1', { title: 'New title' })).toEqual({ ok: false, error: JOURNEY_WRITE_FAILED })
  })

  it('updatePlan: a landed write is { ok: true }', async () => {
    expect(await updatePlan('plan-1', { title: 'New title' })).toEqual({ ok: true })
    expect(writes[0]?.payload).toMatchObject({ title: 'New title' })
  })

  it('addItem: a refused upsert is returned and the updated_at bump is NOT attempted', async () => {
    refuse = (w) => w.op === 'upsert'
    expect(await addItem({ planId: 'plan-1', practiceId: 'pr-1' })).toEqual({ ok: false, error: JOURNEY_WRITE_FAILED })
    expect(writes.map((w) => w.op)).toEqual(['upsert'])
  })

  it('addItem: a landed upsert bumps updated_at and is { ok: true }', async () => {
    expect(await addItem({ planId: 'plan-1', practiceId: 'pr-1' })).toEqual({ ok: true })
    expect(writes.map((w) => [w.table, w.op])).toEqual([
      ['journey_plan_items', 'upsert'],
      ['journey_plans', 'update'],
    ])
  })

  it('updateItem: a refused update is returned; an empty patch is a no-op ok', async () => {
    refuse = (w) => w.table === 'journey_plan_items'
    expect(await updateItem('plan-1', 'pr-1', { note: 'x' })).toEqual({ ok: false, error: JOURNEY_WRITE_FAILED })
    expect(await updateItem('plan-1', 'pr-1', {})).toEqual({ ok: true })
  })

  it('setPlanStatus / removeBlock / completeLesson: refused writes are returned', async () => {
    refuse = () => true
    expect(await setPlanStatus('plan-1', 'approved')).toEqual({ ok: false, error: JOURNEY_WRITE_FAILED })
    expect(await removeBlock('item-1')).toEqual({ ok: false, error: JOURNEY_WRITE_FAILED })
    expect(await completeLesson('me', 'plan-1', 'item-1')).toEqual({ ok: false, error: JOURNEY_WRITE_FAILED })
  })
})
