import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, subjects: {} as Record<string, Record<string, unknown>[]> }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  let rows = [...(state.tables[table] ?? [])]
  const chain = {
    select: () => chain,
    eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return chain },
    in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return chain },
    is: (key: string, value: unknown) => { rows = rows.filter(row => (row[key] ?? null) === value); return chain },
    gte: (key: string, value: string) => { rows = rows.filter(row => String(row[key]) >= value); return chain },
    lt: (key: string, value: string) => { rows = rows.filter(row => String(row[key]) < value); return chain },
    order: () => chain, range: () => chain,
    then: (resolve: (r: unknown) => void) => resolve({ data: rows, error: null }),
  }
  return chain
} }) }))
vi.mock('./cross-listing-store', () => ({ acceptedCrossListingSubjects: async (kind: string, target: string) => state.subjects[`${kind}:${target}`] ?? [] }))
vi.mock('@/lib/calendar/public-month', () => ({ spaceEventRowsToItems: async (rows: { slug: string; title: string; starts_at: string }[]) => rows.map(row => ({ slug: row.slug, title: row.title, dayKey: row.starts_at.slice(0, 10), layer: 'events' })) }))
import { livePartnerSpaceIds } from './partners-live-store'
import { incomingPartnerInvites, loadPartnersCalendarWindow, loadPartnersView } from './partners-store'

const space = (id: string, owner: string, extra: Record<string, unknown> = {}) => ({ id, slug: id, name: id.toUpperCase(), brand_name: null, brand_logo_url: null, owner_profile_id: owner, plan: 'free', status: 'active', visibility: 'network', parent_id: null, type: 'business', ...extra })
const partnership = (id: string, partner: string, status: string, responder: string | null) => ({ id, hub_space_id: 'hub', partner_space_id: partner, status, invited_by: 'hub-owner', responded_by: responder })
const event = (id: string, home: string, extra: Record<string, unknown>) => ({ id, slug: id, title: id, starts_at: '2026-10-20T18:00:00Z', ends_at: null, location: null, time_zone: null, is_cancelled: false, plan_id: null, status: 'published', visibility: 'public', removed_at: null, is_demo: false, space_id: home, scope_id: null, scope_type: null, ...extra })

beforeEach(() => {
  state.tables = {
    spaces: [space('hub', 'hub-owner', { plan: 'collective' }), space('p1', 'ana'), space('p2', 'ben'), space('p3', 'cy'), space('moved', 'new-owner')],
    collective_partners: [partnership('a1', 'p1', 'accepted', 'ana'), partnership('a2', 'p2', 'accepted', 'ben'), partnership('w1', 'p3', 'pending', null), partnership('stale', 'moved', 'accepted', 'old-owner')],
    events: [],
  }
  state.subjects = {
    'circle:hub': [{ id: 'c1', slug: 'c1', name: 'Morning Run', space_id: 'p1' }, { id: 'c9', slug: 'c9', name: 'Elsewhere', space_id: 'outside' }],
    'journey:p2': [{ id: 'j1', slug: 'j1', title: 'Arc', space_id: 'p1' }],
  }
})

describe('livePartnerSpaceIds', () => {
  it('counts accepted partnerships that still match today\'s owners and a live hub', async () => {
    expect([...await livePartnerSpaceIds(['p1', 'p2', 'p3', 'moved', 'hub'])].sort()).toEqual(['p1', 'p2'])
    state.tables.spaces[0].plan = 'business'
    expect((await livePartnerSpaceIds(['p1', 'p2'])).size).toBe(0)
  })
})

describe('loadPartnersView', () => {
  it('lists live partners, pending invites and the listings inside the Collective', async () => {
    const view = (await loadPartnersView('hub'))!
    expect(view.partners.map(p => p.id)).toEqual(['p1', 'p2'])
    expect(view.pending.map(p => p.id)).toEqual(['p3'])
    expect(view.slotsLeft).toBe(10 - 4)
    expect(view.listings.map(l => l.id)).toEqual(['j1', 'c1'])
    expect(view.partners[0].listings.map(l => l.id)).toEqual(['j1', 'c1'])
  })
  it('has no Partners view for a Space that is not a Collective hub', async () => {
    expect(await loadPartnersView('p1')).toBeNull()
  })
})

describe('loadPartnersCalendarWindow', () => {
  it('shows only public events homed at the listing\'s source Space', async () => {
    state.tables.events = [
      event('run', 'p1', { scope_type: 'circle', scope_id: 'c1' }),
      event('hijack', 'p2', { scope_type: 'circle', scope_id: 'c1' }),
      event('arc', 'p1', { plan_id: 'j1' }),
      event('private', 'p1', { scope_type: 'circle', scope_id: 'c1', visibility: 'private' }),
      event('unlisted-subject', 'p1', { scope_type: 'circle', scope_id: 'c-other' }),
    ]
    const view = (await loadPartnersView('hub'))!
    const items = await loadPartnersCalendarWindow(view, '2026-10-01', '2026-11-01')
    expect(items.map(i => i.slug).sort()).toEqual(['arc', 'run'])
    expect(items.every(i => i.sourceLabel === 'P1')).toBe(true)
  })
  it('refuses an unbounded window', async () => {
    await expect(loadPartnersCalendarWindow({ listings: [], names: {} }, '2026-01-01', '2026-12-01')).rejects.toThrow('Invalid calendar window')
  })
})

describe('incomingPartnerInvites', () => {
  it('shows the partner owner a pending invite and a live partnership, never a stale one', async () => {
    expect((await incomingPartnerInvites('p3')).map(i => [i.hubSlug, i.status])).toEqual([['hub', 'pending']])
    expect((await incomingPartnerInvites('p1')).map(i => i.status)).toEqual(['accepted'])
    expect(await incomingPartnerInvites('moved')).toEqual([])
  })
})
