import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

// Phase 0 ownership contract for EVENTS (ENTITY-SPACES-BUILD Epic 0.3 / §4.3). Locks two things:
//   1. STAMP — a new event defaults its space_id to the ROOT space (the canary).
//   2. ISOLATION — listEventsForSpace filters by space_id, so an event in space A can never
//      resolve for space B; `upcomingOnly` adds a starts_at lower bound.
//   3. PUBLICATION (2026-08-20) — that read goes through the SERVICE-ROLE client, so its own query
//      is the only gate there is, and it had none: a draft or a `private` event on a Space
//      rendered on that Space's PUBLIC profile. The gate is now the DEFAULT and `includeUnpublished`
//      is the opt-out, so these tests assert the predicates land on the query itself.

const ROOT_ID = 'f0000000-0000-4000-a000-00000000root'
const SPACE_A = 'aaaaaaaa-0000-4000-a000-00000000000a'
const SPACE_B = 'bbbbbbbb-0000-4000-a000-00000000000b'

const store: { rows: Record<string, Array<Record<string, unknown>>> } = { rows: {} }
const eqCalls: Array<[string, unknown]> = []
const inCalls: Array<[string, unknown]> = []
const isCalls: Array<[string, unknown]> = []
let gteCalled = false

function builder() {
  const filters: { space_id?: string } = {}
  const api = {
    select() {
      return api
    },
    eq(col: string, val: unknown) {
      eqCalls.push([col, val])
      if (col === 'space_id') filters.space_id = val as string
      return api
    },
    in(col: string, val: unknown) {
      inCalls.push([col, val])
      return api
    },
    is(col: string, val: unknown) {
      isCalls.push([col, val])
      return api
    },
    gte() {
      gteCalled = true
      return api
    },
    order() {
      return api
    },
    async limit() {
      return { data: store.rows[filters.space_id ?? ''] ?? [], error: null }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => builder() }),
}))

vi.mock('@/lib/spaces/store', () => ({
  loadRootSpaceId: async () => ROOT_ID,
}))

import {
  stampEventSpaceId,
  listEventsForSpace,
  passesCalendarGate,
  masterCalendarIncludes,
  mergeSpaceCalendarRows,
  filterSharedByHomeSpace,
  tallyGoingByEvent,
  type SpaceCalendarEventRow,
  type SharedCalendarEventRow,
} from './store'

beforeEach(() => {
  store.rows = {}
  eqCalls.length = 0
  inCalls.length = 0
  isCalls.length = 0
  gteCalled = false
})

describe('stampEventSpaceId (create defaults to root)', () => {
  it('STAMP: with no spaceId, a new event is stamped to the ROOT space', async () => {
    expect(await stampEventSpaceId()).toBe(ROOT_ID)
  })

  it('a space-scoped caller stamps its own space', async () => {
    expect(await stampEventSpaceId(SPACE_A)).toBe(SPACE_A)
  })
})

describe('listEventsForSpace (by-space read)', () => {
  it('CANARY: with no spaceId, reads the ROOT space rows', async () => {
    store.rows[ROOT_ID] = [{ id: 'e1', space_id: ROOT_ID, title: 'Root event' }]
    const rows = await listEventsForSpace()
    expect(rows.map((r) => r.id)).toEqual(['e1'])
    expect(eqCalls).toContainEqual(['space_id', ROOT_ID])
    expect(gteCalled).toBe(false)
  })

  it('ISOLATION: an event saved for space A never resolves for space B', async () => {
    store.rows[SPACE_A] = [{ id: 'a1', space_id: SPACE_A, title: 'A only' }]
    expect((await listEventsForSpace(SPACE_A)).map((r) => r.id)).toEqual(['a1'])
    expect(await listEventsForSpace(SPACE_B)).toEqual([])
  })

  it('upcomingOnly adds a starts_at lower bound', async () => {
    store.rows[SPACE_A] = [{ id: 'a1', space_id: SPACE_A, title: 'A only' }]
    await listEventsForSpace(SPACE_A, { upcomingOnly: true })
    expect(gteCalled).toBe(true)
  })

  // ── PUBLICATION: the gate is what you get by asking for nothing ────────────────────────────────
  it('🔴 the default read gates on publication, so a draft cannot reach a public Space page', async () => {
    store.rows[SPACE_A] = [{ id: 'a1', space_id: SPACE_A, title: 'A only' }]
    await listEventsForSpace(SPACE_A)
    expect(eqCalls).toContainEqual(['status', 'published'])
    expect(inCalls).toContainEqual(['visibility', ['public', 'unlisted']])
    expect(isCalls).toContainEqual(['removed_at', null])
  })

  it('includeUnpublished is the OPT-OUT, and only it lifts the gate (the operator console)', async () => {
    store.rows[SPACE_A] = [{ id: 'a1', space_id: SPACE_A, title: 'A only' }]
    await listEventsForSpace(SPACE_A, { includeUnpublished: true })
    expect(eqCalls).not.toContainEqual(['status', 'published'])
    expect(inCalls).toEqual([])
    expect(isCalls).toEqual([])
    // Still scoped to the one space — lifting the publication gate must never lift ISOLATION.
    expect(eqCalls).toContainEqual(['space_id', SPACE_A])
  })
})

