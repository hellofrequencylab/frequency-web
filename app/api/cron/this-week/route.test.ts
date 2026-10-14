import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { ThisWeekEventRow, ThisWeekRegion } from '@/lib/this-week'

// LIVE-806: the Thursday "This week in <region>" cron, against the real handler with every
// collaborator mocked and the pure half (lib/this-week.ts) real. The guarantees pinned here are the
// weekly digest's (scan2 L2-02, SCAN-611): a member is claimed in cron_run_markers under
// `this-week:<profile_id>:<ISO week>` BEFORE the send and a taken claim is a skip; a region with no
// upcoming public Event enqueues nothing for anyone in it; a throw is counted, released for the
// next run, and turns the response into a 500 so the heartbeat fail-pings.

type Recipient = { profileId: string; displayName: string; regionId: string; authUserId: string }

const state = vi.hoisted(() => ({
  regions: [] as { id: string; name: string; slug: string }[],
  events: [] as import("@/lib/this-week").ThisWeekEventRow[],
  recipients: [] as { profileId: string; displayName: string; regionId: string; authUserId: string }[],
  /** The region ids the route asked recipients for (the empty-region guarantee). */
  recipientReads: [] as string[][],
  /** Members whose send throws. */
  sendThrows: new Set<string>(),
  /** Members the gate says no to. */
  gated: new Set<string>(),
  /** Marker keys already claimed (a previous invocation this week). */
  claimed: new Set<string>(),
  claimInserts: [] as string[],
  releases: [] as string[],
  sends: [] as { profileId: string; regionName: string; eventIds: string[]; dedupeKey: string; to: string }[],
  logged: { error: [] as { event: string; fields?: Record<string, unknown> }[] },
}))

vi.mock('@/lib/this-week-reads', () => ({
  listRegions: () => Promise.resolve(state.regions),
  listUpcomingPublicEventsByRegion: () => Promise.resolve(state.events),
  listRecipientsInRegions: (ids: string[]) => {
    state.recipientReads.push([...ids])
    return Promise.resolve(state.recipients.filter((r) => ids.includes(r.regionId)))
  },
  recipientEmail: (authUserId: string) => Promise.resolve(authUserId === 'no-email' ? null : `${authUserId}@example.com`),
}))
vi.mock('@/lib/comms/send-gate', () => ({
  resolveSendGate: (profileId: string) =>
    Promise.resolve(state.gated.has(profileId) ? { allowed: false, reason: 'pref_off' } : { allowed: true, reason: 'ok' }),
}))
vi.mock('@/lib/email', () => ({
  sendThisWeekEmail: (p: {
    to: string
    recipientProfileId: string
    regionName: string
    events: { id: string }[]
    dedupeKey: string
  }) => {
    if (state.sendThrows.has(p.recipientProfileId)) return Promise.reject(new Error('enqueue(email) failed: db down'))
    state.sends.push({
      profileId: p.recipientProfileId,
      regionName: p.regionName,
      eventIds: p.events.map((e) => e.id),
      dedupeKey: p.dedupeKey,
      to: p.to,
    })
    return Promise.resolve()
  },
}))
/** The mocked service-role client, hoisted so the positive control below can build one WITHOUT
 *  naming the module outside vi.mock (scripts/check-admin-client.mjs counts every import of
 *  lib/supabase/admin, and a test that only mocks it is not a new RLS bypass). `from` is a METHOD
 *  that reads `this.rest`, exactly as the real SupabaseClient does, so the bind in route.ts is
 *  load-bearing here too (LIVE-053, ADR-1231). */
const makeAdminClient = vi.hoisted(() => () => {
  const rest = {
    from: (table: string) => {
      if (table !== 'cron_run_markers') throw new Error(`unexpected table ${table}`)
      return {
        insert: ({ key }: { key: string }) => {
          state.claimInserts.push(key)
          if (state.claimed.has(key)) {
            return Promise.resolve({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } })
          }
          state.claimed.add(key)
          return Promise.resolve({ error: null })
        },
        delete: () => ({
          eq: (_col: string, key: string) => {
            state.releases.push(key)
            state.claimed.delete(key)
            return Promise.resolve({ error: null })
          },
        }),
      }
    },
  }
  return {
    rest,
    from(this: { rest: typeof rest }, table: string) {
      return this.rest.from(table)
    },
  }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: makeAdminClient }))
