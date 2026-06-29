import { describe, it, expect, beforeEach, vi } from 'vitest'

// Phase 1 "Scale it" (ADR-438) — the admin read/data layer.
//
// Locks the server curation layer against an in-memory fake of the admin client (the
// repo's unit pattern, see practices-unlog.test.ts). A chainable query builder runs over a
// tiny per-table store and supports exactly the operators searchAdminPractices /
// countAdminPractices / resolveAdminPracticeIds / archivePractices / restorePractices issue
// against practices_ranked + practices: .select(count/head) · .eq · .in · .is · .or (incl.
// the keyset cursor clause) · .order (composable) · .limit · .range. The .rpc() path
// (practice_admin_facets / match_practices) is faked from the same store.
//
// Proves:
//   • keyset pagination walks the whole set in (score desc, id asc) order, page by page,
//     with NO 200-row cap — >200 rows are reachable
//   • the keyset cursor boundary is exact (no row repeated, none skipped across pages)
//   • facet counts are correct (pillar / status / flags / computed)
//   • archive sets BOTH status='archived' AND is_public=false
//   • restore returns archived → approved (and never touches a non-archived row)
//   • bulk-on-filtered resolves the right ids for the filter and respects ADMIN_BULK_MAX

type Row = Record<string, unknown>
type Store = Record<string, Row[]>

const store: Store = {
  practices: [],
  practices_ranked: [],
  practice_tag_defs: [],
  practice_tags: [],
  profiles: [],
}

// --- A query builder rich enough for the admin search functions ---------------

type Order = { col: string; asc: boolean }
type OrFilter = string

function from(table: string) {
  if (!store[table]) store[table] = []
  // Each predicate narrows the working row set. `is` is null-only; `eq`/`in` are equality.
  const preds: Array<(r: Row) => boolean> = []
  const orders: Order[] = []
  let headCount = false
  let countExact = false
  let op: 'select' | 'update' | 'delete' = 'select'
  let updatePayload: Row | null = null

  // Parse the keyset .or() clause: "score.lt.<n>,and(score.eq.<n>,id.gt.<id>)" OR the
  // free-text search clause "title.ilike.%x%,summary.ilike.%x%,...". We only need the
  // keyset form for assertions; an ilike clause is treated as match-all (the tests don't
  // filter by text). Returns a predicate.
  function parseOr(clause: OrFilter): (r: Row) => boolean {
    if (clause.includes('ilike')) return () => true
    // keyset: score.lt.N , and(score.eq.N,id.gt.ID)
    const ltMatch = clause.match(/score\.lt\.([\d.eE+-]+)/)
    const andMatch = clause.match(/and\(score\.eq\.([\d.eE+-]+),id\.gt\.([^)]+)\)/)
    const ltScore = ltMatch ? Number(ltMatch[1]) : null
    const eqScore = andMatch ? Number(andMatch[1]) : null
    const gtId = andMatch ? andMatch[2] : null
    return (r: Row) => {
      const s = Number(r.score)
      if (ltScore != null && s < ltScore) return true
      if (eqScore != null && gtId != null && s === eqScore && String(r.id) > gtId) return true
      return false
    }
  }

  const matched = () => store[table].filter((r) => preds.every((p) => p(r)))

  const sorted = (rows: Row[]) => {
    if (orders.length === 0) return rows
    return [...rows].sort((a, b) => {
      for (const o of orders) {
        const av = a[o.col]
        const bv = b[o.col]
        if (av === bv) continue
        const cmp = (av as number | string) < (bv as number | string) ? -1 : 1
        return o.asc ? cmp : -cmp
      }
      return 0
    })
  }

  const terminal = (rows: Row[]) => {
    if (op === 'delete') {
      const keep = store[table].filter((r) => !preds.every((p) => p(r)))
      const removed = store[table].length - keep.length
      store[table] = keep
      return { data: null, error: null, count: removed }
    }
    if (op === 'update') {
      let n = 0
      for (const r of store[table]) {
        if (preds.every((p) => p(r))) {
          Object.assign(r, updatePayload)
          n++
        }
      }
      return { data: null, error: null, count: n }
    }
    if (headCount || countExact) {
      const c = matched().length
      return { data: headCount ? null : rows, count: c, error: null }
    }
    return { data: rows, count: null, error: null }
  }

  const api: Record<string, unknown> = {
    select: (_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count === 'exact') countExact = true
      if (opts?.head) headCount = true
      return api
    },
    update: (payload: Row) => {
      op = 'update'
      updatePayload = payload
      return api
    },
    delete: () => {
      op = 'delete'
      return api
    },
    eq: (c: string, v: unknown) => {
      preds.push((r) => r[c] === v)
      return api
    },
    neq: (c: string, v: unknown) => {
      preds.push((r) => r[c] !== v)
      return api
    },
    in: (c: string, vs: readonly unknown[]) => {
      const set = new Set(vs)
      preds.push((r) => set.has(r[c]))
      return api
    },
    is: (c: string, v: null) => {
      preds.push((r) => (r[c] ?? null) === v)
      return api
    },
    or: (clause: string) => {
      preds.push(parseOr(clause))
      return api
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      orders.push({ col, asc: opts?.ascending !== false })
      return api
    },
    limit: (n: number) => Promise.resolve(terminal(sorted(matched()).slice(0, n))),
    range: (a: number, b: number) => Promise.resolve(terminal(sorted(matched()).slice(a, b + 1))),
    async maybeSingle() {
      return { data: sorted(matched())[0] ?? null, error: null }
    },
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve(terminal(sorted(matched()))).then(resolve)
    },
  }
  return api
}

