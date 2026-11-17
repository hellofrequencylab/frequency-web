// FH-031: the finale reader over a fake service-role client, with the real projection on top. Proves
// the reads are scoped to the host Event and the signed-in player, and that the four refusals hold end
// to end: full Event, absent ticket, wrong Event, refunded ticket.
import { beforeEach, describe, expect, it, vi } from 'vitest'

type R = Record<string, unknown>
const tables: Record<string, R[]> = {}
let going = 0

function query(table: string) {
  const filters: [string, unknown][] = []
  const rows = () => (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v))
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => (filters.push([c, v]), q),
    limit: () => q,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(res),
  }
  return q
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => query(t) }) }))
vi.mock('@/lib/events/capacity', () => ({ getCapacityInfo: async () => ({ capacity: 2, going, spotsLeft: Math.max(0, 2 - going), isFull: going >= 2 }) }))

import { loadRallyFinale } from './rally-finale-store'

const EVENT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const NOW = '2026-11-16T12:00:00Z'
const ticket = (over: R = {}): R => ({ id: 't1', event_id: EVENT, buyer_profile_id: 'player', status: 'succeeded', refunded_at: null, attended_at: null, ...over })
const access = async () => {
  const p = await loadRallyFinale('run-1', 'player', NOW)
  return p && p.kind !== 'none' ? p.access : p
}

beforeEach(() => {
  going = 1
  tables.hunt_runs = [{ id: 'run-1', hunt_id: 'h1', version_id: 'v1', state: 'completed', subject_profile_id: 'player' }]
  tables.hunts = [{ id: 'h1', owner_space_id: 'home' }]
  tables.hunt_versions = [{ id: 'v1', hunt_id: 'h1', policy: { finale: { event_id: EVENT } } }]
  tables.hunt_partners = []
  tables.events = [
    { id: EVENT, title: 'Rally night', slug: 'rally-night', starts_at: null, capacity: 2, is_cancelled: false, status: 'published', removed_at: null, host_space_id: 'home', space_id: null },
    { id: OTHER, title: 'Other night', slug: 'other-night', starts_at: null, capacity: null, is_cancelled: false, status: 'published', removed_at: null, host_space_id: 'home', space_id: null },
  ]
  tables.event_rsvps = []
  tables.event_tickets = []
  tables.engagement_events = []
})

describe('the finale reader', () => {
  it('admits a finished player who holds a paid ticket for the host Event', async () => {
    tables.event_tickets = [ticket()]
    expect(await access()).toEqual({ allowed: true, via: 'ticket' })
  })

  it('full Event: refuses a finished player with no seat', async () => {
    going = 2
    expect(await access()).toEqual({ allowed: false, reason: 'event_full' })
  })

  it('absent ticket: refuses with room to spare', async () => {
    expect(await access()).toEqual({ allowed: false, reason: 'no_seat' })
  })

  it('wrong Event: a ticket for another Event is never loaded', async () => {
    tables.event_tickets = [ticket({ event_id: OTHER })]
    tables.event_rsvps = [{ id: 'r1', event_id: OTHER, profile_id: 'player', status: 'going', approval_status: 'none', attended_at: null }]
    expect(await access()).toEqual({ allowed: false, reason: 'no_seat' })
  })

  it('refunded ticket: refuses', async () => {
    tables.event_tickets = [ticket({ status: 'refunded', refunded_at: '2026-11-10T00:00:00Z' })]
    expect(await access()).toEqual({ allowed: false, reason: 'ticket_refunded' })
  })

  it('never counts another person’s seat', async () => {
    tables.event_tickets = [ticket({ buyer_profile_id: 'someone-else' })]
    tables.event_rsvps = [{ id: 'r1', event_id: EVENT, profile_id: 'someone-else', status: 'going', approval_status: 'none', attended_at: null }]
    expect(await access()).toEqual({ allowed: false, reason: 'no_seat' })
  })

  it('reads nothing for a run that is not the caller’s', async () => {
    expect(await loadRallyFinale('run-1', 'someone-else', NOW)).toBeNull()
  })

  it('treats a removed or cancelled Event as no finale', async () => {
    tables.event_tickets = [ticket()]
    tables.events[0].removed_at = '2026-11-15T00:00:00Z'
    expect(await access()).toEqual({ allowed: false, reason: 'event_unavailable' })
    tables.events[0].removed_at = null
    tables.events[0].is_cancelled = true
    expect(await access()).toEqual({ allowed: false, reason: 'event_unavailable' })
  })

  it('accepts a partner Space’s Event only while that partner is live', async () => {
    tables.event_tickets = [ticket()]
    tables.events[0].host_space_id = 'venue'
    expect(await access()).toEqual({ allowed: false, reason: 'event_unavailable' })
    tables.hunt_partners = [{ hunt_id: 'h1', space_id: 'venue', status: 'accepted', effective_at: '2026-11-01T00:00:00Z', revoked_at: null }]
    expect(await access()).toEqual({ allowed: true, via: 'ticket' })
    tables.hunt_partners = [{ hunt_id: 'h1', space_id: 'venue', status: 'withdrawn', effective_at: '2026-11-01T00:00:00Z', revoked_at: '2026-11-10T00:00:00Z' }]
    expect(await access()).toEqual({ allowed: false, reason: 'event_unavailable' })
  })

  it('projects nothing for a Hunt with no finale', async () => {
    tables.hunt_versions[0].policy = {}
    expect(await loadRallyFinale('run-1', 'player', NOW)).toEqual({ kind: 'none' })
  })
})
