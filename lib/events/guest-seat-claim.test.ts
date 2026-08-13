import { describe, it, expect, beforeEach, vi } from 'vitest'
import { pickSeatLanding, claimGuestSeatsOnSignIn, type SessionClient } from '@/lib/events/guest-seat-claim'

// CLAIM-ON-SIGN-IN (ADR-1033). What is locked here (network-free — the Supabase client is a fake):
//   1. THE LANDING RULE is narrow: only an event happening around now, never one weeks out and
//      never one long over, and the most recently started when two are live at once.
//   2. EVERY CALL RUNS ON THE SESSION CLIENT — the RPC because claim_guest_rsvps proves ownership
//      with auth.uid() and claims nothing under any other client, the reads because RLS already
//      grants a member their own seats and the events behind them (no service-role bypass).
//   3. A WAITLISTED claim is a real claim but never a landing: check-in refuses a non-'going' RSVP,
//      so the page would offer a button that does nothing.
//   4. FAIL-SAFE: every failure returns null rather than throwing, because this sits on the login
//      path and a lost redirect is cheaper than a failed sign-in.

const HOME_TZ = 'America/Los_Angeles'

// The wall-clock strings events store are read through the event's own zone, so these fixtures are
// written the way a real row is: no offset suffix.
const NOW = new Date('2026-08-13T19:00:00-07:00')

type Row = Record<string, unknown>

const store = {
  event_rsvps: [] as Row[],
  events: [] as Row[],
  fail: false,
}

// Minimal PostgREST-shaped builder: enough of the chain for the two reads this module makes.
function builder(table: string) {
  const filters: Record<string, unknown> = {}
  let sinceCol: string | null = null
  let since: string | null = null
  let inCol: string | null = null
  let inVals: string[] = []

  const rows = () => {
    if (store.fail) throw new Error('read failed')
    return (store[table as 'event_rsvps' | 'events'] as Row[]).filter((r) => {
      if (!Object.entries(filters).every(([k, v]) => r[k] === v)) return false
      if (sinceCol && since && String(r[sinceCol] ?? '') < since) return false
      if (inCol && !inVals.includes(String(r[inCol]))) return false
      return true
    })
  }

  const api = {
    select() { return api },
    eq(col: string, val: unknown) { filters[col] = val; return api },
    gte(col: string, val: unknown) { sinceCol = col; since = String(val); return Promise.resolve({ data: rows() }) },
    in(col: string, vals: string[]) { inCol = col; inVals = vals; return Promise.resolve({ data: rows() }) },
  }
  return api
}

/** A stand-in for the session-scoped Supabase client the route hands in. */
function sessionClient(rpc = vi.fn().mockResolvedValue({})): { client: SessionClient; rpc: typeof rpc } {
  return {
    rpc,
    client: { rpc, from: (t: string) => builder(t) } as unknown as SessionClient,
  }
}

/** One claimed seat + its event, both live right now, as the happy path expects them. */
function seedLiveClaim(over: { status?: string; is_cancelled?: boolean; claimedAt?: string } = {}) {
  store.event_rsvps = [
    {
      event_id: 'e1',
      status: over.status ?? 'going',
      guest_claimed_by: 'p1',
      guest_claimed_at: over.claimedAt ?? new Date().toISOString(),
    },
  ]
  store.events = [
    {
      id: 'e1',
      slug: 'tonight',
      starts_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      ends_at: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
      is_cancelled: over.is_cancelled ?? false,
      time_zone: 'UTC',
    },
  ]
}

beforeEach(() => {
  store.event_rsvps = []
  store.events = []
  store.fail = false
})

