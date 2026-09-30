import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// LIVE-571 (ADR-1613): the Space Loom reads and edits on the caller's SESSION, so the per-Space
// policies of 20270345009500 (LIVE-570, ADR-1594) are the lock. What this file proves, with a
// session-client double that answers the way those policies do:
//   1. A Space member gets EXACTLY the rows the service role got for the same scope: the move drops
//      nothing a member could see before (browse, search, tag, Elements, the shared shelf, the tags).
//   2. A signed-in stranger, a signed-out caller and a failed session get nothing of the Space's own.
//   3. The metadata write lands for a writer, is refused (not "missing") for a member the policy does
//      not let write, and matches nothing for a stranger.
//   4. The module never imports the service-role client (the LIVE-335 shape).
// The real policy decision is proved by supabase/tests/library_space_rls.test.sql in db-tests; this
// double mirrors it: select = active member OR visibility public OR staff; update = the Space's
// writers (owner, admin, moderator, editor), plus staff on the root Space only. anon: nothing.

const ROOT = '00000000-0000-4000-a000-000000000000'
const SPACE_A = 'aaaaaaaa-0000-4000-a000-00000000000a'
const SPACE_B = 'bbbbbbbb-0000-4000-b000-00000000000b'

type Row = Record<string, unknown>
type Viewer =
  | { kind: 'service' }
  | { kind: 'anon' }
  | { kind: 'user'; memberOf: string[]; writerOf: string[]; staff?: boolean }

const FUTURE = '2999-01-01T00:00:00.000Z'
const PAST = '2001-01-01T00:00:00.000Z'

function asset(id: string, space: string, extra: Row = {}): Row {
  return {
    id,
    space_id: space,
    visibility: 'space',
    kind: 'image',
    status: 'approved',
    title: id,
    description: null,
    category: null,
    url: `https://cdn/${id}.jpg`,
    alt: null,
    tags: [],
    config: null,
    is_protected: false,
    expires_at: null,
    blurhash: null,
    source: 'upload',
    created_at: '2026-09-01T00:00:00.000Z',
    ...extra,
  }
}

function seed(): Row[] {
  return [
    asset('a-lake', SPACE_A, { title: 'Lake at dawn', tags: ['lake', 'dawn'], created_at: '2026-09-05T00:00:00.000Z' }),
    asset('a-lavender', SPACE_A, { title: 'Lavender field', tags: ['field'], created_at: '2026-09-04T00:00:00.000Z' }),
    asset('a-generated', SPACE_A, { title: 'Vera sunrise', tags: ['generated', 'dawn'], created_at: '2026-09-03T00:00:00.000Z' }),
    // A business-importer seed: the Space scope shows ALL of the Space (no provenance filter).
    asset('a-seed', SPACE_A, { title: 'Seed banner', source: 'seed', created_at: '2026-09-02T00:00:00.000Z' }),
    asset('a-expiring', SPACE_A, { title: 'Licensed lake', expires_at: FUTURE, created_at: '2026-09-01T12:00:00.000Z' }),
    asset('a-expired', SPACE_A, { title: 'Expired lake', expires_at: PAST }),
    asset('a-archived', SPACE_A, { title: 'Old lake', status: 'archived' }),
    asset('a-icon', SPACE_A, { title: 'Lake icon', kind: 'icon' }),
    asset('a-nourl', SPACE_A, { title: 'Lake with no file', url: null }),
    asset('b-lake', SPACE_B, { title: 'B lake', tags: ['lake'] }),
    asset('b-public', SPACE_B, { title: 'B public lake', visibility: 'public', tags: ['lake'] }),
    asset('r-public', ROOT, { title: 'Frequency lake', visibility: 'public', tags: ['lake'], created_at: '2026-08-01T00:00:00.000Z' }),
    asset('r-private', ROOT, { title: 'Root team lake', visibility: 'space' }),
  ]
}

let rows: Row[] = seed()
let viewer: Viewer = { kind: 'service' }
let sessionFails = false

const canSee = (r: Row) => {
  if (viewer.kind === 'service') return true
  if (viewer.kind === 'anon') return false
  return !!viewer.staff || viewer.memberOf.includes(String(r.space_id)) || r.visibility === 'public'
}
const canWrite = (r: Row) => {
  if (viewer.kind === 'service') return true
  if (viewer.kind === 'anon') return false
  return viewer.writerOf.includes(String(r.space_id)) || (!!viewer.staff && r.space_id === ROOT)
}