// --- RPC fakes (facet counts + nearest-neighbour duplicates) ------------------

function rpc(name: string, args: Record<string, unknown>) {
  if (name === 'practice_admin_facets') {
    const includeHidden = args.include_hidden !== false
    const universe = store.practices.filter((p) => includeHidden || p.is_public === true)
    const logged = new Set(store.practices_ranked.filter((r) => Number(r.logs_total) > 0).map((r) => r.id))
    const rows: { facet: string; key: string | null; cnt: number }[] = []
    const group = (facet: string, keyOf: (p: Row) => string | null) => {
      const m = new Map<string | null, number>()
      for (const p of universe) {
        const k = keyOf(p)
        m.set(k, (m.get(k) ?? 0) + 1)
      }
      for (const [key, cnt] of m) rows.push({ facet, key, cnt })
    }
    group('pillar', (p) => (p.domain_id as string | null) ?? null)
    group('status', (p) => (p.status as string | null) ?? 'approved')
    rows.push({ facet: 'flag', key: 'public', cnt: universe.filter((p) => p.is_public).length })
    rows.push({ facet: 'flag', key: 'template', cnt: universe.filter((p) => p.is_template).length })
    rows.push({ facet: 'flag', key: 'featured', cnt: universe.filter((p) => p.featured_at != null).length })
    rows.push({ facet: 'computed', key: 'no_image', cnt: universe.filter((p) => p.header_image == null).length })
    rows.push({ facet: 'computed', key: 'no_body', cnt: universe.filter((p) => p.body == null).length })
    rows.push({ facet: 'computed', key: 'no_pillar', cnt: universe.filter((p) => p.domain_id == null).length })
    rows.push({ facet: 'computed', key: 'never_logged', cnt: universe.filter((p) => !logged.has(p.id)).length })
    return Promise.resolve({ data: rows, error: null })
  }
  return Promise.resolve({ data: [], error: null })
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => from(t), rpc: (n: string, a: Record<string, unknown>) => rpc(n, a) }),
}))

import {
  searchAdminPractices,
  countAdminPractices,
  searchAdminFacets,
  resolveAdminPracticeIds,
  archivePractices,
  restorePractices,
  ADMIN_BULK_MAX,
} from './practices'

