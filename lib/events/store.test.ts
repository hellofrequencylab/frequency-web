import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 0 ownership contract for EVENTS (ENTITY-SPACES-BUILD Epic 0.3 / §4.3). Locks two things:
//   1. STAMP — a new event defaults its space_id to the ROOT space (the canary).
//   2. ISOLATION — listEventsForSpace filters by space_id, so an event in space A can never
//      resolve for space B; `upcomingOnly` adds a starts_at lower bound.

const ROOT_ID = 'f0000000-0000-4000-a000-00000000root'
const SPACE_A = 'aaaaaaaa-0000-4000-a000-00000000000a'
const SPACE_B = 'bbbbbbbb-0000-4000-a000-00000000000b'

const store: { rows: Record<string, Array<Record<string, unknown>>> } = { rows: {} }
const eqCalls: Array<[string, unknown]> = []
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
  type SpaceCalendarEventRow,
  type SharedCalendarEventRow,
} from './store'

beforeEach(() => {
  store.rows = {}
  eqCalls.length = 0
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
