import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-569 (ADR-1587): a Space sees the Frequency shared library and can make a shared image its own.
// Locks the three properties the row names:
//   1. The shared shelf never widens past the ROOT Space's PUBLIC rows (never a third Space, never an
//      unlisted root row), and 'with' puts the Space's own rows first.
//      (Proved on the session store since LIVE-571: lib/library/space-loom-store.test.ts.)
//   2. A fork COPIES the object to the Space's own path, writes parent_id = the master, and lands in
//      the Space (never the master's space_id, never public).
//   3. Fork-on-edit: editing a shared asset yields a copy's id; editing an own asset yields itself.

const ROOT = '00000000-0000-4000-a000-000000000000'
const SPACE_A = 'aaaaaaaa-0000-4000-a000-00000000000a'
const SPACE_B = 'bbbbbbbb-0000-4000-b000-00000000000b'
const MASTER = 'mmmmmmmm-0000-4000-m000-00000000000m'
const PROFILE = 'pppppppp-0000-4000-p000-00000000000p'

type Call = {
  table: string
  selects: string[]
  eqs: [string, unknown][]
  ors: string[]
  insert?: Record<string, unknown>
  terminal?: 'maybeSingle' | 'then'
}
const calls: Call[] = []
const storage = {
  downloads: [] as [string, string][],
  uploads: [] as [string, string][],
  removes: [] as [string, string[]][],
}

/** The master row a fork reads, and whether a prior fork exists. Tests reshape these. */
let masterRow: Record<string, unknown> | null
let priorFork: Record<string, unknown> | null
let ownRow: Record<string, unknown> | null
let listRows: Record<string, unknown>[]

function eqOf(call: Call, col: string) {
  return call.eqs.find(([c]) => c === col)?.[1]
}

function answer(call: Call): { data: unknown; error: null } {
  if (call.table === 'spaces') return { data: { id: ROOT }, error: null }
  if (call.insert) return { data: { id: 'fork-1' }, error: null }
  if (call.terminal === 'maybeSingle') {
    if (eqOf(call, 'parent_id')) return { data: priorFork, error: null }
    if (eqOf(call, 'space_id')) return { data: ownRow, error: null }
    return { data: masterRow, error: null }
  }
  return { data: listRows, error: null }
}

function builder(table: string) {
  const call: Call = { table, selects: [], eqs: [], ors: [] }
  calls.push(call)
  const api: Record<string, unknown> = {
    select: (cols?: string) => {
      if (typeof cols === 'string') call.selects.push(cols)
      return api
    },
    eq: (col: string, val: unknown) => {
      call.eqs.push([col, val])
      return api
    },
    neq: () => api,
    in: () => api,
    contains: () => api,
    textSearch: () => api,
    or: (expr: string) => {
      call.ors.push(expr)
      return api
    },
    order: () => api,
    limit: () => api,
    insert: (row: Record<string, unknown>) => {
      call.insert = row
      return api
    },
    maybeSingle: async () => {
      call.terminal = 'maybeSingle'
      return answer(call)
    },
    then: (resolve: (v: unknown) => unknown) => {
      call.terminal = 'then'
      return Promise.resolve(resolve(answer(call)))
    },
  }
  return api
}