/** Split a PostgREST `or` expression on its top-level commas (an `in.(a,b)` list stays whole). */
function orTerms(expr: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of expr) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}
function termMatches(r: Row, term: string): boolean {
  const [col, op, ...rest] = term.split('.')
  const val = rest.join('.')
  const v = r[col]
  if (op === 'is' && val === 'null') return v === null || v === undefined
  if (op === 'eq') return String(v) === val
  if (op === 'gt') return v !== null && v !== undefined && String(v) > val
  if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').includes(String(v))
  if (op === 'ilike') return typeof v === 'string' && v.toLowerCase().includes(val.replace(/%/g, '').toLowerCase())
  throw new Error(`the double does not know ${term}`)
}

/** A thenable PostgREST builder over `rows`, answering as the current viewer's policies would. */
function builder(table: string) {
  if (table !== 'library_assets') throw new Error(`unexpected table ${table}`)
  const filters: ((r: Row) => boolean)[] = []
  let order: { col: string; asc: boolean } | null = null
  let limit = Infinity
  let patch: Row | null = null
  const run = (): Row[] => {
    const matched = rows.filter((r) => filters.every((f) => f(r)))
    if (patch) {
      // UPDATE: the USING clause filters silently (no error), then RETURNING needs SELECT too.
      const hit = matched.filter((r) => canSee(r) || viewer.kind === 'service').filter(canWrite)
      for (const r of hit) Object.assign(r, patch)
      return hit.filter(canSee)
    }
    let out = matched.filter(canSee)
    if (order) {
      const { col, asc } = order
      out = [...out].sort((x, y) => (String(x[col]) < String(y[col]) ? -1 : String(x[col]) > String(y[col]) ? 1 : 0) * (asc ? 1 : -1))
    }
    return out.slice(0, limit).map((r) => ({ ...r }))
  }
  const api: Record<string, unknown> = {
    select: () => api,
    update: (p: Row) => {
      patch = p
      return api
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]))
      return api
    },
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val)
      return api
    },
    neq: (col: string, val: unknown) => {
      filters.push((r) => r[col] !== val)
      return api
    },
    or: (expr: string) => {
      const terms = orTerms(expr)
      filters.push((r) => terms.some((t) => termMatches(r, t)))
      return api
    },
    contains: (col: string, vals: unknown[]) => {
      filters.push((r) => Array.isArray(r[col]) && vals.every((v) => (r[col] as unknown[]).includes(v)))
      return api
    },
    textSearch: (_col: string, q: string) => {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean)
      filters.push((r) => words.some((w) => String(r.title ?? '').toLowerCase().split(/\W+/).includes(w)))
      return api
    },
    order: (col: string, o?: { ascending?: boolean }) => {
      order = { col, asc: o?.ascending !== false }
      return api
    },
    limit: (n: number) => {
      limit = n
      return api
    },
    maybeSingle: async () => {
      const out = run()
      return { data: out[0] ?? null, error: null }
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: run(), error: null }).then(resolve, reject),
  }
  return api
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    if (sessionFails) throw new Error('no request scope')
    return { from: (t: string) => builder(t) }
  },
}))
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => ROOT }))
// Nothing here may reach the service role. If it did, this throws rather than answering.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('the Space Loom store reached the service-role client')
  },
}))

import { listSpaceLoomImages, listSpaceLoomTags, spaceLoomHoldsAsset, updateSpaceLoomAssetMeta } from './space-loom-store'

const MEMBER: Viewer = { kind: 'user', memberOf: [SPACE_A], writerOf: [] }
const EDITOR: Viewer = { kind: 'user', memberOf: [SPACE_A], writerOf: [SPACE_A] }
const STRANGER: Viewer = { kind: 'user', memberOf: [SPACE_B], writerOf: [SPACE_B] }
const STAFF: Viewer = { kind: 'user', memberOf: [], writerOf: [], staff: true }

beforeEach(() => {
  rows = seed()
  viewer = { kind: 'service' }
  sessionFails = false
})

/** What the old service-role read returned for this call, and what `who` now gets on the session. */
async function asServiceAndAs<T>(who: Viewer, read: () => Promise<T>): Promise<[T, T]> {
  viewer = { kind: 'service' }
  const before = await read()
  viewer = who
  const after = await read()
  return [before, after]
}

const ids = (xs: { id: string }[]) => xs.map((x) => x.id)