// ── EC2/EC3 calendar gates + the shared-event UNION (the LEAK contract, applied on each event's OWN row).
const FROM = '2026-07-01T00:00:00Z'
function row(over: Partial<SpaceCalendarEventRow>): SpaceCalendarEventRow {
  return {
    id: over.id ?? 'e',
    slug: over.slug ?? 'e',
    title: over.title ?? 'Event',
    starts_at: over.starts_at ?? '2026-07-10T19:00:00Z',
    ends_at: over.ends_at ?? null,
    location: over.location ?? null,
    time_zone: over.time_zone ?? null,
    is_cancelled: over.is_cancelled ?? false,
    status: over.status ?? 'published',
    visibility: over.visibility ?? 'public',
    removed_at: over.removed_at ?? null,
    is_demo: over.is_demo ?? null,
  }
}

describe('passesCalendarGate (per-space feed: public + unlisted, never leaks)', () => {
  it('admits published public and unlisted upcoming events', () => {
    expect(passesCalendarGate(row({ visibility: 'public' }), FROM)).toBe(true)
    expect(passesCalendarGate(row({ visibility: 'unlisted' }), FROM)).toBe(true)
  })
  it('rejects private / circle_only / draft / cancelled / past on the event OWN row', () => {
    expect(passesCalendarGate(row({ visibility: 'private' }), FROM)).toBe(false)
    expect(passesCalendarGate(row({ visibility: 'circle_only' }), FROM)).toBe(false)
    expect(passesCalendarGate(row({ status: 'draft' }), FROM)).toBe(false)
    expect(passesCalendarGate(row({ is_cancelled: true }), FROM)).toBe(false)
    expect(passesCalendarGate(row({ starts_at: '2026-06-01T19:00:00Z' }), FROM)).toBe(false)
  })
  it('rejects staff-removed and demo rows, WITHOUT relying on is_cancelled (20270126000000)', () => {
    // removeEvent happens to set is_cancelled today, which masked this hole. The gate must hold
    // on removed_at alone, for the next removal path that does not extend the courtesy.
    expect(passesCalendarGate(row({ removed_at: '2026-07-01T00:00:00Z' }), FROM)).toBe(false)
    expect(passesCalendarGate(row({ is_demo: true }), FROM)).toBe(false)
    // Rows fetched without the columns (undefined) still pass — same default direction as status.
    expect(passesCalendarGate(row({}), FROM)).toBe(true)
  })
})

describe('masterCalendarIncludes (master feed: PUBLIC ONLY — excludes unlisted)', () => {
  it('admits public, EXCLUDES unlisted (the discovery/link distinction)', () => {
    expect(masterCalendarIncludes(row({ visibility: 'public' }), FROM)).toBe(true)
    // The one difference from the per-space gate: unlisted is link-only, never surfaced in discovery.
    expect(masterCalendarIncludes(row({ visibility: 'unlisted' }), FROM)).toBe(false)
    expect(passesCalendarGate(row({ visibility: 'unlisted' }), FROM)).toBe(true)
  })
  it('still rejects private / draft / cancelled', () => {
    expect(masterCalendarIncludes(row({ visibility: 'private' }), FROM)).toBe(false)
    expect(masterCalendarIncludes(row({ status: 'draft' }), FROM)).toBe(false)
    expect(masterCalendarIncludes(row({ is_cancelled: true }), FROM)).toBe(false)
  })
})

