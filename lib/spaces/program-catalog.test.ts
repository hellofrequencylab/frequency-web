import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  calls: [] as { table: string; predicates: [string, string, unknown][]; range?: number[] }[],
  failed: false,
  clients: 0,
}))
vi.mock('@/lib/log', () => ({ log: { warn: vi.fn() }, briefError: () => 'unavailable' }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => {
  fixture.clients++
  return { from(table: string) {
    const call = { table, predicates: [] as [string, string, unknown][], range: undefined as number[] | undefined }
    fixture.calls.push(call)
    const chain = {
      select() { return chain },
      eq(key: string, value: unknown) { call.predicates.push(['eq', key, value]); return chain },
      neq(key: string, value: unknown) { call.predicates.push(['neq', key, value]); return chain },
      not(key: string, op: string, value: unknown) { call.predicates.push([`not:${op}`, key, value]); return chain },
      order() { return chain },
      async range(from: number, to: number) {
        call.range = [from, to]
        if (fixture.failed) return { data: null, count: null, error: new Error('request RLS read unavailable') }
        const selected = (fixture.tables[table] ?? []).filter(row => call.predicates.every(([op, key, value]) => {
          if (op === 'eq') return row[key] === value
          if (op === 'neq') return row[key] !== value
          if (op === 'not:is') return row[key] != null
          throw new Error(`Unsupported predicate ${op}`)
        }))
        return { data: selected.slice(from, to + 1), count: selected.length, error: null }
      },
    }
    return chain
  } }
} }))

import { LEARNING_KINDS, learningPageNumber, readSpaceLearningPage } from './program-catalog'
import { matchPublicTwin } from '@/lib/nav/public-twin'

beforeEach(() => { fixture.tables = {}; fixture.calls = []; fixture.failed = false; fixture.clients = 0 })

describe('Space learning is a public catalog under request RLS', () => {
  it('refuses other tenants, paused Programs and channels without Program blueprints', async () => {
    const row = { id: 'p1', name: 'Public Program', slug: 'public', description: null, owner_space_id: 'space-a', is_active: true, template_id: 'template' }
    fixture.tables.topical_channels = [row, { ...row, id: 'other', owner_space_id: 'space-b' }, { ...row, id: 'paused', is_active: false }, { ...row, id: 'channel', template_id: null }]
    expect((await readSpaceLearningPage('space-a', 'program')).items.map(item => item.id)).toEqual(['p1'])
    expect(fixture.clients).toBe(1)
    expect((await readSpaceLearningPage('space-a', 'program')).items[0].href).toBe('/channels/p1')
    expect(matchPublicTwin('/channels/p1')).toEqual({ segment: 'p1', lookup: 'channel' })
    expect(fixture.calls[0].predicates).toContainEqual(['eq', 'owner_space_id', 'space-a'])
  })
  it('does not turn owner-readable drafts, private or unlisted Journeys into public discovery', async () => {
    // The mock deliberately returns all owner-visible rows before the explicit discovery filters.
    const row = { id: 'j1', title: 'Published', slug: 'published', summary: null, space_id: 'space-a', visibility: 'public', status: 'draft', published_at: '2026-11-04T00:00:00Z' }
    fixture.tables.journey_plans = [row, { ...row, id: 'other', space_id: 'space-b' }, { ...row, id: 'private', visibility: 'private' }, { ...row, id: 'unlisted', visibility: 'unlisted' }, { ...row, id: 'unpublished', published_at: null }, { ...row, id: 'rejected', status: 'rejected' }]
    const result = await readSpaceLearningPage('space-a', 'journey')
    expect(result.items.map(item => item.id)).toEqual(['j1'])
    expect(result.items[0].href).toBe('/journeys/published')
    expect(matchPublicTwin(result.items[0].href)).toEqual({ segment: 'published', path: '/discover/journeys/published' })
    expect(fixture.calls[0].predicates).toContainEqual(['not:is', 'published_at', null])
  })
  it('refuses other-tenant, private and unapproved Practices even for an owner-readable response', async () => {
    const row = { id: 'practice', title: 'Public practice', description: null, space_id: 'space-a', is_public: true, status: 'approved' }
    fixture.tables.practices = [row, { ...row, id: 'other', space_id: 'space-b' }, { ...row, id: 'private', is_public: false }, { ...row, id: 'pending', status: 'pending' }, { ...row, id: 'draft', status: 'draft' }]
    const result = await readSpaceLearningPage('space-a', 'practice')
    expect(result.items.map(item => item.id)).toEqual(['practice'])
    expect(result.items[0].href).toBe('/practices/practice')
    expect(matchPublicTwin(result.items[0].href)).toEqual({ segment: 'practice', path: '/discover/practices/practice' })
  })
  it('paginates inside the tenant filter and preserves the full public total', async () => {
    fixture.tables.practices = Array.from({ length: 25 }, (_, n) => ({ id: `practice-${n}`, title: `Practice ${n}`, space_id: 'space-a', is_public: true, status: 'approved' }))
    const result = await readSpaceLearningPage('space-a', 'practice', 2)
    expect(result.total).toBe(25)
    expect(result.items).toHaveLength(12)
    expect(result.items[0].id).toBe('practice-12')
    expect(fixture.calls[0].range).toEqual([12, 23])
    expect(fixture.calls[0].predicates).toContainEqual(['eq', 'space_id', 'space-a'])
    expect((await readSpaceLearningPage('space-a', 'practice', 99)).items).toEqual([])
  })
  it('reports read failures distinctly from a legitimately empty catalog, without a fallback client', async () => {
    for (const kind of LEARNING_KINDS) {
      expect(await readSpaceLearningPage('space-a', kind)).toMatchObject({ items: [], total: 0, unavailable: false })
    }
    fixture.failed = true
    for (const kind of LEARNING_KINDS) {
      expect(await readSpaceLearningPage('space-a', kind)).toMatchObject({ items: [], total: 0, unavailable: true })
    }
    expect(fixture.clients).toBe(6)
    expect(fixture.calls).toHaveLength(6)
  })
  it('bounds malformed pagination and never queries a missing tenant', async () => {
    expect(learningPageNumber('0')).toBe(1)
    expect(learningPageNumber('-1')).toBe(1)
    expect(learningPageNumber('1e6')).toBe(1)
    expect(learningPageNumber('100000')).toBe(1)
    expect(learningPageNumber(['2', '3'])).toBe(2)
    expect((await readSpaceLearningPage('', 'practice')).items).toEqual([])
    expect(fixture.clients).toBe(0)
  })
})