describe('a Space member reads exactly what the service role read (the policies drop nothing)', () => {
  const reads: [string, () => Promise<unknown>][] = [
    ['the Studio browse', () => listSpaceLoomImages(SPACE_A, { kinds: ['image'] })],
    ['a search', () => listSpaceLoomImages(SPACE_A, { q: 'lake' })],
    ['a tag', () => listSpaceLoomImages(SPACE_A, { tag: 'dawn' })],
    ['Elements (generated only)', () => listSpaceLoomImages(SPACE_A, { generatedOnly: true })],
    ['images and icons', () => listSpaceLoomImages(SPACE_A, { kinds: ['image', 'icon'] })],
    ['the Frequency shelf', () => listSpaceLoomImages(SPACE_A, { shared: 'only' })],
    ["the picker's own-plus-shared", () => listSpaceLoomImages(SPACE_A, { shared: 'with' })],
    ['the tag facet', () => listSpaceLoomTags(SPACE_A, ['image'])],
  ]
  for (const [name, read] of reads) {
    it(`${name}: same rows, same order, for a viewer, an editor and platform staff`, async () => {
      for (const who of [MEMBER, EDITOR, STAFF]) {
        const [before, after] = await asServiceAndAs(who, read)
        expect(before).not.toEqual([])
        expect(after).toEqual(before)
      }
    })
  }

  it('the browse is the whole Space, newest first: seeds included, expired, archived, other kinds and fileless rows out', async () => {
    viewer = MEMBER
    expect(ids(await listSpaceLoomImages(SPACE_A))).toEqual(['a-lake', 'a-lavender', 'a-generated', 'a-seed', 'a-expiring'])
    expect(await listSpaceLoomTags(SPACE_A)).toEqual(['dawn', 'field', 'generated', 'lake'])
  })

  it("the shelf is the root's public rows only, badged Frequency; 'with' puts the Space's own first", async () => {
    viewer = MEMBER
    const shelf = await listSpaceLoomImages(SPACE_A, { shared: 'only' })
    expect(ids(shelf)).toEqual(['r-public'])
    expect(shelf[0].ownedByViewer).toBe(false)
    const both = await listSpaceLoomImages(SPACE_A, { shared: 'with', q: 'lake' })
    const own = both.filter((a) => a.ownedByViewer)
    expect(own.length).toBeGreaterThan(0)
    expect(own.every((a) => a.id.startsWith('a-'))).toBe(true)
    expect(both.slice(0, own.length)).toEqual(own)
    expect(both.slice(own.length).map((a) => [a.id, a.ownedByViewer])).toEqual([['r-public', false]])
  })

  it('the root Space has no separate shelf (its own rows are the shared library)', async () => {
    viewer = STAFF
    expect(await listSpaceLoomImages(ROOT, { shared: 'only' })).toEqual([])
  })
})

describe('a caller outside the Space now gets nothing of it', () => {
  it("a signed-in member of another Space reads none of the Space's own rows, tags or ids", async () => {
    viewer = STRANGER
    expect(await listSpaceLoomImages(SPACE_A)).toEqual([])
    expect(await listSpaceLoomImages(SPACE_A, { q: 'lake' })).toEqual([])
    expect(await listSpaceLoomTags(SPACE_A)).toEqual([])
    expect(await spaceLoomHoldsAsset(SPACE_A, 'a-lake')).toBe(false)
  })

  it("the one thing a stranger sees is what the Space made public, which is what public means", async () => {
    rows.find((r) => r.id === 'a-lavender')!.visibility = 'public'
    viewer = STRANGER
    expect(ids(await listSpaceLoomImages(SPACE_A))).toEqual(['a-lavender'])
  })

  it('a signed-out caller and a failed session read nothing, and never throw', async () => {
    viewer = { kind: 'anon' }
    expect(await listSpaceLoomImages(SPACE_A)).toEqual([])
    expect(await listSpaceLoomImages(SPACE_A, { shared: 'with' })).toEqual([])
    expect(await listSpaceLoomTags(SPACE_A)).toEqual([])
    viewer = MEMBER
    sessionFails = true
    expect(await listSpaceLoomImages(SPACE_A)).toEqual([])
    expect(await listSpaceLoomTags(SPACE_A)).toEqual([])
    expect(await spaceLoomHoldsAsset(SPACE_A, 'a-lake')).toBe(false)
    expect(await updateSpaceLoomAssetMeta(SPACE_A, 'a-lake', { title: 'x' })).toBe('failed')
  })

  it("the Space id in the query is still bound: a member of A asking for B's Space gets only B's public row", async () => {
    viewer = MEMBER
    expect(ids(await listSpaceLoomImages(SPACE_B))).toEqual(['b-public'])
  })
})