describe('mergeSpaceCalendarRows (EC3 UNION: own + accepted-shared, deduped + gated)', () => {
  it('dedupes an event present in BOTH own and shared, keeping one', () => {
    const shared = row({ id: 'dup', starts_at: '2026-07-05T19:00:00Z' })
    const merged = mergeSpaceCalendarRows([shared], [shared], FROM, 300)
    expect(merged.map((e) => e.id)).toEqual(['dup'])
  })
  it('unions distinct own + shared events and sorts by starts_at', () => {
    const own = row({ id: 'own', starts_at: '2026-07-20T19:00:00Z' })
    const shared = row({ id: 'shared', starts_at: '2026-07-10T19:00:00Z' })
    const merged = mergeSpaceCalendarRows([own], [shared], FROM, 300)
    expect(merged.map((e) => e.id)).toEqual(['shared', 'own'])
  })
  it('LEAK GATE: a SHARED but private/draft/cancelled event never surfaces (gated on its OWN row)', () => {
    const ownPublic = row({ id: 'own', visibility: 'public' })
    const sharedPrivate = row({ id: 'leak', visibility: 'private' })
    const sharedDraft = row({ id: 'leak2', status: 'draft' })
    const merged = mergeSpaceCalendarRows([ownPublic], [sharedPrivate, sharedDraft], FROM, 300)
    expect(merged.map((e) => e.id)).toEqual(['own'])
  })
  it('respects the limit after dedupe + sort', () => {
    const a = row({ id: 'a', starts_at: '2026-07-05T19:00:00Z' })
    const b = row({ id: 'b', starts_at: '2026-07-06T19:00:00Z' })
    const c = row({ id: 'c', starts_at: '2026-07-07T19:00:00Z' })
    expect(mergeSpaceCalendarRows([a, b], [c], FROM, 2).map((e) => e.id)).toEqual(['a', 'b'])
  })
})

describe('tallyGoingByEvent (calendar social proof: count only confirmed going)', () => {
  it('counts only status=going, grouped per event, ignoring maybe/waitlist/blank', () => {
    const tally = tallyGoingByEvent([
      { event_id: 'a', status: 'going' },
      { event_id: 'a', status: 'going' },
      { event_id: 'a', status: 'maybe' },
      { event_id: 'b', status: 'waitlist' },
      { event_id: 'b', status: 'going' },
      { event_id: 'c', status: null },
    ])
    expect(tally.get('a')).toBe(2)
    expect(tally.get('b')).toBe(1)
    expect(tally.has('c')).toBe(false)
  })
  it('is empty for no rows', () => {
    expect(tallyGoingByEvent([]).size).toBe(0)
  })

  // SCAN-512 / ADR-1152. This is the SAME social-proof number lib/events/going-counts.ts renders on
  // the /events cards, and that one learned in SCAN-105 that a request awaiting the host is not a
  // seat. If this one had not, a single event would show two different "N going" figures depending
  // on whether you opened /events or the calendar popup.
  it('does not count a request still awaiting the host', () => {
    const tally = tallyGoingByEvent([
      { event_id: 'a', status: 'going', approval_status: 'approved' },
      { event_id: 'a', status: 'going', approval_status: 'pending' },
      { event_id: 'a', status: 'going', approval_status: 'none' },
      { event_id: 'b', status: 'going', approval_status: 'pending' },
    ])
    // approved + none, never the pending one.
    expect(tally.get('a')).toBe(2)
    // An event whose ONLY rows are requests has no social proof at all, rather than a count of 1.
    expect(tally.has('b')).toBe(false)
  })

  // A row with no `approval_status` at all is an ungated event, which is every event today. It must
  // still count, or the fix would silently zero the number it was meant to correct.
  it('still counts a row that carries no approval_status (an ungated event)', () => {
    const tally = tallyGoingByEvent([
      { event_id: 'a', status: 'going' },
      { event_id: 'a', status: 'going', approval_status: null },
    ])
    expect(tally.get('a')).toBe(2)
  })
})

