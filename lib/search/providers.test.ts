import { it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, errors: new Set<string>() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }))
vi.mock('@/lib/platform-flags', () => ({ demoModeEnabled: async () => false }))
vi.mock('@/lib/demo-preference', () => ({ viewerHidesDemo: async () => true }))

/** In-memory executor applies real provider predicates, so private rows compete in the same
 * query window as public matches rather than being hand-removed from mock responses. */
function from(table: string) {
  let rows = [...(state.tables[table] ?? [])]
  const query = {
    select: () => query,
    eq: (field: string, value: unknown) => { rows = rows.filter((r) => r[field] === value); return query },
    neq: (field: string, value: unknown) => { rows = rows.filter((r) => r[field] !== value); return query },
    is: (field: string, value: unknown) => { rows = rows.filter((r) => (r[field] ?? null) === value); return query },
    in: (field: string, values: unknown[]) => { rows = rows.filter((r) => values.includes(r[field])); return query },
    gte: (field: string, value: string) => { rows = rows.filter((r) => String(r[field]) >= value); return query },
    lt: (field: string, value: string) => { rows = rows.filter((r) => String(r[field]) < value); return query },
    or: (filter: string) => { rows = rows.filter((row) => filter.split(',').some((condition) => {
      const [field, , pattern] = condition.split('.')
      const literal = pattern.slice(1, -1).replace(/\\([%_\\])/g, '$1').toLowerCase()
      return String(row[field] ?? '').toLowerCase().includes(literal)
    })); return query },
    order: () => query,
    limit: (n: number) => { rows = rows.slice(0, n); return query },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: state.errors.has(table) ? { message: 'database failure' } : null }).then(resolve),
  }
  return query
}

import { searchPeople, searchEvents, searchPractices, searchSpaces, searchCircles } from '@/app/(main)/search/search-data'
beforeEach(() => { state.tables = {}; state.errors.clear() })

it('finds the reported event with case differences and words in either order', async () => {
  const base = { title: 'Thrive on Thursday', status: 'published', visibility: 'public', is_cancelled: false, starts_at: '2099-10-15T09:00:00Z', recurrence_type: 'none', parent_event_id: null, slug: 'thrive', id: 'public' }
  state.tables.events = [base, { ...base, id: 'draft', status: 'draft' }, { ...base, id: 'private', visibility: 'private' }, { ...base, id: 'cancelled', is_cancelled: true }, { ...base, id: 'removed', removed_at: '2026-01-01' }]
  expect((await searchEvents('THURSDAY thrive')).rows.map((r) => r.id)).toEqual(['public'])
})
it('keeps hidden and ghost people out before applying a result window', async () => {
  const base = { display_name: 'Daniel Tyack', handle: 'daniel', is_active: true, directory_visible: true, ghost_mode: false }
  state.tables.profiles = [{ ...base, id: 'hidden', directory_visible: false }, { ...base, id: 'ghost', ghost_mode: true }, { ...base, id: 'public' }]
  expect((await searchPeople('Daniel', 1)).rows.map((r) => r.id)).toEqual(['public'])
})
it('discovers network Spaces without leaking independent, inactive or root Spaces', async () => {
  const base = { id: 'public', name: 'The Group', visibility: 'network', network_connected: true, status: 'active', type: 'organization' }
  state.tables.spaces = [base, { ...base, id: 'off-network', network_connected: false }, { ...base, id: 'private', visibility: 'private' }, { ...base, id: 'root', type: 'root' }, { ...base, id: 'inactive', status: 'inactive' }]
  expect((await searchSpaces('group')).rows.map((r) => r.id)).toEqual(['public'])
})
it('finds public practices and excludes private, demo and merged records', async () => {
  const base = { id: 'public', title: 'Morning Movement', is_public: true, is_demo: false }
  state.tables.practices = [base, { ...base, id: 'private', is_public: false }, { ...base, id: 'demo', is_demo: true }, { ...base, id: 'merged', merged_into: 'public' }]
  expect((await searchPractices('movement morning')).rows.map((r) => r.id)).toEqual(['public'])
})
it('does not advertise unlisted circles', async () => {
  state.tables.circles = [{ id: 'public', name: 'The Group', status: 'active', unlisted: false, is_demo: false }, { id: 'private', name: 'The Group', status: 'active', unlisted: true, is_demo: false }]
  expect((await searchCircles('Group')).rows.map((r) => r.id)).toEqual(['public'])
})
it('does not report a broken provider as an empty result', async () => {
  state.errors.add('events')
  await expect(searchEvents('thrive')).rejects.toThrow('unavailable')
})
