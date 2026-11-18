import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls: { op: string; args: unknown[] }[] = []
let existing: unknown[] = []
let failOn: string | null = null

function chain(op: string, terminal: () => unknown, args: unknown[] = []): unknown {
  calls.push({ op, args })
  const res = () => Promise.resolve(failOn === op ? { error: { message: 'x' } } : terminal())
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (ok: (v: unknown) => void, bad: (e: unknown) => void) => res().then(ok, bad)
        return (...a: unknown[]) => {
          calls.push({ op: `${op}.${prop}`, args: a })
          return chain(op, terminal)
        }
      },
    },
  )
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      calls.push({ op: 'from', args: [table] })
      return {
        select: () => chain('select', () => ({ data: existing, error: null })),
        insert: (rows: unknown) => chain('insert', () => ({ error: null }), [rows]),
        upsert: (rows: unknown, opts: unknown) => chain('upsert', () => ({ error: null }), [rows, opts]),
        delete: () => chain('delete', () => ({ error: null })),
      }
    },
  }),
}))

import { placedNodes, planInstanceSync, syncInstancesForSurface } from './instances'

const NATIVE = {
  rows: [
    {
      id: 'r0',
      columns: 2,
      cells: [
        [{ nid: 'naaaaaa01', type: 'about' }, { nid: 'naaaaaa02', type: 'events' }],
        [{ nid: 'naaaaaa03', type: 'links', hidden: true }],
      ],
    },
  ],
  bench: [{ nid: 'naaaaaa09', type: 'story' }],
}

beforeEach(() => {
  calls.length = 0
  existing = []
  failOn = null
  vi.stubEnv('EDITOR_CANVAS', 'on')
})
afterEach(() => vi.unstubAllEnvs())

describe('placedNodes', () => {
  it('lists placed nodes with slot and position, not the bench', () => {
    expect(placedNodes(NATIVE)).toEqual([
      { nid: 'naaaaaa01', type: 'about', slot: 'r0:0', position: 0 },
      { nid: 'naaaaaa02', type: 'events', slot: 'r0:0', position: 1 },
      { nid: 'naaaaaa03', type: 'links', slot: 'r0:1', position: 0 },
    ])
  })

  it('refuses a legacy document, whose ids are minted on read and never stored', () => {
    expect(placedNodes({ rows: [{ id: 'r0', columns: 1, cells: [['about']] }] })).toBeNull()
    expect(placedNodes(undefined)).toBeNull()
  })
})

describe('planInstanceSync', () => {
  it('reconciles: inserts new, updates moved, deletes gone, leaves unchanged alone', () => {
    const plan = planInstanceSync(
      [
        { id: 'naaaaaa01', manifest_key: 'about', slot: 'r0:0', position: 0 },
        { id: 'naaaaaa02', manifest_key: 'events', slot: 'r0:1', position: 0 },
        { id: 'nzzzzzz99', manifest_key: 'gone', slot: 'r1:0', position: 0 },
      ],
      placedNodes(NATIVE)!,
    )
    expect(plan.insert.map((n) => n.nid)).toEqual(['naaaaaa03'])
    expect(plan.update.map((n) => n.nid)).toEqual(['naaaaaa02'])
    expect(plan.remove).toEqual(['nzzzzzz99'])
  })
})

describe('syncInstancesForSurface', () => {
  const surface = { type: 'space-profile' as const, ref: 'space-1' }

  it('is dark with EDITOR_CANVAS off and touches no table', async () => {
    vi.stubEnv('EDITOR_CANVAS', '')
    expect(await syncInstancesForSurface('space-1', surface, NATIVE, 'p1')).toEqual({ ok: true, skipped: 'off' })
    expect(calls).toEqual([])
  })

  it('writes one row per placed node keyed by node id, with created_by only on insert', async () => {
    existing = [{ id: 'naaaaaa02', manifest_key: 'events', slot: 'r9:0', position: 0 }]
    const res = await syncInstancesForSurface('space-1', surface, NATIVE, 'p1')
    expect(res.ok).toBe(true)
    const insert = calls.find((c) => c.op === 'insert')!.args[0] as Record<string, unknown>[]
    expect(insert.map((r) => r.id)).toEqual(['naaaaaa01', 'naaaaaa03'])
    expect(insert[0]).toMatchObject({ space_id: 'space-1', surface_type: 'space-profile', surface_ref: 'space-1', manifest_key: 'about', created_by: 'p1' })
    const upsert = calls.find((c) => c.op === 'upsert')!.args[0] as Record<string, unknown>[]
    expect(upsert).toEqual([{ space_id: 'space-1', surface_type: 'space-profile', surface_ref: 'space-1', id: 'naaaaaa02', manifest_key: 'events', slot: 'r0:0', position: 1 }])
    expect(calls.some((c) => c.op === 'delete')).toBe(false)
  })

  it('never throws: a failed read or write reports ok false', async () => {
    failOn = 'select'
    expect(await syncInstancesForSurface('space-1', surface, NATIVE, 'p1')).toEqual({ ok: false })
    failOn = 'insert'
    expect(await syncInstancesForSurface('space-1', surface, NATIVE, 'p1')).toEqual({ ok: false })
  })
})