describe('filterSharedByHomeSpace (EC3 leak gate: a share cannot out-live its home space walling)', () => {
  const sharedRow = (over: Partial<SharedCalendarEventRow>): SharedCalendarEventRow => ({
    ...row(over),
    space_id: over.space_id ?? null,
  })
  it('keeps a shared event whose HOME space is network + active (in the allowed set)', () => {
    const e = sharedRow({ id: 'live', space_id: 'home-active' })
    expect(filterSharedByHomeSpace([e], new Set(['home-active'])).map((r) => r.id)).toEqual(['live'])
  })
  it('DROPS a shared event whose HOME space is suspended/hidden (not in the allowed set)', () => {
    const e = sharedRow({ id: 'walled', space_id: 'home-suspended' })
    expect(filterSharedByHomeSpace([e], new Set(['home-active']))).toEqual([])
  })
  it('keeps a platform event (null home space) without any lookup', () => {
    const e = sharedRow({ id: 'platform', space_id: null })
    expect(filterSharedByHomeSpace([e], new Set()).map((r) => r.id)).toEqual(['platform'])
  })
})

describe('space calendar membership (ADR-905, narrowing ADR-898): the drift guard', () => {
  // The owner's rule: "Space calendars should only show events, features and programs offered by
  // that space." ADR-898 had widened membership with two OWNER-IDENTITY axes — the owner's
  // personally-hosted events and their accepted cohost invites — and on production those placed 11
  // events on Space calendars that did not belong there and 0 that did. One owner's event appeared
  // on all ten Spaces they own.
  //
  // These assertions pin membership as three DECLARATIONS (tenancy, the hosting axis, accepted
  // shares) in BOTH the store read and the .ics RPC, so the grid ⇄ feed lockstep holds without a
  // live database — AND they pin the absence of the owner axes, because re-adding either one is
  // silent: it breaks no test, throws nothing, and simply starts leaking other Spaces' events.
  const storeSrc = readFileSync('lib/events/store.ts', 'utf8')
  // The guard must read the migration that LAST recreated the function — an older file passing its
  // assertions proves nothing about what production runs. Glob rather than hardcode, so the next
  // recreation is covered automatically (the workflow audit called out the hardcoded-path trap).
  const feedMigrations = readdirSync('supabase/migrations')
    .filter((f) => /space_calendar/.test(f))
    .sort()
  const feedSql = readFileSync(`supabase/migrations/${feedMigrations[feedMigrations.length - 1]}`, 'utf8')
  // Both files EXPLAIN the removed axes by naming them — the header comments, and the RPC's own
  // `comment on function` docstring, which is a string literal rather than a comment. So assertions
  // about ABSENCE run against executable code only: the `$$ … $$` body for SQL, comment-stripped
  // source for TS. (Three drift guards in this repo have already failed by matching their own
  // prose; this is the same trap in its SQL form.)
  const storeCode = storeSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const feedBody = (() => {
    const open = feedSql.indexOf('as $$')
    const close = feedSql.indexOf('$$;', open)
    // Guard the extraction itself: a vacuous empty string would pass every not.toContain below.
    expect(open).toBeGreaterThan(-1)
    expect(close).toBeGreaterThan(open)
    return feedSql.slice(open, close)
  })()
  const feedCode = feedBody.replace(/^\s*--.*$/gm, '')

  it('the store read carries the three declaration axes: tenancy, hosting, shares', () => {
    expect(storeCode).toContain(`.eq('space_id', sid)`)
    expect(storeCode).toContain(`.eq('host_space_id', sid)`)
    expect(storeCode).toContain(`host_space_id.eq.\${sid}`) // the tab gate's .or() twin
    expect(storeCode).toContain(`acceptedShareEventIds(admin, sid)`)
  })

  it('the store read has NO owner-identity axis, in either call site', () => {
    // Scoped to the two CALENDAR functions, not the whole file: `host_id` is a real events column
    // that other reads in this module legitimately select (SpaceEvent carries it, COLS lists it).
    // A file-wide ban would forbid the column rather than the rule, and would be deleted the first
    // time someone needed an event's host for an unrelated read.
    const calendarCode = (() => {
      const start = storeCode.indexOf('export async function listSpaceCalendarEvents')
      const end = storeCode.indexOf('export async function', storeCode.indexOf(
        'export async function spaceHasPublicUpcomingEvents',
      ) + 1)
      expect(start).toBeGreaterThan(-1)
      expect(end).toBeGreaterThan(start)
      return storeCode.slice(start, end)
    })()
    expect(calendarCode).not.toContain('host_id.eq')
    expect(calendarCode).not.toContain('event_cohosts')
    expect(calendarCode).not.toContain('acceptedCohostEventIds')
    expect(calendarCode).not.toContain('spaceOwnerProfileId')
    expect(calendarCode).not.toContain('owner_profile_id')
    // The helpers themselves are gone from the module, so nothing can call them back cheaply.
    expect(storeCode).not.toContain('async function acceptedCohostEventIds')
    expect(storeCode).not.toContain('async function spaceOwnerProfileId')
  })

  it('the .ics RPC carries the SAME three axes', () => {
    expect(feedCode).toContain('e.space_id = t.id')
    expect(feedCode).toContain('e.host_space_id = t.id')
    expect(feedCode).toContain("sh.status = 'accepted'")
  })

  it('the .ics RPC has NO owner-identity axis, and stops selecting the owner at all', () => {
    expect(feedCode).not.toContain('owner_profile_id')
    expect(feedCode).not.toContain('event_cohosts')
    expect(feedCode).not.toContain('e.host_id')
  })

  it('the visibility gate did NOT move when membership narrowed (the non-negotiable half)', () => {
    // The RPC re-applies published + public/unlisted + non-cancelled in BOTH branches. Narrowing
    // membership must not tempt anyone to relax the per-row gate that makes membership safe.
    expect(feedCode.match(/e\.visibility in \('public', 'unlisted'\)/g)?.length).toBe(2)
    expect(feedCode.match(/coalesce\(e\.status, 'published'\) = 'published'/g)?.length).toBe(2)
    expect(feedCode.match(/e\.is_cancelled = false/g)?.length).toBe(2)
    // Added 20270126000000: staff removal and demo seeding, gated independently of is_cancelled.
    expect(feedCode.match(/e\.removed_at is null/g)?.length).toBe(2)
    expect(feedCode.match(/e\.is_demo = false/g)?.length).toBe(2)
    // And the app-side twin carries the same two, in the pure gate every reader funnels through.
    expect(storeCode).toContain('!e.removed_at')
    expect(storeCode).toContain('e.is_demo !== true')
    // The TARGET space is gated network + active in-function (the walling contract).
    expect(feedCode).toContain("s.visibility = 'network'")
    expect(feedCode).toContain("s.status = 'active'")
    // Every non-tenancy row still re-gates its HOME space's walling.
    expect(feedCode.match(/home\.visibility = 'network' and home\.status = 'active'/g)?.length).toBe(2)
  })

  it('every value still interpolated into an .or() filter is UUID-guarded', () => {
    // One .or() survives (the tab gate); the calendar read now uses .eq(), which parameterises.
    expect(storeCode).toContain('UUID_RE.test(sid)')
    expect(storeCode).toContain('awayIds.filter((id) => UUID_RE.test(id))')
  })

  it('the grid and the feed agree on the axis count, so neither can drift alone', () => {
    // Three axes each. If someone adds a fourth to one side, this fails rather than letting the
    // on-page grid and the subscribed .ics quietly disagree about what the Space offers.
    const storeAxes = [
      storeCode.includes(`.eq('space_id', sid)`),
      storeCode.includes(`.eq('host_space_id', sid)`),
      storeCode.includes('acceptedShareEventIds'),
    ].filter(Boolean).length
    const feedAxes = [
      feedCode.includes('e.space_id = t.id'),
      feedCode.includes('e.host_space_id = t.id'),
      feedCode.includes('event_space_shares'),
    ].filter(Boolean).length
    expect(storeAxes).toBe(3)
    expect(feedAxes).toBe(3)
  })
})