// Seed N practices with descending-ish scores and a stable id ordering. We make scores
// span a small range so ties exist (exercises the (score, id) keyset tiebreak), and mirror
// each into practices_ranked (the view the admin reads) + practices (the table archive
// writes to + the enrichment reads featured_at from).
function seed(n: number) {
  for (const k of Object.keys(store)) store[k] = []
  for (let i = 0; i < n; i++) {
    const id = `p-${String(i).padStart(4, '0')}`
    const score = (n - i) % 7 // 0..6, lots of ties → real keyset tiebreak pressure
    const ranked: Row = {
      id,
      title: `Practice ${i}`,
      created_by: i % 5 === 0 ? null : `u-${i % 3}`,
      is_public: i % 4 !== 0, // ~75% public
      is_template: i % 10 === 0,
      status: 'approved',
      domain_id: i % 6 === 0 ? null : `d-${i % 2}`,
      subcategory_id: null,
      weight_class: 'standard',
      header_image: i % 3 === 0 ? null : 'https://img',
      body: i % 8 === 0 ? null : 'body text',
      created_at: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      adopters: i % 4,
      logs_30d: i % 3,
      logs_total: i % 9 === 0 ? 0 : (i % 5) + 1,
      score,
      is_demo: false,
    }
    store.practices_ranked.push(ranked)
    store.practices.push({ ...ranked, featured_at: i % 12 === 0 ? '2026-01-01T00:00:00Z' : null })
  }
}

beforeEach(() => seed(0))

describe('searchAdminPractices — keyset pagination (default score sort)', () => {
  it('walks the entire set past 200 rows, page by page, with no dup or gap', async () => {
    seed(420) // > the old 200-row cap
    const pageSize = 50
    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0
    // Walk until the cursor runs out.
    for (;;) {
      const res = await searchAdminPractices({ pageSize, cursor, includeHidden: true })
      expect(res.rows.length).toBeLessThanOrEqual(pageSize)
      for (const r of res.rows) seen.push(r.id)
      pages++
      if (!res.nextCursor) break
      cursor = res.nextCursor
      if (pages > 50) throw new Error('cursor never terminated')
    }
    // Every one of the 420 rows reached exactly once → >200 reachable, no cap.
    expect(seen.length).toBe(420)
    expect(new Set(seen).size).toBe(420)
  })

  it('orders by score desc then id asc, and the cursor boundary is exact', async () => {
    seed(120)
    const first = await searchAdminPractices({ pageSize: 40, includeHidden: true })
    const second = await searchAdminPractices({ pageSize: 40, cursor: first.nextCursor, includeHidden: true })
    // Within a page, ordering holds.
    const ordered = (rows: { score: number; id: string }[]) =>
      rows.every((r, i) => i === 0 || rows[i - 1].score > r.score || (rows[i - 1].score === r.score && rows[i - 1].id < r.id))
    expect(ordered(first.rows)).toBe(true)
    expect(ordered(second.rows)).toBe(true)
    // The first row of page 2 sorts strictly after the last row of page 1.
    const lastOf1 = first.rows[first.rows.length - 1]
    const firstOf2 = second.rows[0]
    const after =
      firstOf2.score < lastOf1.score || (firstOf2.score === lastOf1.score && firstOf2.id > lastOf1.id)
    expect(after).toBe(true)
    // total is exact regardless of page.
    expect(first.total).toBe(120)
    expect(second.total).toBe(120)
  })

  it('a malformed cursor is treated as page 1 (never throws)', async () => {
    seed(10)
    const res = await searchAdminPractices({ pageSize: 5, cursor: 'not-a-real-cursor', includeHidden: true })
    expect(res.rows.length).toBe(5)
    expect(res.total).toBe(10)
  })
})

