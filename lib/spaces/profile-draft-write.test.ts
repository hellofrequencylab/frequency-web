import { beforeEach, describe, expect, it, vi } from 'vitest'

// PROG-E5 item 1. The draft write goes through save_space_profile_draft. This pins the call the writer makes and
// how it reads each answer; the RPC is mocked (no database).

const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  result: { data: null as unknown, error: null as { message: string; code?: string } | null },
  throws: false,
  extra: [] as unknown[][],
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (db.throws) throw new Error('no client')
      db.calls.push([fn, args])
      return db.result
    },
    from: (table: string) => {
      const chain = {
        update: (value: unknown) => { db.extra.push(['update', table, value]); return chain },
        eq: () => chain,
        is: () => chain,
        select: async () => ({ data: [{ id: 's' }], error: null }),
      }
      return chain
    },
  }),
}))
vi.mock('@/lib/log', () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import { saveSpaceProfileDraft } from './profile-draft-write'
import { writeSpacePreferencesAtRevision } from './store'

const SPACE = '0f0e0d0c-0b0a-4908-8706-050403020100'
const ACTOR = '1f0e0d0c-0b0a-4908-8706-050403020100'
const DRAFT = { rows: [{ id: 'r1', columns: 1, cells: [[]] }], bench: [] }
const KEY = 'profileLayoutDraftRevision'

beforeEach(() => {
  db.calls.length = 0
  db.extra.length = 0
  db.throws = false
  db.result = { data: { status: 'written', revision: 4 }, error: null }
})

describe('saveSpaceProfileDraft', () => {
  it('sends the actor, the Space, the draft and the expected revision to the one function', async () => {
    expect(await saveSpaceProfileDraft({ spaceId: SPACE, actor: ACTOR, draft: DRAFT, expected: 3 })).toEqual({ status: 'written', revision: 4 })
    expect(db.calls).toEqual([['save_space_profile_draft', { p_actor: ACTOR, p_space_id: SPACE, p_draft: DRAFT, p_expected: 3 }]])
  })

  it('passes a removal and a writer with no revision as nulls', async () => {
    await saveSpaceProfileDraft({ spaceId: SPACE, actor: ACTOR, draft: null, expected: null })
    expect(db.calls[0]![1]).toEqual({ p_actor: ACTOR, p_space_id: SPACE, p_draft: null, p_expected: null })
  })

  it('reads a refusal as an answer: stale, forbidden and missing', async () => {
    db.result = { data: { status: 'stale', revision: 7 }, error: null }
    expect(await saveSpaceProfileDraft({ spaceId: SPACE, actor: ACTOR, draft: DRAFT, expected: 3 })).toEqual({ status: 'stale', revision: 7 })
    db.result = { data: { status: 'forbidden' }, error: null }
    expect(await saveSpaceProfileDraft({ spaceId: SPACE, actor: ACTOR, draft: DRAFT, expected: 3 })).toEqual({ status: 'forbidden' })
    db.result = { data: { status: 'missing' }, error: null }
    expect(await saveSpaceProfileDraft({ spaceId: SPACE, actor: ACTOR, draft: DRAFT, expected: 3 })).toEqual({ status: 'missing' })
  })

  it('is unavailable before the migration is applied, on a thrown call, or on an answer it cannot read', async () => {
    db.result = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
    expect(await saveSpaceProfileDraft({ spaceId: SPACE, actor: ACTOR, draft: DRAFT, expected: 0 })).toEqual({ status: 'unavailable' })
    db.result = { data: { status: 'written', revision: 'four' }, error: null }
    expect(await saveSpaceProfileDraft({ spaceId: SPACE, actor: ACTOR, draft: DRAFT, expected: 0 })).toEqual({ status: 'unavailable' })
    db.throws = true
    expect(await saveSpaceProfileDraft({ spaceId: SPACE, actor: ACTOR, draft: DRAFT, expected: 0 })).toEqual({ status: 'unavailable' })
  })

  it('never calls with a missing actor or a bad revision', async () => {
    expect(await saveSpaceProfileDraft({ spaceId: SPACE, actor: '', draft: DRAFT, expected: 0 })).toEqual({ status: 'unavailable' })
    expect(await saveSpaceProfileDraft({ spaceId: SPACE, actor: ACTOR, draft: DRAFT, expected: -1 })).toEqual({ status: 'unavailable' })
    expect(db.calls).toEqual([])
  })
})

describe('the canvas guarded write goes key-scoped first', () => {
  it('saves only the draft through the function and never replaces the blob when the function answers', async () => {
    expect(await writeSpacePreferencesAtRevision(SPACE, { accent: 'sky', profileLayoutDraft: DRAFT, [KEY]: 4 }, { revisionKey: KEY, expected: 3 }, { actor: ACTOR, draft: DRAFT })).toBe('written')
    expect(db.calls).toEqual([['save_space_profile_draft', { p_actor: ACTOR, p_space_id: SPACE, p_draft: DRAFT, p_expected: 3 }]])
    expect(db.extra).toEqual([])
  })

  it('is stale or forbidden when the function says so, with no fallback write', async () => {
    db.result = { data: { status: 'stale', revision: 5 }, error: null }
    expect(await writeSpacePreferencesAtRevision(SPACE, {}, { revisionKey: KEY, expected: 3 }, { actor: ACTOR, draft: DRAFT })).toBe('stale')
    db.result = { data: { status: 'forbidden' }, error: null }
    expect(await writeSpacePreferencesAtRevision(SPACE, {}, { revisionKey: KEY, expected: 3 }, { actor: ACTOR, draft: DRAFT })).toBe('forbidden')
    expect(db.extra).toEqual([])
  })

  it('falls back to the guarded whole-blob update only while the function is unavailable', async () => {
    db.result = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
    const preferences = { accent: 'sky', [KEY]: 4 }
    expect(await writeSpacePreferencesAtRevision(SPACE, preferences, { revisionKey: KEY, expected: 3 }, { actor: ACTOR, draft: DRAFT })).toBe('written')
    expect(db.extra).toEqual([['update', 'spaces', { preferences }]])
  })
})
