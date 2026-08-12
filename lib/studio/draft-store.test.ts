import { beforeEach, describe, expect, it, vi } from 'vitest'

// The staging store's contract, exercised against a recorder standing in for the admin client:
//
//   • every read and write is bound to ONE profile id (the admin client bypasses RLS, so the
//     in-code owner filter IS the access control, exactly as in lib/privacy/export.ts),
//   • the refusal list and the size caps hold on the way IN, not only at collection,
//   • the seven-day window is applied on READ, not only by the nightly sweep,
//   • and every single failure is silent, because storage must never be the thing that blocks
//     typing or costs anyone their local copy.

type Call = { table: string; op: string; filters: [string, unknown][]; payload?: unknown }

const { calls, state, createAdminClient } = vi.hoisted(() => {
  const calls: Call[] = []
  const state = { rows: [] as Record<string, unknown>[], throwOn: null as string | null }

  const createAdminClient = () => ({
    from(table: string) {
      const boom = (op: string) => {
        if (state.throwOn === op) throw new Error('network')
      }
      const chain = (call: Call) => {
        const self = {
          eq(col: string, val: unknown) {
            call.filters.push([col, val])
            return self
          },
          in(col: string, val: unknown) {
            call.filters.push([col, val])
            return self
          },
          gte(col: string, val: unknown) {
            call.filters.push([col, val])
            return self
          },
          lt(col: string, val: unknown) {
            call.filters.push([col, val])
            return self
          },
          order() {
            return self
          },
          limit() {
            return self
          },
          select() {
            return self
          },
          maybeSingle: () => Promise.resolve({ data: state.rows[0] ?? null, error: null }),
          then: (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
            Promise.resolve({ data: state.rows, error: null }).then(resolve),
        }
        return self
      }
      return {
        select() {
          boom('select')
          const call: Call = { table, op: 'select', filters: [] }
          calls.push(call)
          return chain(call)
        },
        upsert(payload: unknown) {
          boom('upsert')
          const call: Call = { table, op: 'upsert', filters: [], payload }
          calls.push(call)
          return chain(call)
        },
        delete() {
          boom('delete')
          const call: Call = { table, op: 'delete', filters: [] }
          calls.push(call)
          return chain(call)
        },
      }
    },
  })
  return { calls, state, createAdminClient }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))

import { DRAFT_TTL_MS, DRAFT_VERSION, MAX_VALUE_CHARS } from '@/components/studio/spark/draft/draft-store'
import {
  discardStagedDraft,
  eraseStagedDrafts,
  listStagedDrafts,
  loadStagedDraft,
  purgeExpiredStudioDrafts,
  saveStagedDraft,
} from './draft-store'

const NOW = 1_800_000_000_000
const iso = (ms: number) => new Date(ms).toISOString()

const row = (over: Record<string, unknown> = {}) => ({
  scope: 'journeys-new.new-journey',
  step: 2,
  answers: { 'f.answers-who': 'people who quit last time' },
  version: DRAFT_VERSION,
  updated_at: iso(NOW - 60_000),
  ...over,
})

beforeEach(() => {
  calls.length = 0
  state.rows = []
  state.throwOn = null
})

describe('owner scoping', () => {
  it('binds the read to the caller profile id and the one scope asked for', async () => {
    state.rows = [row()]
    await loadStagedDraft('me', 'journeys-new.new-journey', NOW)
    const filters = Object.fromEntries(calls[0].filters)
    expect(filters.profile_id).toBe('me')
    expect(filters.scope).toBe('journeys-new.new-journey')
  })

  it('binds the write, the discard, the list and the erase to the caller too', async () => {
    await saveStagedDraft('me', 's', { step: 1, values: { 'f.a': 'x' } }, NOW)
    await discardStagedDraft('me', 's')
    await listStagedDrafts('me', NOW)
    await eraseStagedDrafts('me')
    const owned = calls.filter((c) => c.op !== 'select' || c.filters.length > 0)
    expect(owned.length).toBeGreaterThan(0)
    for (const call of owned) {
      const payload = call.payload as { profile_id?: string } | undefined
      const filters = Object.fromEntries(call.filters)
      expect(payload?.profile_id ?? filters.profile_id).toBe('me')
    }
  })

  it('refuses to act at all without a profile id or a scope', async () => {
    expect(await loadStagedDraft('', 's', NOW)).toBeNull()
    expect(await loadStagedDraft('me', '', NOW)).toBeNull()
    expect(await saveStagedDraft('', 's', { step: 1, values: { 'f.a': 'x' } }, NOW)).toBe(false)
    expect(await eraseStagedDrafts('')).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('refuses a scope long enough to be something other than a route key', async () => {
    expect(await saveStagedDraft('me', 'x'.repeat(500), { step: 1, values: { 'f.a': 'y' } }, NOW)).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

describe('the seven-day window is applied on read', () => {
  it('filters the read on the cutoff, so a late sweep cannot resurrect an old draft', async () => {
    state.rows = [row()]
    await loadStagedDraft('me', 's', NOW)
    const filters = Object.fromEntries(calls[0].filters)
    expect(filters.updated_at).toBe(iso(NOW - DRAFT_TTL_MS))
  })

  it('sweeps everything older than the cutoff, whoever owns it', async () => {
    state.rows = [{ scope: 'a' }, { scope: 'b' }]
    expect(await purgeExpiredStudioDrafts(NOW)).toBe(2)
    const call = calls.find((c) => c.op === 'delete')
    expect(Object.fromEntries(call?.filters ?? [])).toEqual({ updated_at: iso(NOW - DRAFT_TTL_MS) })
  })
})

describe('what comes back', () => {
  it('reads a row into the same shape the local copy uses', async () => {
    state.rows = [row({ route: '/journeys/new', label: 'New Journey' })]
    const draft = await loadStagedDraft('me', 'journeys-new.new-journey', NOW)
    expect(draft).toEqual({
      scope: 'journeys-new.new-journey',
      step: 2,
      values: { 'f.answers-who': 'people who quit last time' },
      savedAt: NOW - 60_000,
      route: '/journeys/new',
      label: 'New Journey',
    })
  })

  it('ignores a row written at a version this build does not read', async () => {
    state.rows = [row({ version: DRAFT_VERSION + 1 })]
    expect(await loadStagedDraft('me', 's', NOW)).toBeNull()
  })

  it('keeps only strings out of the jsonb blob', async () => {
    state.rows = [row({ answers: { 'f.a': 'kept', 'f.b': 7, 'f.c': null, 'f.d': { nested: true } } })]
    const draft = await loadStagedDraft('me', 's', NOW)
    expect(draft?.values).toEqual({ 'f.a': 'kept' })
  })

  it('treats an empty row as no draft, so nobody is offered their own blank', async () => {
    state.rows = [row({ answers: {} })]
    expect(await loadStagedDraft('me', 's', NOW)).toBeNull()
  })
})

describe('what is allowed in', () => {
  it('refuses a named secret on the way to the database', async () => {
    await saveStagedDraft(
      'me',
      's',
      { step: 1, values: { 'f.answers-title': 'Morning Sit', 'f.password': 'hunter2', 'f.cvv': '123' } },
      NOW,
    )
    const payload = calls.find((c) => c.op === 'upsert')?.payload as { answers: Record<string, string> }
    expect(payload.answers).toEqual({ 'f.answers-title': 'Morning Sit' })
  })

  it('applies the same size caps the local copy uses', async () => {
    await saveStagedDraft(
      'me',
      's',
      { step: 1, values: { 'f.small': 'ok', 'f.huge': 'x'.repeat(MAX_VALUE_CHARS + 1) } },
      NOW,
    )
    const payload = calls.find((c) => c.op === 'upsert')?.payload as { answers: Record<string, string> }
    expect(payload.answers).toEqual({ 'f.small': 'ok' })
  })

  it('DELETES rather than writing emptiness when everything was cleared or refused', async () => {
    expect(await saveStagedDraft('me', 's', { step: 1, values: { 'f.password': 'hunter2' } }, NOW)).toBe(true)
    expect(calls.some((c) => c.op === 'upsert')).toBe(false)
    expect(calls.some((c) => c.op === 'delete')).toBe(true)
  })

  it('never lets a stored route become an off-site href', async () => {
    // `/drafts` turns `route` into a link, so a value that is not a plain in-app path is dropped
    // on the way out. `//evil.example` is the one that looks rooted and is not: a browser reads it
    // as another origin entirely.
    for (const bad of ['//evil.example/steal', 'https://evil.example', 'javascript:alert(1)', 'drafts', '/'.repeat(400)]) {
      state.rows = [row({ route: bad })]
      const draft = await loadStagedDraft('me', 's', NOW)
      expect(draft?.route).toBeNull()
    }
    state.rows = [row({ route: '/journeys/new' })]
    expect((await loadStagedDraft('me', 's', NOW))?.route).toBe('/journeys/new')
  })

  it('drops a route the caller tries to write off-site, rather than storing it', async () => {
    await saveStagedDraft(
      'me',
      's',
      { step: 1, values: { 'f.a': 'x' }, route: '//evil.example', label: '  New Journey  ' },
      NOW,
    )
    const payload = calls.find((c) => c.op === 'upsert')?.payload as { route: unknown; label: unknown }
    expect(payload.route).toBeNull()
    expect(payload.label).toBe('New Journey')
  })

  it('stamps the version and a sane step', async () => {
    await saveStagedDraft('me', 's', { step: -4, values: { 'f.a': 'x' } }, NOW)
    const payload = calls.find((c) => c.op === 'upsert')?.payload as { version: number; step: number }
    expect(payload.version).toBe(DRAFT_VERSION)
    expect(payload.step).toBe(1)
  })
})

describe('a server failure never becomes the author problem', () => {
  // The local copy is written by the caller BEFORE any of this runs and is never touched here, so
  // "the local copy survives" is structural: there is no code path in this file that can reach it.
  // What these prove is the other half, that nothing here throws back into the typing path.

  it('reports no draft rather than throwing when the read fails', async () => {
    state.throwOn = 'select'
    await expect(loadStagedDraft('me', 's', NOW)).resolves.toBeNull()
    await expect(listStagedDrafts('me', NOW)).resolves.toEqual([])
  })

  it('reports a failed push as false, which is the caller cue to stay local-only', async () => {
    state.throwOn = 'upsert'
    await expect(saveStagedDraft('me', 's', { step: 1, values: { 'f.a': 'x' } }, NOW)).resolves.toBe(false)
  })

  it('swallows a failed discard, so a commit is never blocked by cleanup', async () => {
    state.throwOn = 'delete'
    await expect(discardStagedDraft('me', 's')).resolves.toBeUndefined()
    await expect(eraseStagedDrafts('me')).resolves.toBe(0)
    await expect(purgeExpiredStudioDrafts(NOW)).resolves.toBe(0)
  })
})