describe('pickSeatLanding — the landing rule', () => {
  const seat = (over: Partial<{ slug: string; startsAt: string; endsAt: string | null }>) => ({
    slug: 'now-event',
    startsAt: '2026-08-13T18:00:00',
    endsAt: '2026-08-13T21:00:00',
    timeZone: HOME_TZ,
    ...over,
  })

  it('lands on an event that is happening right now', () => {
    expect(pickSeatLanding([seat({})], NOW)).toBe('/events/now-event')
  })

  it('does not land on an event that has not started', () => {
    expect(pickSeatLanding([seat({ startsAt: '2026-08-20T18:00:00', endsAt: '2026-08-20T21:00:00' })], NOW)).toBeNull()
  })

  it('does not land on an event that ended long ago', () => {
    expect(pickSeatLanding([seat({ startsAt: '2026-08-11T18:00:00', endsAt: '2026-08-11T21:00:00' })], NOW)).toBeNull()
  })

  it('still lands shortly after the end, because check-in is often the last thing someone does', () => {
    // Ended an hour ago; inside the grace window.
    expect(pickSeatLanding([seat({ endsAt: '2026-08-13T18:00:00' })], NOW)).toBe('/events/now-event')
  })

  it('treats an event with no end time as running for a bounded window, not forever', () => {
    expect(pickSeatLanding([seat({ startsAt: '2026-08-13T18:00:00', endsAt: null })], NOW)).toBe('/events/now-event')
    // Started ten hours ago with no end time: outside the open-ended window.
    expect(pickSeatLanding([seat({ startsAt: '2026-08-13T09:00:00', endsAt: null })], NOW)).toBeNull()
  })

  it('picks the most recently started when two seats are live at once', () => {
    const landing = pickSeatLanding(
      [
        seat({ slug: 'earlier', startsAt: '2026-08-13T17:00:00', endsAt: '2026-08-13T22:00:00' }),
        seat({ slug: 'later', startsAt: '2026-08-13T18:45:00', endsAt: '2026-08-13T22:00:00' }),
      ],
      NOW,
    )
    expect(landing).toBe('/events/later')
  })

  it('reads the wall clock through the event own zone, not the server zone', () => {
    // 21:30 New York is 18:30 Pacific: half an hour before NOW in Pacific terms, and still running.
    const nyc = pickSeatLanding(
      [{ slug: 'nyc', startsAt: '2026-08-13T21:30:00', endsAt: '2026-08-14T00:30:00', timeZone: 'America/New_York' }],
      NOW,
    )
    expect(nyc).toBe('/events/nyc')
  })

  it('returns null for nothing claimed', () => {
    expect(pickSeatLanding([], NOW)).toBeNull()
  })
})

describe('claimGuestSeatsOnSignIn', () => {
  it('calls claim_guest_rsvps on the session client with the profile id', async () => {
    const { client, rpc } = sessionClient()
    await claimGuestSeatsOnSignIn(client, 'p1')
    expect(rpc).toHaveBeenCalledWith('claim_guest_rsvps', { p_profile_id: 'p1' })
  })

  it('returns the event path when the claim attached a seat to a live event', async () => {
    seedLiveClaim()
    expect(await claimGuestSeatsOnSignIn(sessionClient().client, 'p1')).toBe('/events/tonight')
  })

  it('never lands on a waitlisted seat', async () => {
    seedLiveClaim({ status: 'waitlist' })
    expect(await claimGuestSeatsOnSignIn(sessionClient().client, 'p1')).toBeNull()
  })

  it('never lands on a cancelled event', async () => {
    seedLiveClaim({ is_cancelled: true })
    expect(await claimGuestSeatsOnSignIn(sessionClient().client, 'p1')).toBeNull()
  })

  it('ignores a seat claimed on an earlier sign-in', async () => {
    // Claimed last week: outside the just-claimed window, so this sign-in does not teleport anyone
    // into an event they attached to days ago.
    seedLiveClaim({ claimedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() })
    expect(await claimGuestSeatsOnSignIn(sessionClient().client, 'p1')).toBeNull()
  })

  it('returns null and never throws when the RPC fails', async () => {
    const { client } = sessionClient(vi.fn().mockRejectedValue(new Error('nope')))
    await expect(claimGuestSeatsOnSignIn(client, 'p1')).resolves.toBeNull()
  })

  it('returns null and never throws when a read is refused', async () => {
    // Stands in for the one row RLS withholds (a draft event) as well as any transport failure.
    store.fail = true
    const { client, rpc } = sessionClient()
    await expect(claimGuestSeatsOnSignIn(client, 'p1')).resolves.toBeNull()
    // The claim itself still ran: only the convenience redirect was lost.
    expect(rpc).toHaveBeenCalledOnce()
  })
})
