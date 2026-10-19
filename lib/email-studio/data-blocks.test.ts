import { describe, it, expect, vi } from 'vitest'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
import type { EntityLayout } from '@/lib/entity-blocks/layout'

// EMAIL-025: the Event and Circle cards refresh from the live row at send, exactly as the Product card does.
// What is pinned: a placed card's snapshot is overwritten by the live row (title, date line, venue, cover,
// link), a removed row keeps the last-known snapshot, hidden and benched nodes stay as stored, the legacy
// one-bag layout resolves too, the input is never mutated, and the listing reads scope to one Space.

const events: Record<string, Record<string, unknown>> = {
  e1: {
    id: 'e1', slug: 'river-walk', title: 'River walk', starts_at: '2026-11-07T17:00:00Z', time_zone: 'America/Los_Angeles',
    venue_name: 'Moonlight Beach', city: 'Encinitas', hide_address: false, is_cancelled: false, removed_at: null,
    cover_image_path: 'covers/e1.jpg', poster_path: null, details: null,
  },
  e2: {
    id: 'e2', slug: 'quiet-hour', title: 'Quiet hour', starts_at: '2026-11-09T02:00:00Z', time_zone: 'America/Los_Angeles',
    venue_name: 'A private home', city: 'Carlsbad', hide_address: true, is_cancelled: true, removed_at: null,
    cover_image_path: null, poster_path: null, details: null,
  },
}
const circles: Record<string, Record<string, unknown>> = {
  c1: { id: 'c1', slug: 'dawn-swimmers', name: 'Dawn swimmers', about: 'We swim at first light. Every week, rain or shine, and then coffee after on the sand.', image_url: 'https://cdn.test/c1.jpg', status: 'active' },
}

function table(rows: Record<string, Record<string, unknown>>) {
  const state = { id: '', status: null as string[] | null, space: '' }
  const api: Record<string, unknown> = {}
  const chain = () => api
  Object.assign(api, {
    select: chain,
    eq: (col: string, v: string) => { if (col === 'id') state.id = v; if (col === 'space_id') state.space = v; return api },
    is: chain, gte: chain, order: chain, limit: chain,
    or: (expr: string) => { state.space = expr; return api },
    in: (_: string, v: string[]) => { state.status = v; return api },
    maybeSingle: async () => {
      const row = rows[state.id]
      if (!row) return { data: null }
      if (state.status && !state.status.includes(String(row.status))) return { data: null }
      return { data: row }
    },
    then: (resolve: (v: unknown) => void) => resolve({ data: Object.values(rows).filter(() => !state.space || String(state.space).includes('sp1')) }),
  })
  return api
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (name: string) => table(name === 'events' ? events : circles) }),
}))
vi.mock('@/lib/events/hero-url', () => ({
  resolveEventHeroUrl: async (ev: { cover_image_path?: string | null }) => (ev.cover_image_path ? `https://media.test/${ev.cover_image_path}` : null),
}))

import { resolveDataBlockRefs, loadEventSnapshot, loadCircleSnapshot, listSpaceCircleSnapshots, eventWhereLine, circleBlurb } from './data-blocks'

describe('loadEventSnapshot / loadCircleSnapshot', () => {
  it('turns a live event into the card snapshot: title, date line, venue line, cover and link', async () => {
    const snap = await loadEventSnapshot('e1')
    expect(snap).not.toBeNull()
    expect(snap!.title).toBe('River walk')
    expect(snap!.when).toMatch(/Nov/)
    expect(snap!.where).toBe('Moonlight Beach, Encinitas')
    expect(snap!.image).toBe('https://media.test/covers/e1.jpg')
    expect(snap!.url).toMatch(/\/events\/river-walk$/)
  })
  it('hides the venue when the host hides the address, and marks a cancelled event', async () => {
    const snap = await loadEventSnapshot('e2')
    expect(snap!.where).toBe('Carlsbad')
    expect(snap!.title).toBe('Cancelled: Quiet hour')
    expect(snap!.image).toBe('')
  })
  it('returns null for a row that is gone', async () => {
    expect(await loadEventSnapshot('nope')).toBeNull()
    expect(await loadCircleSnapshot('nope')).toBeNull()
  })
  it('turns a live circle into the card snapshot with a bounded blurb', async () => {
    const snap = await loadCircleSnapshot('c1')
    expect(snap!.title).toBe('Dawn swimmers')
    expect(snap!.blurb.length).toBeLessThanOrEqual(164)
    expect(snap!.image).toBe('https://cdn.test/c1.jpg')
    expect(snap!.url).toMatch(/\/circles\/dawn-swimmers$/)
  })
  it('lists a Space\'s circles with their ids', async () => {
    const rows = await listSpaceCircleSnapshots('sp1')
    expect(rows.map((r) => r.id)).toEqual(['c1'])
  })
})

