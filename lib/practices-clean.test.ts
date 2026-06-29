import { describe, it, expect, beforeEach, vi } from 'vitest'

// Phase 2 "Clean" (ADR-438) — the merge / tag-governance / triage-queue server layer.
//
// Locks the TypeScript choreography against an in-memory fake of the admin client (the repo's
// unit pattern, see practices-admin-search.test.ts). The merge_practices RPC itself runs in
// Postgres, so here we mock db().rpc('merge_practices') to assert the lib fn passes it through
// faithfully; the TS-side choreography we DO own (tag merge re-point + dedup + def delete, and
// the queue ordering) is unit-tested for real against the store.
//
// Proves:
//   • mergePractices passes (from,to) to the RPC and returns its result verbatim
//   • mergeTags re-points links onto the canonical, DROPS the unique-conflict duplicate, and
//     deletes the retired source def
//   • listReviewQueue orders near-dup first, then lower submitter trust, then recency
//   • resolvePracticeSlugRedirect resolves to a live canonical's slug (and refuses a hidden one)

type Row = Record<string, unknown>
type Store = Record<string, Row[]>

const store: Store = {
  practices: [],
  practices_ranked: [],
  practice_tag_defs: [],
  practice_tags: [],
  practice_slug_redirects: [],
  profiles: [],
  trust_scores: [],
}

// Records the args of the last merge_practices RPC call so the test can assert the pass-through.
let lastMergeArgs: Record<string, unknown> | null = null
// The nearest-neighbour the match_practices RPC fake returns, keyed by the seed's exclude_id.
let nearestByExcludeId: Record<string, { id: string; title: string; similarity: number }[]> = {}

function from(table: string) {
  if (!store[table]) store[table] = []
  const preds: Array<(r: Row) => boolean> = []
  const orders: Array<{ col: string; asc: boolean }> = []
  let op: 'select' | 'update' | 'delete' = 'select'
  let updatePayload: Row | null = null
  let limitN: number | null = null

  const matched = () => store[table].filter((r) => preds.every((p) => p(r)))
  const sorted = (rows: Row[]) => {
    if (orders.length === 0) return rows
    return [...rows].sort((a, b) => {
      for (const o of orders) {
        const av = a[o.col]; const bv = b[o.col]
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
      for (const r of store[table]) if (preds.every((p) => p(r))) { Object.assign(r, updatePayload); n++ }
      return { data: null, error: null, count: n }
    }
    return { data: rows, error: null, count: null }
  }

  const api: Record<string, unknown> = {
    select: () => api,
    update: (payload: Row) => { op = 'update'; updatePayload = payload; return api },
    delete: () => { op = 'delete'; return api },
    eq: (c: string, v: unknown) => { preds.push((r) => r[c] === v); return api },
    neq: (c: string, v: unknown) => { preds.push((r) => r[c] !== v); return api },
    in: (c: string, vs: readonly unknown[]) => { const s = new Set(vs); preds.push((r) => s.has(r[c])); return api },
    is: (c: string, v: null) => { preds.push((r) => (r[c] ?? null) === v); return api },
    order: (col: string, opts?: { ascending?: boolean }) => { orders.push({ col, asc: opts?.ascending !== false }); return api },
    limit: (n: number) => { limitN = n; return Promise.resolve(terminal(sorted(matched()).slice(0, n))) },
    async maybeSingle() { return { data: sorted(matched())[0] ?? null, error: null } },
    then(resolve: (v: unknown) => unknown) {
      const rows = sorted(matched())
      return Promise.resolve(terminal(limitN != null ? rows.slice(0, limitN) : rows)).then(resolve)
    },
  }
  return api
}

function rpc(name: string, args: Record<string, unknown>) {
  if (name === 'merge_practices') {
    lastMergeArgs = args
    return Promise.resolve({
      data: { from: args.from_id, to: args.to_id, old_slug: 'old-slug' },
      error: null,
    })
  }
  if (name === 'merge_tags') {
    // Simulate the atomic SQL merge_tags against the store: drop the source links that collide
    // on (practice_id, tag_id), re-point the rest onto the canonical, delete the source def.
    const from = String(args.from_id)
    const into = String(args.into_id)
    if (from === into) return Promise.resolve({ data: null, error: { message: 'cannot merge a tag into itself' } })
    const intoPractices = new Set(
      store.practice_tags.filter((l) => l.tag_id === into).map((l) => l.practice_id),
    )
    const before = store.practice_tags.length
    store.practice_tags = store.practice_tags.filter(
      (l) => !(l.tag_id === from && intoPractices.has(l.practice_id)),
    )
    const dropped = before - store.practice_tags.length
    let repointed = 0
    for (const l of store.practice_tags) {
      if (l.tag_id === from) {
        l.tag_id = into
        repointed++
      }
    }
    store.practice_tag_defs = store.practice_tag_defs.filter((d) => d.id !== from)
    return Promise.resolve({ data: { repointed, dropped, into }, error: null })
  }
  if (name === 'match_practices') {
    const exclude = String(args.exclude_id)
    return Promise.resolve({ data: nearestByExcludeId[exclude] ?? [], error: null })
  }
  return Promise.resolve({ data: [], error: null })
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => from(t), rpc: (n: string, a: Record<string, unknown>) => rpc(n, a) }),
}))

import {
  mergePractices,
  mergeTags,
  listReviewQueue,
  resolvePracticeSlugRedirect,
} from './practices/clean'