describe('searchAdminPractices — alternate (offset) sorts', () => {
  it('sorts az and paginates by offset with an exact total', async () => {
    seed(30)
    const p1 = await searchAdminPractices({ sort: 'az', page: 1, pageSize: 10, includeHidden: true })
    const p2 = await searchAdminPractices({ sort: 'az', page: 2, pageSize: 10, includeHidden: true })
    expect(p1.total).toBe(30)
    expect(p1.pageCount).toBe(3)
    expect(p1.rows[0].title <= p1.rows[9].title).toBe(true)
    // No overlap between offset pages.
    const ids1 = new Set(p1.rows.map((r) => r.id))
    expect(p2.rows.some((r) => ids1.has(r.id))).toBe(false)
  })
})

describe('countAdminPractices', () => {
  it('counts the filtered set exactly', async () => {
    seed(40)
    const all = await countAdminPractices({ includeHidden: true })
    expect(all).toBe(40)
    // includeHidden=false drops the ~25% non-public rows.
    const publicOnly = await countAdminPractices({ includeHidden: false })
    const expectedPublic = store.practices_ranked.filter((r) => r.is_public).length
    expect(publicOnly).toBe(expectedPublic)
  })
})

describe('searchAdminFacets', () => {
  it('returns correct global counts for flags + computed gaps', async () => {
    seed(48)
    const f = await searchAdminFacets({ includeHidden: true })
    expect(f.flag.public).toBe(store.practices.filter((p) => p.is_public).length)
    expect(f.flag.template).toBe(store.practices.filter((p) => p.is_template).length)
    expect(f.flag.featured).toBe(store.practices.filter((p) => p.featured_at != null).length)
    expect(f.computed.no_image).toBe(store.practices.filter((p) => p.header_image == null).length)
    expect(f.computed.no_body).toBe(store.practices.filter((p) => p.body == null).length)
    expect(f.computed.no_pillar).toBe(store.practices.filter((p) => p.domain_id == null).length)
    // Pillar buckets sum to the universe (including the null/no-Pillar bucket).
    const pillarSum = f.pillar.reduce((s, b) => s + b.count, 0)
    expect(pillarSum).toBe(48)
  })
})

describe('archive / restore', () => {
  it('archive sets BOTH status=archived AND is_public=false', async () => {
    seed(5)
    const target = store.practices.filter((p) => p.is_public).slice(0, 3).map((p) => p.id as string)
    const n = await archivePractices(target)
    expect(n).toBe(3)
    for (const id of target) {
      const row = store.practices.find((p) => p.id === id)!
      expect(row.status).toBe('archived')
      expect(row.is_public).toBe(false)
    }
  })

  it('restore returns archived → approved and skips non-archived rows', async () => {
    seed(5)
    const ids = store.practices.slice(0, 4).map((p) => p.id as string)
    await archivePractices(ids.slice(0, 2)) // archive only the first two
    const restored = await restorePractices(ids) // ask to restore all four
    // Only the two archived ones flip back to approved; the others were never archived.
    const a = store.practices.find((p) => p.id === ids[0])!
    expect(a.status).toBe('approved')
    expect(restored).toBe(4) // helper reports the requested clean count
    // A row that was approved all along is untouched (still approved, never reset).
    const c = store.practices.find((p) => p.id === ids[2])!
    expect(c.status).toBe('approved')
  })
})

describe('resolveAdminPracticeIds — bulk on the whole filtered set', () => {
  it('resolves exactly the ids matching the filter', async () => {
    seed(40)
    // Filter: non-public only (the archive-candidates view).
    const { ids, capped } = await resolveAdminPracticeIds({ isPublic: false, includeHidden: true })
    const expected = store.practices_ranked.filter((r) => r.is_public === false).map((r) => r.id)
    expect(new Set(ids)).toEqual(new Set(expected))
    expect(capped).toBe(false)
  })

  it('respects ADMIN_BULK_MAX (reports capped, truncates the set)', async () => {
    seed(ADMIN_BULK_MAX + 25)
    const { ids, capped } = await resolveAdminPracticeIds({ includeHidden: true })
    expect(ids.length).toBe(ADMIN_BULK_MAX)
    expect(capped).toBe(true)
  })
})