function bucket(name: string) {
  return {
    download: async (path: string) => {
      storage.downloads.push([name, path])
      return { data: new Blob([new Uint8Array([1, 2, 3, 4])]), error: null }
    },
    upload: async (path: string) => {
      storage.uploads.push([name, path])
      return { data: { path }, error: null }
    },
    remove: async (paths: string[]) => {
      storage.removes.push([name, paths])
      return { data: null, error: null }
    },
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${name}/${path}` } }),
  }
}

/** The budget gate's answer (loomAdmits, LIVE-629), and what it was asked. */
let admits: unknown = { ok: true }
const admitted: [string, number][] = []
vi.mock('./quota', () => ({
  loomAdmits: async (spaceId: string, bytes: number) => {
    admitted.push([spaceId, bytes])
    if (admits instanceof Error) throw admits
    return admits
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t), storage: { from: (b: string) => bucket(b) } }),
}))

import { forkLibraryAsset, forkIfShared } from './store'

const MASTER_ROW = {
  id: MASTER,
  space_id: ROOT,
  visibility: 'public',
  status: 'approved',
  kind: 'image',
  title: 'Sunrise',
  slug: 'sunrise',
  alt: 'A sunrise over hills',
  tags: ['sky'],
  mime: 'image/jpeg',
  storage_bucket: 'library-media',
  storage_path: `${ROOT}/sunrise.jpg`,
  sha256: 'f'.repeat(64),
  width: 1600,
  height: 900,
  blurhash: null,
  colors: [],
  orig_width: null,
  orig_height: null,
  is_protected: false,
  expires_at: null,
}

beforeEach(() => {
  calls.length = 0
  storage.downloads.length = 0
  storage.uploads.length = 0
  storage.removes.length = 0
  masterRow = { ...MASTER_ROW }
  priorFork = null
  ownRow = null
  listRows = []
  admits = { ok: true }
  admitted.length = 0
})

// The shared shelf (root public rows only, 'with' own-first, no shelf for the root, badged apart) reads on
// the caller's session since LIVE-571: listSpaceLoomImages, proved in lib/library/space-loom-store.test.ts.

describe('forkLibraryAsset copies the object and writes parent_id', () => {
  it('copies to the Space’s own path, inserts into the Space with parent_id = the master', async () => {
    const res = await forkLibraryAsset(SPACE_A, MASTER, PROFILE)
    expect(res).toEqual({ id: 'fork-1', url: expect.stringContaining(`${SPACE_A}/fork-`), reused: false })
    expect(storage.downloads).toEqual([['library-media', `${ROOT}/sunrise.jpg`]])
    expect(storage.uploads).toHaveLength(1)
    expect(storage.uploads[0][1].startsWith(`${SPACE_A}/`)).toBe(true)
    expect(storage.uploads[0][1]).not.toBe(`${ROOT}/sunrise.jpg`)
    const ins = calls.find((c) => c.insert)!.insert!
    expect(ins.parent_id).toBe(MASTER)
    expect(ins.space_id).toBe(SPACE_A)
    expect(ins.space_id).not.toBe(ROOT)
    expect(ins.visibility).toBe('space')
    expect(ins.source).toBe('curated')
    expect(ins.created_by).toBe(PROFILE)
    expect(ins.alt).toBe('A sunrise over hills')
    expect(ins.storage_path).toBe(storage.uploads[0][1])
  })

  it('refuses a master that is not the root’s, or not public, before touching storage', async () => {
    masterRow = { ...MASTER_ROW, space_id: SPACE_B }
    expect(await forkLibraryAsset(SPACE_A, MASTER, PROFILE)).toHaveProperty('error')
    masterRow = { ...MASTER_ROW, visibility: 'space' }
    expect(await forkLibraryAsset(SPACE_A, MASTER, PROFILE)).toHaveProperty('error')
    expect(storage.downloads).toHaveLength(0)
    expect(calls.some((c) => c.insert)).toBe(false)
  })

  it('refuses a protected master and an expired one', async () => {
    masterRow = { ...MASTER_ROW, is_protected: true }
    expect(await forkLibraryAsset(SPACE_A, MASTER, PROFILE)).toHaveProperty('error')
    masterRow = { ...MASTER_ROW, expires_at: '2020-01-01T00:00:00Z' }
    expect(await forkLibraryAsset(SPACE_A, MASTER, PROFILE)).toHaveProperty('error')
    expect(storage.uploads).toHaveLength(0)
  })

  it('answers with an earlier fork instead of copying twice', async () => {
    priorFork = { id: 'fork-0', url: 'https://cdn/fork-0.jpg' }
    expect(await forkLibraryAsset(SPACE_A, MASTER, PROFILE)).toEqual({ id: 'fork-0', url: 'https://cdn/fork-0.jpg', reused: true })
    expect(storage.uploads).toHaveLength(0)
  })

  it('asks the Space’s storage budget with the copy’s size before anything is stored', async () => {
    await forkLibraryAsset(SPACE_A, MASTER, PROFILE)
    expect(admitted).toEqual([[SPACE_A, 4]])
  })

  it('over budget: returns the gate’s sentence and stores nothing', async () => {
    admits = { ok: false, error: 'This library is full.' }
    expect(await forkLibraryAsset(SPACE_A, MASTER, PROFILE)).toEqual({ error: 'This library is full.' })
    expect(storage.uploads).toHaveLength(0)
    expect(calls.some((c) => c.insert)).toBe(false)
  })

  it('a budget gate that throws refuses (fail closed) and never throws out', async () => {
    admits = new Error('boom')
    expect(await forkLibraryAsset(SPACE_A, MASTER, PROFILE)).toHaveProperty('error')
    expect(storage.uploads).toHaveLength(0)
  })

  it('an edit of a shared asset over budget is refused, not written to the master', async () => {
    admits = { ok: false, error: 'This library is full.' }
    expect(await forkIfShared(SPACE_A, MASTER, PROFILE)).toEqual({ error: 'This library is full.' })
    expect(calls.some((c) => c.insert)).toBe(false)
  })
})

describe('forkIfShared: an edit of a shared asset produces a copy', () => {
  it('an own asset is edited in place', async () => {
    ownRow = { id: 'own-1' }
    expect(await forkIfShared(SPACE_A, 'own-1', PROFILE)).toEqual({ id: 'own-1', forked: false })
    expect(storage.uploads).toHaveLength(0)
  })

  it('a shared master is forked first, and the copy is what gets edited', async () => {
    ownRow = null
    expect(await forkIfShared(SPACE_A, MASTER, PROFILE)).toEqual({ id: 'fork-1', forked: true })
    expect(calls.find((c) => c.insert)!.insert!.parent_id).toBe(MASTER)
  })

  it('a third Space’s asset is refused, not forked', async () => {
    masterRow = { ...MASTER_ROW, space_id: SPACE_B, visibility: 'space' }
    expect(await forkIfShared(SPACE_A, MASTER, PROFILE)).toHaveProperty('error')
    expect(storage.uploads).toHaveLength(0)
  })
})