beforeEach(() => {
  for (const k of Object.keys(store)) store[k] = []
  lastMergeArgs = null
  nearestByExcludeId = {}
})

describe('mergePractices — RPC pass-through', () => {
  it('calls merge_practices with (from_id, to_id) and returns its result', async () => {
    const res = await mergePractices('p-dup', 'p-canon')
    expect(lastMergeArgs).toEqual({ from_id: 'p-dup', to_id: 'p-canon' })
    expect(res).toEqual({ from: 'p-dup', to: 'p-canon', old_slug: 'old-slug' })
  })
})

describe('mergeTags — re-point + dedup + retire', () => {
  it('re-points links onto the canonical, drops the unique-conflict duplicate, and deletes the old def', async () => {
    store.practice_tag_defs.push(
      { id: 't-from', slug: 'calm', label: 'calm', is_canonical: false },
      { id: 't-into', slug: 'calming', label: 'calming', is_canonical: true },
    )
    // p1 carries only the source tag (clean re-point); p2 carries BOTH (the collision to drop).
    store.practice_tags.push(
      { practice_id: 'p1', tag_id: 't-from', source: 'member' },
      { practice_id: 'p2', tag_id: 't-from', source: 'member' },
      { practice_id: 'p2', tag_id: 't-into', source: 'author' },
    )

    const result = await mergeTags('t-from', 't-into')

    expect(result).toEqual({ repointed: 1, dropped: 1 })
    // The source def is gone.
    expect(store.practice_tag_defs.find((d) => d.id === 't-from')).toBeUndefined()
    // No link still points at the retired tag.
    expect(store.practice_tags.some((l) => l.tag_id === 't-from')).toBe(false)
    // p1 now carries the canonical; p2 carries it exactly once (no duplicate row).
    const intoLinks = store.practice_tags.filter((l) => l.tag_id === 't-into')
    expect(new Set(intoLinks.map((l) => l.practice_id))).toEqual(new Set(['p1', 'p2']))
    expect(intoLinks.filter((l) => l.practice_id === 'p2').length).toBe(1)
  })

  it('refuses to merge a tag into itself', async () => {
    await expect(mergeTags('t-x', 't-x')).rejects.toThrow(/itself/)
  })
})

describe('resolvePracticeSlugRedirect', () => {
  it('resolves an old slug to the live canonical practice slug', async () => {
    store.practices.push({ id: 'p-canon', slug: 'canonical-breath', is_public: true })
    store.practice_slug_redirects.push({ old_slug: 'old-breath', practice_id: 'p-canon' })
    expect(await resolvePracticeSlugRedirect('old-breath')).toBe('canonical-breath')
  })

  it('returns null when there is no redirect', async () => {
    expect(await resolvePracticeSlugRedirect('nope')).toBeNull()
  })

  it('refuses to redirect to a hidden canonical (never bounce a member to a private row)', async () => {
    store.practices.push({ id: 'p-hidden', slug: 'hidden', is_public: false })
    store.practice_slug_redirects.push({ old_slug: 'old', practice_id: 'p-hidden' })
    expect(await resolvePracticeSlugRedirect('old')).toBeNull()
  })
})

describe('listReviewQueue — ordering', () => {
  it('orders near-dup first, then lower submitter trust, then recency', async () => {
    // Three pending practices, each with an embedding so the dup check runs.
    store.practices.push(
      { id: 'a', title: 'A', summary: null, created_by: 'u-trusted', created_at: '2026-06-01', updated_at: '2026-06-01', status: 'pending', embedding: [0.1], is_public: false },
      { id: 'b', title: 'B', summary: null, created_by: 'u-low', created_at: '2026-06-02', updated_at: '2026-06-02', status: 'pending', embedding: [0.1], is_public: false },
      { id: 'c', title: 'C', summary: null, created_by: 'u-low', created_at: '2026-06-03', updated_at: '2026-06-03', status: 'pending', embedding: [0.1], is_public: false },
    )
    store.profiles.push(
      { id: 'u-trusted', display_name: 'Trusted', handle: 'trusted' },
      { id: 'u-low', display_name: 'Low', handle: 'low' },
    )
    // Trust: u-trusted high, u-low zero (the join is inert/zero in prod today, but we seed it
    // here to prove the ordering reads it).
    store.trust_scores.push({ profile_id: 'u-trusted', context: 'global', score: 90 })

    // Only 'a' has a near-duplicate above threshold → it must lead despite its high-trust author.
    nearestByExcludeId['a'] = [{ id: 'x', title: 'Existing A', similarity: 0.95 }]
    nearestByExcludeId['b'] = []
    nearestByExcludeId['c'] = [{ id: 'y', title: 'Existing C?', similarity: 0.5 }] // below 0.9 → not flagged

    const queue = await listReviewQueue()
    // 'a' leads (near-dup), then the two equal-trust (zero) submitters by recency desc: c before b.
    expect(queue.map((q) => q.id)).toEqual(['a', 'c', 'b'])
    // 'a' carries the dup candidate; the others do not (0.5 is below the 0.9 threshold).
    expect(queue[0].possibleDuplicateOf).toEqual({ id: 'x', title: 'Existing A', similarity: 0.95 })
    expect(queue[1].possibleDuplicateOf).toBeNull()
    expect(queue[2].possibleDuplicateOf).toBeNull()
    // Trust was read for the high-trust author.
    expect(queue.find((q) => q.id === 'a')!.submitterTrust).toBe(90)
  })

  it('returns [] when nothing is pending', async () => {
    expect(await listReviewQueue()).toEqual([])
  })
})