describe('the metadata edit on the session: the update policy is the lock', () => {
  const title = (id: string) => rows.find((r) => r.id === id)!.title

  it('an editor of the Space saves, bound to the Space', async () => {
    viewer = EDITOR
    expect(await updateSpaceLoomAssetMeta(SPACE_A, 'a-lake', { title: 'Lake, renamed', tags: ['lake'] })).toBe('ok')
    expect(title('a-lake')).toBe('Lake, renamed')
    expect(typeof rows.find((r) => r.id === 'a-lake')!.updated_at).toBe('string')
  })

  it('a member the policy does not let write is refused, in words, and nothing changes', async () => {
    viewer = MEMBER
    expect(await updateSpaceLoomAssetMeta(SPACE_A, 'a-lake', { title: 'x' })).toBe('refused')
    viewer = STAFF
    expect(await updateSpaceLoomAssetMeta(SPACE_A, 'a-lake', { title: 'x' })).toBe('refused')
    expect(title('a-lake')).toBe('Lake at dawn')
  })

  it("another Space's id matches nothing: missing, and it is untouched even for that Space's own writer", async () => {
    viewer = STRANGER
    expect(await updateSpaceLoomAssetMeta(SPACE_A, 'a-lake', { title: 'x' })).toBe('missing')
    expect(await updateSpaceLoomAssetMeta(SPACE_A, 'b-lake', { title: 'x' })).toBe('missing')
    expect(title('a-lake')).toBe('Lake at dawn')
    expect(title('b-lake')).toBe('B lake')
  })

  it('no Space or no asset never reaches the database', async () => {
    sessionFails = true
    expect(await updateSpaceLoomAssetMeta('', 'a-lake', {})).toBe('missing')
    expect(await updateSpaceLoomAssetMeta(SPACE_A, '', {})).toBe('missing')
    expect(await spaceLoomHoldsAsset(SPACE_A, '')).toBe(false)
  })
})

describe('the module is on the session client, never the service role (the LIVE-335 shape)', () => {
  const src = readFileSync(join(process.cwd(), 'lib/library/space-loom-store.ts'), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

  it('never imports the service-role client, and reads through the session client', () => {
    expect(code).not.toMatch(/createAdminClient/)
    expect(code).not.toMatch(/@\/lib\/supabase\/admin/)
    expect(code).toMatch(/from '@\/lib\/supabase\/server'/)
    expect(code).toMatch(/await createClient\(\)/)
  })

  it('every Loom read is still bound to the Space by id (the second wall)', () => {
    expect(code).toMatch(/\.eq\('space_id', spaceId\)/)
    expect(code).toMatch(/\.eq\('space_id', sharedRoot\)\.eq\('visibility', 'public'\)/)
  })
})

describe('a protected Space row reaches the Studio and the picker only as a proof to sign (LIVE-580)', () => {
  const protectedRows = () => [
    asset('a-private', SPACE_A, { title: 'Private lake', url: null, is_protected: true, storage_path: `${SPACE_A}/private.jpg`, created_at: '2026-09-06T00:00:00.000Z' }),
    asset('a-private-nokey', SPACE_A, { title: 'Private lake with no key', url: null, is_protected: true, storage_path: null }),
  ]

  it('is dropped unless the caller asks for protected rows, as every pick reader always did', async () => {
    rows = [...seed(), ...protectedRows()]
    viewer = MEMBER
    const plain = await listSpaceLoomImages(SPACE_A)
    expect(ids(plain)).not.toContain('a-private')
    expect(plain.every((a) => a.storagePath === undefined)).toBe(true)
  })

  it('is kept with its storage key when asked, so withLoomProofs can sign its proof; a protected row with no key is still dropped', async () => {
    rows = [...seed(), ...protectedRows()]
    viewer = MEMBER
    const out = await listSpaceLoomImages(SPACE_A, { includeProtected: true })
    const priv = out.find((a) => a.id === 'a-private')
    expect(priv?.isProtected).toBe(true)
    expect(priv?.storagePath).toBe(`${SPACE_A}/private.jpg`)
    expect(ids(out)).not.toContain('a-private-nokey')
    // An unprotected row never carries the key.
    expect(out.filter((a) => !a.isProtected).every((a) => a.storagePath === undefined)).toBe(true)
  })

  it('a stranger still gets none of it', async () => {
    rows = [...seed(), ...protectedRows()]
    viewer = STRANGER
    expect(ids(await listSpaceLoomImages(SPACE_A, { includeProtected: true }))).not.toContain('a-private')
  })
})
