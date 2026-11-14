import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The Loom store (PROG-E9 part 2): dark, fail-closed, and nothing reaches loom_functions unless the validator
// accepts the declaration first.

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] }
const calls: Call[] = []
let existing: { id: string; version: number } | null = null
let updateRow: { id: string; version: number } | null = null
let insertError: { code: string } | null = null

function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] }
  calls.push(call)
  const b: Record<string, unknown> = {}
  const chain = () => b
  Object.assign(b, {
    select: chain,
    order: chain,
    limit: () => Promise.resolve({ data: [{ id: 'f1', surface: 'page', slug: 'heading-has-text', version: 2, declaration: {}, updated_at: 't' }], error: null }),
    eq: (col: string, v: unknown) => {
      call.filters.push([col, v])
      return b
    },
    update: (payload: unknown) => {
      call.op = 'update'
      call.payload = payload
      return b
    },
    insert: (payload: unknown) => {
      call.op = 'insert'
      call.payload = payload
      return b
    },
    maybeSingle: () => Promise.resolve({ data: call.op === 'update' ? updateRow : existing, error: null }),
    single: () => Promise.resolve(insertError ? { data: null, error: insertError } : { data: { id: 'new', version: 1 }, error: null }),
  })
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }))

const { listLoomFunctions, saveLoomFunction } = await import('./store')

const GOOD = {
  id: 'heading-has-text',
  label: 'Heading has text',
  v: 1,
  input: 'block:heading',
  output: 'boolean',
  steps: [
    { id: 'clean', op: 'text.trim', args: { value: { field: 'text' } } },
    { id: 'blank', op: 'text.isEmpty', args: { value: { step: 'clean' } } },
    { id: 'shown', op: 'logic.not', args: { value: { step: 'blank' } } },
  ],
  result: 'shown',
}
const base = { spaceId: 's1', surface: 'page', profileId: 'p1' }

beforeEach(() => {
  calls.length = 0
  existing = null
  updateRow = null
  insertError = null
  vi.stubEnv('EDITOR_CANVAS', '1')
})
afterEach(() => vi.unstubAllEnvs())

describe('saveLoomFunction', () => {
  it('is dark: refuses and touches nothing with the switch off', async () => {
    vi.stubEnv('EDITOR_CANVAS', '')
    expect((await saveLoomFunction({ ...base, declaration: GOOD })).ok).toBe(false)
    expect(await listLoomFunctions('s1')).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('writes nothing when the validator rejects the declaration, and returns every problem', async () => {
    const res = await saveLoomFunction({ ...base, declaration: { ...GOOD, steps: [{ ...GOOD.steps[0], op: 'js.eval' }] } })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.problems.join(' ')).toMatch(/js\.eval is not a Loom primitive/)
    expect(calls).toHaveLength(0)
  })

  it('refuses a malformed surface before validating or writing', async () => {
    expect((await saveLoomFunction({ ...base, surface: 'Bad Surface', declaration: GOOD })).ok).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('inserts a new function keyed by its declaration id', async () => {
    const res = await saveLoomFunction({ ...base, declaration: GOOD })
    expect(res).toEqual({ ok: true, id: 'new', version: 1 })
    const ins = calls.find((c) => c.op === 'insert')!
    expect(ins.table).toBe('loom_functions')
    expect(ins.payload).toMatchObject({ space_id: 's1', surface: 'page', slug: 'heading-has-text', created_by: 'p1' })
  })

  it('updates only the version it read, and reports a concurrent save', async () => {
    existing = { id: 'f1', version: 3 }
    updateRow = { id: 'f1', version: 4 }
    expect(await saveLoomFunction({ ...base, declaration: GOOD })).toEqual({ ok: true, id: 'f1', version: 4 })
    const up = calls.find((c) => c.op === 'update')!
    expect(up.payload).toMatchObject({ version: 4, updated_by: 'p1' })
    expect(up.filters).toContainEqual(['version', 3])

    updateRow = null
    const stale = await saveLoomFunction({ ...base, declaration: GOOD })
    expect(stale.ok).toBe(false)
  })

  it('turns a unique-key race on insert into a reload message', async () => {
    insertError = { code: '23505' }
    const res = await saveLoomFunction({ ...base, declaration: GOOD })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.problems[0]).toMatch(/Reload/)
  })
})

describe('listLoomFunctions', () => {
  it('lists a Space’s functions when on', async () => {
    const rows = await listLoomFunctions('s1')
    expect(rows[0]).toMatchObject({ id: 'f1', slug: 'heading-has-text', version: 2, updatedAt: 't' })
    expect(calls[0].filters).toContainEqual(['space_id', 's1'])
  })
})
