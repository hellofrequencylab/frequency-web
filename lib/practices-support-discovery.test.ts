import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { applyPracticePillarFilter, practiceSupportIds, practiceSupportsPillar } from './practices/support-filter'

const MIND = '11111111-1111-4111-8111-111111111111'
const BODY = '22222222-2222-4222-8222-222222222222'
const SPIRIT = '33333333-3333-4333-8333-333333333333'
const EXPRESSION = '44444444-4444-4444-8444-444444444444'
type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {}
const queries: { table: string; operations: string[] }[] = []

function from(table: string) {
  const predicates: ((row: Row) => boolean)[] = []
  const orders: { column: string; ascending: boolean }[] = []
  const operations: string[] = []
  queries.push({ table, operations })
  let head = false
  const result = (start = 0, end = Number.MAX_SAFE_INTEGER) => {
    const matched = (tables[table] ?? []).filter((row) => predicates.every((p) => p(row)))
    const sorted = [...matched].sort((a, b) => {
      for (const { column, ascending } of orders) {
        if (a[column] === b[column]) continue
        const comparison = (a[column] as string | number) < (b[column] as string | number) ? -1 : 1
        return ascending ? comparison : -comparison
      }
      return 0
    })
    return { data: head ? null : sorted.slice(start, end + 1), count: matched.length, error: null }
  }
  const api: Record<string, unknown> = {
    select: (_columns: unknown, opts?: { head?: boolean }) => { head = opts?.head === true; return api },
    eq: (column: string, value: unknown) => { operations.push(`eq:${column}`); predicates.push((row) => row[column] === value); return api },
    in: (column: string, values: unknown[]) => { predicates.push((row) => values.includes(row[column])); return api },
    is: (column: string, value: unknown) => { predicates.push((row) => (row[column] ?? null) === value); return api },
    or: (clause: string) => {
      operations.push(`or:${clause}`)
      const support = clause.match(/^domain_id\.eq\.([a-f0-9-]+),secondary_domain_id\.eq\.\1,focus_details\.cs\.(.+)$/)
      if (support) {
        const id = support[1]
        const object = JSON.parse(support[2])
        expect(object).toEqual({ [id]: {} })
        predicates.push((row) => {
          const details = row.focus_details as Record<string, unknown> | null
          const value = details && Object.hasOwn(details, id) ? details[id] : null
          return row.domain_id === id || row.secondary_domain_id === id || !!value && typeof value === 'object' && !Array.isArray(value)
        })
      } else if (clause.includes('ilike')) {
        const needle = clause.match(/title\.ilike\.%([^%]+)%/)?.[1]?.toLowerCase() ?? ''
        predicates.push((row) => ['title', 'summary', 'description'].some((key) => String(row[key] ?? '').toLowerCase().includes(needle)))
      } else {
        const cursor = clause.match(/^score\.lt\.([\d.]+),and\(score\.eq\.([\d.]+),id\.gt\.([^)]+)\)$/)
        if (!cursor) throw new Error('Unexpected OR filter')
        predicates.push((row) => Number(row.score) < Number(cursor[1]) || Number(row.score) === Number(cursor[2]) && String(row.id) > cursor[3])
      }
      return api
    },
    order: (column: string, opts: { ascending: boolean }) => { orders.push({ column, ascending: opts.ascending }); return api },
    range: async (start: number, end: number) => { operations.push('range'); return result(start, end) },
    limit: async (limit: number) => { operations.push('limit'); return result(0, limit - 1) },
    maybeSingle: async () => ({ data: result().data?.[0] ?? null, error: null }),
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
const { searchLibraryPractices, searchAdminPractices, countAdminPractices, resolveAdminPracticeIds, searchAdminFacets } = await import('./practices')

function practice(id: string, over: Row = {}): Row {
  return { id, title: 'Quiet walk', summary: 'A quiet walk', description: null, domain_id: BODY,
    secondary_domain_id: null, focus_details: {}, is_public: true, is_demo: false, is_template: false,
    status: 'approved', subcategory_id: null, created_by: null, header_image: null, body: 'Walk',
    weight_class: 'light', created_at: '2026-11-14T00:00:00Z', score: 10, logs_total: 1,
    logs_30d: 1, adopters: 1, featured_at: null, slug: id, ...over }
}

beforeEach(() => {
  queries.length = 0
  for (const key of Object.keys(tables)) delete tables[key]
  tables.practices = []
  tables.practices_ranked = []
})

function seed(rows: Row[]) {
  tables.practices = rows
  tables.practices_ranked = rows
}

describe('current multi-focus practice discovery', () => {
  it('finds primary, secondary, third and fourth authored focuses without duplicate rows', async () => {
    seed([
      practice('a', { domain_id: MIND, secondary_domain_id: MIND, focus_details: { [MIND]: {} } }),
      practice('b', { secondary_domain_id: MIND }),
      practice('c', { focus_details: { [BODY]: {}, [SPIRIT]: {}, [MIND]: { instructions: 'Notice your breath' } } }),
      practice('d', { focus_details: { [BODY]: {}, [SPIRIT]: {}, [EXPRESSION]: {}, [MIND]: {} } }),
      practice('e'),
    ])
    const result = await searchLibraryPractices({ pillarId: MIND })
    expect(result.rows.map((row) => row.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(result.total).toBe(4)
    expect(new Set(result.rows.map((row) => row.id)).size).toBe(4)
  })

  it.each(['trending', 'top', 'new', 'az'] as const)('filters before %s pagination and uses a stable id tie-break', async (sort) => {
    seed([practice('z'), practice('d', { secondary_domain_id: MIND }), practice('a', { focus_details: { [MIND]: {} } }), practice('c', { domain_id: MIND }), practice('b', { secondary_domain_id: MIND })])
    const first = await searchLibraryPractices({ pillarId: MIND, pageSize: 2, sort })
    const second = await searchLibraryPractices({ pillarId: MIND, pageSize: 2, page: 2, sort })
    expect(first.rows.map((row) => row.id)).toEqual(['a', 'b'])
    expect(second.rows.map((row) => row.id)).toEqual(['c', 'd'])
    expect([first.total, second.total]).toEqual([4, 4])
    expect(first.pageCount).toBe(2)
    for (const query of queries.filter((q) => q.table === 'practices_ranked')) {
      expect(query.operations.findIndex((op) => op.startsWith('or:domain_id'))).toBeLessThan(query.operations.indexOf('range'))
    }
  })

  it('keeps public, demo and template restrictions conjunctive with supports', async () => {
    seed([
      practice('public', { secondary_domain_id: MIND, is_template: true }),
      practice('private', { secondary_domain_id: MIND, is_public: false }),
      practice('draft', { secondary_domain_id: MIND, status: 'draft', is_public: false }),
      practice('demo', { secondary_domain_id: MIND, is_demo: true, is_template: true }),
      practice('not-template', { secondary_domain_id: MIND }),
    ])
    const result = await searchLibraryPractices({ pillarId: MIND, hideDemo: true, templatesOnly: true })
    expect(result.rows.map((row) => row.id)).toEqual(['public'])
    expect(result.total).toBe(1)
  })

  it('combines text matching with support instead of overwriting one OR predicate', async () => {
    seed([practice('yes', { secondary_domain_id: MIND }), practice('other-title', { secondary_domain_id: MIND, title: 'Sing', summary: 'Sing together' }), practice('other-support')])
    expect((await searchLibraryPractices({ pillarId: MIND, q: 'quiet' })).rows.map((row) => row.id)).toEqual(['yes'])
  })

  it('uses identical admin support predicates for rows, exact count, keyset and bulk', async () => {
    seed([practice('d', { secondary_domain_id: MIND }), practice('a', { domain_id: MIND }), practice('b', { focus_details: { [MIND]: {} }, is_public: false }), practice('c', { focus_details: { [MIND]: {} } }), practice('e')])
    const opts = { pillarId: MIND, includeHidden: false, pageSize: 2 }
    const first = await searchAdminPractices(opts)
    const second = await searchAdminPractices({ ...opts, cursor: first.nextCursor })
    expect(first.rows.map((row) => row.id)).toEqual(['a', 'c'])
    expect(second.rows.map((row) => row.id)).toEqual(['d'])
    expect(first.total).toBe(3)
    expect(await countAdminPractices(opts)).toBe(3)
    const resolved = await resolveAdminPracticeIds(opts)
    expect(resolved.capped).toBe(false)
    expect(new Set(resolved.ids)).toEqual(new Set(['a', 'c', 'd']))
    expect((await searchAdminPractices({ ...opts, includeHidden: true })).total).toBe(4)
  })

  it('keeps admin offset pages stable under tied alternate sort values', async () => {
    seed([practice('c', { secondary_domain_id: MIND }), practice('a', { secondary_domain_id: MIND }), practice('b', { secondary_domain_id: MIND })])
    expect((await searchAdminPractices({ pillarId: MIND, sort: 'az', pageSize: 2 })).rows.map((row) => row.id)).toEqual(['a', 'b'])
    expect((await searchAdminPractices({ pillarId: MIND, sort: 'az', pageSize: 2, page: 2 })).rows.map((row) => row.id)).toEqual(['c'])
  })

  it('matches residual facet counts to the table including each mixed support once', async () => {
    seed([practice('a', { domain_id: MIND, secondary_domain_id: SPIRIT, focus_details: { [MIND]: {}, [SPIRIT]: {} } }), practice('b', { secondary_domain_id: MIND, focus_details: { [MIND]: {}, [EXPRESSION]: {} } }), practice('c')])
    const facets = await searchAdminFacets({ includeHidden: false })
    for (const bucket of facets.pillar) {
      expect(bucket.count).toBe(await countAdminPractices({ pillarId: bucket.key, includeHidden: false }))
    }
    expect(facets.pillar.find((bucket) => bucket.key === MIND)?.count).toBe(2)
    expect((await searchAdminFacets({ includeHidden: false, pillarId: MIND })).flag.public).toBe(2)
  })

  it.each(['bad),is_public.eq.false', '"quoted"', '__proto__', '{"x":1}', '11111111-1111-4111-8111-11111111111'])('never interpolates malformed support %s into filter grammar', async (pillarId) => {
    seed([practice('a', { domain_id: MIND })])
    expect((await searchLibraryPractices({ pillarId })).rows).toEqual([])
    for (const query of queries.filter((q) => q.table === 'practices_ranked')) {
      expect(query.operations.some((op) => op.startsWith('or:'))).toBe(false)
    }
  })

  it('normalizes a valid uppercase UUID before constructing the filter', () => {
    const calls: string[] = []
    const query = { eq: () => query, or: (value: string) => { calls.push(value); return query } }
    applyPracticePillarFilter(query, 'ABCDEFAB-1234-4567-89AB-ABCDEFABCDEF')
    expect(calls[0]).toContain('domain_id.eq.abcdefab-1234-4567-89ab-abcdefabcdef')
  })

  it('ignores malformed focus entries and keeps current support independent from rewards', () => {
    const row = { domain_id: BODY, secondary_domain_id: SPIRIT, focus_details: { [MIND]: {}, [BODY]: {}, [EXPRESSION]: null, invalid: {} } }
    expect(practiceSupportIds(row)).toEqual([BODY, SPIRIT, MIND])
    expect(practiceSupportsPillar(row, EXPRESSION)).toBe(false)
    expect(practiceSupportsPillar(row, MIND)).toBe(true)
    expect(practiceSupportIds({ domain_id: null, focus_details: [] })).toEqual([])
  })

  it('keeps the real PostgREST SDK support OR independent from text OR and paging', async () => {
    let requested: URL | null = null
    const client = createClient('https://fixture.supabase.test', 'synthetic-key', { auth: { persistSession: false }, global: {
      fetch: async (input) => { requested = new URL(String(input)); return new Response('[]', { status: 200, headers: { 'content-type': 'application/json', 'content-range': '*/0' } }) },
    } })
    const query = applyPracticePillarFilter(client.from('practices_ranked').select('id', { count: 'exact' }).eq('is_public', true), MIND)
    await query.or('title.ilike.%quiet%,summary.ilike.%quiet%').order('id').range(0, 9)
    const url = requested as URL | null
    expect(url?.searchParams.getAll('or')).toHaveLength(2)
    expect(url?.searchParams.getAll('or')[0]).toContain(`focus_details.cs.{"${MIND}":{}}`)
    expect(url?.searchParams.get('is_public')).toBe('eq.true')
    expect(url?.searchParams.get('offset')).toBe('0')
    expect(url?.searchParams.get('limit')).toBe('10')
  })
})