describe('resolveDataBlockRefs', () => {
  it('refreshes each placed card from the live row, keeps a missing snapshot and hidden or benched nodes, and never mutates', async () => {
    const layout: NodeLayout = {
      rows: [{ id: 'r0', columns: 1, cells: [[
        { nid: 'nevent001', type: 'eventCard', content: { event: { id: 'e1' }, title: 'Old title', when: 'Old date', ctaLabel: 'Save a seat' } },
        { nid: 'nevent002', type: 'eventCard', content: { event: { id: 'gone' }, title: 'Last snapshot' } },
        { nid: 'ncirc0001', type: 'circleCard', content: { circle: { id: 'c1' }, title: 'Old name', image: 'https://old.test/x.jpg' } },
        { nid: 'nhidden01', type: 'eventCard', hidden: true, content: { event: { id: 'e1' }, title: 'Hidden stays' } },
        { nid: 'ntext0001', type: 'text', content: { text: 'Untouched' } },
      ]] }],
      bench: [{ nid: 'nbench001', type: 'circleCard', content: { circle: { id: 'c1' }, title: 'Bench stays' } }],
    }
    const before = JSON.stringify(layout)
    const out = await resolveDataBlockRefs(layout)
    const cells = out.rows[0].cells[0]
    expect(cells[0].content).toMatchObject({ title: 'River walk', where: 'Moonlight Beach, Encinitas', ctaLabel: 'Save a seat', event: { id: 'e1' } })
    expect(cells[0].content?.when).toMatch(/Nov/)
    expect(cells[1].content?.title).toBe('Last snapshot')
    expect(cells[2].content).toMatchObject({ title: 'Dawn swimmers', image: 'https://cdn.test/c1.jpg' })
    expect(cells[3].content?.title).toBe('Hidden stays')
    expect(cells[4].content?.text).toBe('Untouched')
    expect(out.bench).toEqual(layout.bench)
    expect(JSON.stringify(layout)).toBe(before)
  })
  it('resolves the legacy one-bag layout too', async () => {
    const layout: EntityLayout = {
      rows: [{ id: 'r0', columns: 1, cells: [['eventCard', 'circleCard']] }],
      content: { eventCard: { event: { id: 'e1' }, title: 'Old' }, circleCard: { circle: { id: 'c1' } } },
    }
    const out = await resolveDataBlockRefs(layout)
    expect((out.content?.eventCard as Record<string, unknown>).title).toBe('River walk')
    expect((out.content?.circleCard as Record<string, unknown>).title).toBe('Dawn swimmers')
    expect((layout.content?.eventCard as Record<string, unknown>).title).toBe('Old')
  })
  it('keeps a snapshot field when the live value is empty (a cover that failed to sign is not no cover)', async () => {
    const layout: EntityLayout = {
      rows: [{ id: 'r0', columns: 1, cells: [['eventCard']] }],
      content: { eventCard: { event: { id: 'e2' }, image: 'https://old.test/kept.jpg' } },
    }
    const out = await resolveDataBlockRefs(layout)
    expect((out.content?.eventCard as Record<string, unknown>).image).toBe('https://old.test/kept.jpg')
  })
  it('leaves a layout with no data cards alone', async () => {
    const layout: EntityLayout = { rows: [{ id: 'r0', columns: 1, cells: [['text']] }], content: { text: { text: 'hi' } } }
    expect(await resolveDataBlockRefs(layout)).toBe(layout)
  })
})

describe('helpers', () => {
  it('eventWhereLine joins venue and city, and drops a hidden venue', () => {
    expect(eventWhereLine({ venue_name: 'Hall', city: 'Vista', hide_address: false })).toBe('Hall, Vista')
    expect(eventWhereLine({ venue_name: 'Hall', city: 'Vista', hide_address: true })).toBe('Vista')
    expect(eventWhereLine({ venue_name: 'Vista', city: 'Vista', hide_address: false })).toBe('Vista')
    expect(eventWhereLine({ venue_name: null, city: null, hide_address: false })).toBe('')
  })
  it('circleBlurb bounds long copy at a word and keeps short copy whole', () => {
    expect(circleBlurb('Short and sweet.')).toBe('Short and sweet.')
    const long = circleBlurb('word '.repeat(60))
    expect(long.length).toBeLessThanOrEqual(164)
    expect(long.endsWith('...')).toBe(true)
  })
})