vi.mock('@/lib/cron-auth', () => ({ rejectUnauthorizedCron: () => null }))
vi.mock('@/lib/observability/cron-heartbeat', () => ({
  withCronHeartbeat: (_name: string, handler: unknown) => handler,
}))
vi.mock('@/lib/log', () => ({
  briefError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  errorStack: (e: unknown) => (e instanceof Error ? e.stack : undefined),
  log: {
    info: () => {},
    warn: () => {},
    error: (event: string, fields?: Record<string, unknown>) => state.logged.error.push({ event, fields }),
    time: async <T,>(_event: string, fn: () => T | Promise<T>) => fn(),
  },
}))

import { GET } from './route'

const req = new Request('http://localhost/api/cron/this-week') as unknown as NextRequest

const NORTH_COUNTY: ThisWeekRegion = { id: 'r-nc', name: 'North County', slug: 'north-county' }
const CARLSBAD: ThisWeekRegion = { id: 'r-cb', name: 'Carlsbad', slug: 'carlsbad' }
const ESCONDIDO: ThisWeekRegion = { id: 'r-es', name: 'Escondido', slug: 'escondido' }

/** A public Event row inside the window of the Thursday 2026-10-15 15:00Z run (Saturday 10am PT). */
function event(id: string, regionId: string, startsAt = '2026-10-17T10:00:00'): ThisWeekEventRow {
  return {
    id,
    slug: `slug-${id}`,
    title: `Event ${id}`,
    starts_at: startsAt,
    time_zone: 'America/Los_Angeles',
    location: null,
    venue_name: null,
    city: null,
    hide_address: false,
    scope_region_id: regionId,
  }
}

function member(profileId: string, regionId: string, over: Partial<Recipient> = {}): Recipient {
  return { profileId, displayName: 'Ana', regionId, authUserId: `auth-${profileId}`, ...over }
}

beforeEach(() => {
  state.regions = [NORTH_COUNTY, CARLSBAD, ESCONDIDO]
  state.events = []
  state.recipients = []
  state.recipientReads.length = 0
  state.sendThrows.clear()
  state.gated.clear()
  state.claimed.clear()
  state.claimInserts.length = 0
  state.releases.length = 0
  state.sends.length = 0
  state.logged.error.length = 0
  // A Thursday 15:00 UTC run in ISO week 42 of 2026.
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-15T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/cron/this-week, regions and recipients', () => {
  it('sends each member their own region, with that region\'s Events only', async () => {
    state.events = [event('a', NORTH_COUNTY.id), event('b', CARLSBAD.id), event('c', NORTH_COUNTY.id, '2026-10-16T18:00:00')]
    state.recipients = [member('p1', NORTH_COUNTY.id), member('p2', CARLSBAD.id)]
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(state.sends).toEqual([
      { profileId: 'p1', regionName: 'North County', eventIds: ['c', 'a'], dedupeKey: 'this-week:p1:2026-W42', to: 'auth-p1@example.com' },
      { profileId: 'p2', regionName: 'Carlsbad', eventIds: ['b'], dedupeKey: 'this-week:p2:2026-W42', to: 'auth-p2@example.com' },
    ])
    expect(await res.json()).toMatchObject({ ok: true, regions: 3, regionsWithEvents: 2, events: 3, candidates: 2, sent: 2, failed: 0 })
  })

  it('an empty region enqueues nothing: its members are never even read', async () => {
    state.events = [event('a', NORTH_COUNTY.id)]
    state.recipients = [member('p1', NORTH_COUNTY.id), member('p2', ESCONDIDO.id)]
    const res = await GET(req)
    expect(state.recipientReads).toEqual([[NORTH_COUNTY.id]])
    expect(state.sends.map((s) => s.profileId)).toEqual(['p1'])
    expect(state.claimInserts).toEqual(['this-week:p1:2026-W42'])
    expect(await res.json()).toMatchObject({ ok: true, regionsWithEvents: 1, candidates: 1, sent: 1 })
  })

  it('with nothing coming up anywhere, nobody is read, nothing is claimed, nothing is sent', async () => {
    state.recipients = [member('p1', NORTH_COUNTY.id)]
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(state.recipientReads).toEqual([[]])
    expect(state.claimInserts).toEqual([])
    expect(state.sends).toEqual([])
    expect(await res.json()).toMatchObject({ ok: true, regionsWithEvents: 0, candidates: 0, sent: 0, failed: 0 })
  })

  it('an Event outside the next seven days does not make a region non-empty', async () => {
    state.events = [event('far', NORTH_COUNTY.id, '2026-10-30T10:00:00'), event('gone', NORTH_COUNTY.id, '2026-10-14T10:00:00')]
    state.recipients = [member('p1', NORTH_COUNTY.id)]
    await GET(req)
    expect(state.recipientReads).toEqual([[]])
    expect(state.sends).toEqual([])
  })

  it('the send gate is the one seam: a member it refuses is an opt-out, not a claim and not a send', async () => {
    state.events = [event('a', NORTH_COUNTY.id)]
    state.recipients = [member('p1', NORTH_COUNTY.id), member('p2', NORTH_COUNTY.id)]
    state.gated.add('p1')
    const res = await GET(req)
    expect(state.claimInserts).toEqual(['this-week:p2:2026-W42'])
    expect(state.sends.map((s) => s.profileId)).toEqual(['p2'])
    expect(await res.json()).toMatchObject({ ok: true, sent: 1, optOut: 1, failed: 0 })
  })

  it('a member with no account email is skipped, not failed', async () => {
    state.events = [event('a', NORTH_COUNTY.id)]
    state.recipients = [member('p1', NORTH_COUNTY.id, { authUserId: 'no-email' })]
    const res = await GET(req)
    expect(state.sends).toEqual([])
    expect(await res.json()).toMatchObject({ ok: true, sent: 0, skipped: 1, failed: 0 })
  })
})

describe('GET /api/cron/this-week, idempotency per member per ISO week', () => {
  beforeEach(() => {
    state.events = [event('a', NORTH_COUNTY.id)]
    state.recipients = [member('p1', NORTH_COUNTY.id), member('p2', NORTH_COUNTY.id)]
  })

  it('claims this-week:<profile_id>:<ISO week> before each send, and hands the same key to the outbox', async () => {
    await GET(req)
    expect(state.claimInserts).toEqual(['this-week:p1:2026-W42', 'this-week:p2:2026-W42'])
    expect(state.sends.map((s) => s.dedupeKey)).toEqual(['this-week:p1:2026-W42', 'this-week:p2:2026-W42'])
  })

  it('does not send twice in one week: a second run covers nobody already claimed', async () => {
    await GET(req)
    state.sends.length = 0
    const second = await GET(req)
    expect(state.sends).toEqual([])
    expect(await second.json()).toMatchObject({ ok: true, sent: 0, deduped: 2, failed: 0 })
  })

  it('a member skipped by a taken claim is not a failure, and the next week is a fresh key', async () => {
    state.recipients = [member('p1', NORTH_COUNTY.id)]
    state.claimed.add('this-week:p1:2026-W42')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(state.sends).toEqual([])
    // The following Thursday: the Event still inside its window, the key a week on.
    vi.setSystemTime(new Date('2026-10-22T15:00:00Z'))
    state.events = [event('b', NORTH_COUNTY.id, '2026-10-24T10:00:00')]
    await GET(req)
    expect(state.claimInserts.at(-1)).toBe('this-week:p1:2026-W43')
    expect(state.sends.map((s) => s.profileId)).toEqual(['p1'])
  })

  it('claims through a BOUND from: the mock loses `this` like the real client (LIVE-053)', async () => {
    const client = makeAdminClient() as unknown as { from: (table: string) => unknown }
    const detached = client.from
    expect(() => detached('cron_run_markers')).toThrow("Cannot read properties of undefined (reading 'rest')")
    expect(() => client.from('cron_run_markers')).not.toThrow()
    const res = await GET(req)
    expect(await res.json()).toMatchObject({ ok: true, sent: 2, failed: 0 })
  })
})

describe('GET /api/cron/this-week, per-member fail-safe', () => {
  beforeEach(() => {
    state.events = [event('a', NORTH_COUNTY.id)]
    state.recipients = [member('p1', NORTH_COUNTY.id), member('p2', NORTH_COUNTY.id)]
  })

  it('releases the claim when the send throws, keeps going, logs the member with its stack, and answers 500', async () => {
    state.sendThrows.add('p1')
    const res = await GET(req)
    expect(res.status).toBe(500)
    expect(state.releases).toEqual(['this-week:p1:2026-W42'])
    expect(state.claimed.has('this-week:p2:2026-W42')).toBe(true)
    expect(state.sends.map((s) => s.profileId)).toEqual(['p2'])
    expect(await res.json()).toMatchObject({ ok: false, sent: 1, failed: 1 })
    const line = state.logged.error.find((l) => l.event === 'cron.this_week.member_failed')
    expect(line?.fields).toMatchObject({ profile_id: 'p1', region_id: NORTH_COUNTY.id, error: 'enqueue(email) failed: db down' })
    expect(typeof line?.fields?.stack).toBe('string')
  })

  it('the retry covers only the member whose send failed', async () => {
    state.sendThrows.add('p1')
    await GET(req)
    state.sendThrows.clear()
    state.sends.length = 0
    const retry = await GET(req)
    expect(state.sends.map((s) => s.profileId)).toEqual(['p1'])
    expect(await retry.json()).toMatchObject({ ok: true, sent: 1, deduped: 1, failed: 0 })
  })
})
