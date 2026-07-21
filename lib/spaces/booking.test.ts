import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 1:1 BOOKING (ENTITY-SPACES-SYSTEM section 2.4, booking v1). What is locked here, all network-free
// (the supabase admin client + auth + store + capability seam are mocked):
//   1. THE PURE SLOT GENERATOR is correct: open vs booked vs past slots, window boundaries (the
//      trailing partial slot is dropped), slot size, overlapping windows collapse, and no
//      double-book (a booked instant never reappears as open).
//   2. TIMEZONE math: a window stated in a non-UTC IANA zone produces the right UTC instants, and
//      the tz/UTC round-trip holds (including a DST-aware zone).
//   3. NORMALIZATION is fail-closed: malformed windows are dropped.
//   4. PERMISSION GATING on the actions: setSpaceAvailability / listSpaceBookings require
//      canEditProfile (anonymous + non-editor are rejected, nothing is written); createBooking
//      rejects an anonymous caller, a past time, a non-slot time, and an already-taken slot.

// ── Mock the caller identity + Space resolver + capability seam (toggled per test) ──────────────
let currentProfileId: string | null = 'member-0000-4000-a000-0000000membr'
let currentWebRole: 'none' | 'admin' | 'janitor' = 'none'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
  getCallerProfile: async () =>
    currentProfileId ? { id: currentProfileId, webRole: currentWebRole } : null,
}))

let resolvedSpace: { id: string; slug: string; ownerProfileId?: string | null } | null = {
  id: 'space-1',
  slug: 'river-yoga',
  ownerProfileId: 'owner-0000-4000-a000-0000000ownr',
}
vi.mock('./store', () => ({
  getSpaceById: async () => resolvedSpace,
}))

let canEdit = true
let isAdmin = true
// Keep the PURE entitlement readers real (the per-space-roles Phase 2 defense-in-depth in the action
// calls spaceFunctionAccess -> spaceEntitlements); override only getSpaceCapabilities.
vi.mock('./entitlements', async (orig) => ({
  ...(await orig<typeof import('./entitlements')>()),
  getSpaceCapabilities: async () => ({
    isOwner: canEdit,
    isAdmin,
    role: canEdit ? 'admin' : null,
    canEditProfile: canEdit,
    canManageMembers: isAdmin,
    canInvite: canEdit,
  }),
}))

// ── A chainable admin-client mock backed by an in-memory store ──────────────────────────────────
// availability[space_id] = rows; bookings = rows. Records inserts/deletes/updates for assertions.
type AvailRow = {
  id: string
  space_id: string
  weekday: number
  start_minute: number
  end_minute: number
  slot_minutes: number
  timezone: string
}
type BookRow = {
  id: string
  space_id: string
  member_profile_id: string
  starts_at: string
  ends_at: string
  status: string
  note: string | null
  answers?: unknown
  service_type_id?: string | null
}
type ServiceTypeRow = {
  id: string
  space_id: string
  name: string
  duration_minutes: number
  active: boolean
  sort_order: number
  questions?: unknown
}
const db = {
  availability: [] as AvailRow[],
  bookings: [] as BookRow[],
  serviceTypes: [] as ServiceTypeRow[],
  profiles: [] as { id: string; display_name: string | null }[],
  inserts: [] as Record<string, unknown>[],
  deletes: [] as string[],
  // A switch to simulate the partial-unique-index rejection on a confirmed double-book.
  failNextInsert: false,
}

function availabilityBuilder() {
  const filters: { space_id?: string } = {}
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'space_id') filters.space_id = val
      return api
    },
    delete() {
      return {
        async eq(_col: string, val: string) {
          db.deletes.push(val)
          db.availability = db.availability.filter((r) => r.space_id !== val)
          return { error: null }
        },
      }
    },
    async insert(rows: Record<string, unknown>[]) {
      for (const r of rows) {
        db.inserts.push(r)
        db.availability.push({ id: `a${db.availability.length}`, ...(r as object) } as AvailRow)
      }
      return { error: null }
    },
    then(resolve: (r: { data: AvailRow[] | null; error: null }) => unknown) {
      const data = db.availability.filter((r) => r.space_id === filters.space_id)
      return Promise.resolve(resolve({ data, error: null }))
    },
  }
  return api
}

function bookingsBuilder() {
  const filters: { space_id?: string; status?: string; statusIn?: string[]; id?: string; gte?: string } = {}
  let pendingInsert: Record<string, unknown> | null = null
  let pendingUpdate: Record<string, unknown> | null = null
  const api = {
    select() {
      return api
    },
    in(col: string, vals: string[]) {
      // readBlockingBookings uses .in('status', ['confirmed','pending']) to exclude held + confirmed slots.
      if (col === 'status') filters.statusIn = vals
      return api
    },
    eq(col: string, val: string) {
      if (col === 'space_id') filters.space_id = val
      if (col === 'status') filters.status = val
      if (col === 'id') filters.id = val
      // an eq after update() is the terminal write
      if (pendingUpdate && col === 'id') {
        const row = db.bookings.find((b) => b.id === val)
        if (row) Object.assign(row, pendingUpdate)
        return Promise.resolve({ error: null })
      }
      return api
    },
    gte(col: string, val: string) {
      if (col === 'starts_at') filters.gte = val
      return api
    },
    order() {
      return api
    },
    insert(rows: Record<string, unknown>[]) {
      pendingInsert = rows[0] ?? null
      return api
    },
    update(patch: Record<string, unknown>) {
      pendingUpdate = patch
      return api
    },
    async maybeSingle() {
      if (pendingInsert) {
        if (db.failNextInsert) {
          db.failNextInsert = false
          return { data: null, error: { code: '23505', message: 'duplicate key' } }
        }
        const row = {
          id: `b${db.bookings.length}`,
          ...(pendingInsert as object),
        } as BookRow
        db.bookings.push(row)
        db.inserts.push(pendingInsert)
        return { data: row, error: null }
      }
      // a select().eq('id', ...).maybeSingle() read
      const row = db.bookings.find((b) => b.id === filters.id) ?? null
      return { data: row, error: null }
    },
    then(resolve: (r: { data: BookRow[] | null; error: null }) => unknown) {
      let data = db.bookings.filter((b) => b.space_id === filters.space_id)
      if (filters.status) data = data.filter((b) => b.status === filters.status)
      if (filters.statusIn) data = data.filter((b) => filters.statusIn!.includes(b.status))
      if (filters.gte) data = data.filter((b) => b.starts_at >= filters.gte!)
      data = [...data].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      return Promise.resolve(resolve({ data, error: null }))
    },
  }
  return api
}

function serviceTypesBuilder() {
  const filters: { space_id?: string } = {}
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'space_id') filters.space_id = val
      return api
    },
    order() {
      return api
    },
    then(resolve: (r: { data: ServiceTypeRow[] | null; error: null }) => unknown) {
      const data = db.serviceTypes.filter((r) => r.space_id === filters.space_id)
      return Promise.resolve(resolve({ data, error: null }))
    },
  }
  return api
}

function profilesBuilder() {
  return {
    select() {
      return {
        async in(_col: string, ids: string[]) {
          return { data: db.profiles.filter((p) => ids.includes(p.id)) }
        },
      }
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'space_availability') return availabilityBuilder()
      if (table === 'space_bookings') return bookingsBuilder()
      if (table === 'space_service_types') return serviceTypesBuilder()
      if (table === 'profiles') return profilesBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  normalizeWindow,
  generateOpenSlots,
  slotLengthAt,
  summarizeAvailability,
  windowsForService,
  zoneOffsetMinutes,
  zonedTimeToUtc,
  setSpaceAvailability,
  listOpenSlots,
  createBooking,
  cancelBooking,
  rescheduleBooking,
  listSpaceBookings,
  withinModifyWindow,
  parseQuestions,
  parseAnswers,
  bookingDepositsLive,
  startServiceDeposit,
  type AvailabilityWindow,
} from './booking'

beforeEach(() => {
  currentProfileId = 'member-0000-4000-a000-0000000membr'
  currentWebRole = 'none'
  resolvedSpace = { id: 'space-1', slug: 'river-yoga', ownerProfileId: 'owner-0000-4000-a000-0000000ownr' }
  canEdit = true
  isAdmin = true
  db.availability = []
  db.bookings = []
  db.profiles = []
  db.inserts = []
  db.deletes = []
  db.failNextInsert = false
})

// A reference "now": a fixed Tuesday so weekday math is deterministic.
// 2026-06-23T09:00:00Z is a Tuesday (weekday 2).
const NOW = new Date('2026-06-23T09:00:00.000Z')

function utcWindow(over: Partial<AvailabilityWindow> = {}): AvailabilityWindow {
  return { weekday: 2, startMinute: 600, endMinute: 720, slotMinutes: 30, timezone: 'UTC', ...over }
}

describe('normalizeWindow (pure, fail-closed)', () => {
  it('accepts a valid window', () => {
    expect(normalizeWindow({ weekday: 1, startMinute: 540, endMinute: 1020, slotMinutes: 60, timezone: 'America/New_York' })).toEqual({
      weekday: 1,
      startMinute: 540,
      endMinute: 1020,
      slotMinutes: 60,
      timezone: 'America/New_York',
      serviceTypeId: null, // P1: unbound window offers every service
    })
  })

  it('drops a window whose end is not after start', () => {
    expect(normalizeWindow({ weekday: 1, startMinute: 600, endMinute: 600 })).toBeNull()
    expect(normalizeWindow({ weekday: 1, startMinute: 700, endMinute: 600 })).toBeNull()
  })

  it('drops an out-of-range weekday or minute', () => {
    expect(normalizeWindow({ weekday: 7, startMinute: 100, endMinute: 200 })).toBeNull()
    expect(normalizeWindow({ weekday: -1, startMinute: 100, endMinute: 200 })).toBeNull()
    expect(normalizeWindow({ weekday: 1, startMinute: -1, endMinute: 200 })).toBeNull()
    expect(normalizeWindow({ weekday: 1, startMinute: 100, endMinute: 1441 })).toBeNull()
  })

  it('defaults a bad slot length to 30 and an empty timezone to UTC', () => {
    const w = normalizeWindow({ weekday: 1, startMinute: 540, endMinute: 600, slotMinutes: 0, timezone: '  ' })
    expect(w?.slotMinutes).toBe(30)
    expect(w?.timezone).toBe('UTC')
  })
})

describe('timezone / UTC conversion (pure)', () => {
  it('UTC has a zero offset', () => {
    expect(zoneOffsetMinutes(new Date('2026-06-23T12:00:00Z'), 'UTC')).toBe(0)
  })

  it('a fixed UTC window maps minutes-from-midnight to the same UTC hour', () => {
    // 10:00 local in UTC = 10:00 UTC.
    const d = zonedTimeToUtc(2026, 6, 23, 600, 'UTC')
    expect(d.toISOString()).toBe('2026-06-23T10:00:00.000Z')
  })

  it('a New York summer window (EDT, UTC-4) maps 10:00 local to 14:00 UTC', () => {
    // June is EDT (UTC-4): 10:00 New York = 14:00 UTC.
    const off = zoneOffsetMinutes(new Date('2026-06-23T14:00:00Z'), 'America/New_York')
    expect(off).toBe(-240)
    const d = zonedTimeToUtc(2026, 6, 23, 600, 'America/New_York')
    expect(d.toISOString()).toBe('2026-06-23T14:00:00.000Z')
  })

  it('a New York winter window (EST, UTC-5) maps 10:00 local to 15:00 UTC (DST handled)', () => {
    const off = zoneOffsetMinutes(new Date('2026-01-13T15:00:00Z'), 'America/New_York')
    expect(off).toBe(-300)
    const d = zonedTimeToUtc(2026, 1, 13, 600, 'America/New_York')
    expect(d.toISOString()).toBe('2026-01-13T15:00:00.000Z')
  })
})

describe('generateOpenSlots (pure, the most-tested function)', () => {
  it('slices a window into back-to-back slots by slot length', () => {
    // Tue 10:00-12:00 UTC, 30-min slots => 10:00, 10:30, 11:00, 11:30 (four). Next Tue is 2026-06-30.
    const slots = generateOpenSlots([utcWindow()], new Set(), NOW)
    const todays = slots.filter((s) => s.startsAt.startsWith('2026-06-23'))
    expect(todays.map((s) => s.startsAt)).toEqual([
      '2026-06-23T10:00:00.000Z',
      '2026-06-23T10:30:00.000Z',
      '2026-06-23T11:00:00.000Z',
      '2026-06-23T11:30:00.000Z',
    ])
    expect(todays.every((s) => s.slotMinutes === 30)).toBe(true)
  })

  it('DROPS a trailing partial slot that does not fully fit before end', () => {
    // 10:00-11:10, 30-min slots => 10:00, 10:30 fit; 11:00 would end 11:30 > 11:10, so it is dropped.
    const slots = generateOpenSlots([utcWindow({ endMinute: 670 })], new Set(), NOW).filter((s) =>
      s.startsAt.startsWith('2026-06-23'),
    )
    expect(slots.map((s) => s.startsAt)).toEqual([
      '2026-06-23T10:00:00.000Z',
      '2026-06-23T10:30:00.000Z',
    ])
  })

  it('OMITS a booked slot (no double-book) but keeps the rest of the window', () => {
    const booked = new Set([new Date('2026-06-23T10:30:00Z').getTime()])
    const slots = generateOpenSlots([utcWindow()], booked, NOW).filter((s) =>
      s.startsAt.startsWith('2026-06-23'),
    )
    expect(slots.map((s) => s.startsAt)).toEqual([
      '2026-06-23T10:00:00.000Z',
      '2026-06-23T11:00:00.000Z',
      '2026-06-23T11:30:00.000Z',
    ])
  })

  it('OMITS past + in-progress slots (strictly future only)', () => {
    // now is 2026-06-23T09:00Z. A window earlier that day (07:00-09:30) leaves only future slots.
    // 07:00, 07:30, 08:00, 08:30 are past; 09:00 == now is also dropped (strictly future).
    const earlier = utcWindow({ startMinute: 420, endMinute: 570 }) // 07:00-09:30
    const slots = generateOpenSlots([earlier], new Set(), NOW).filter((s) =>
      s.startsAt.startsWith('2026-06-23'),
    )
    // Only 09:00 would be the boundary; it equals now so it is excluded. Nothing remains today.
    expect(slots).toEqual([])
  })

  it('respects slot size: a 60-min slot length halves the count', () => {
    const slots = generateOpenSlots([utcWindow({ slotMinutes: 60 })], new Set(), NOW).filter((s) =>
      s.startsAt.startsWith('2026-06-23'),
    )
    expect(slots.map((s) => s.startsAt)).toEqual([
      '2026-06-23T10:00:00.000Z',
      '2026-06-23T11:00:00.000Z',
    ])
  })

  it('COLLAPSES overlapping windows that share a start instant', () => {
    // Two identical windows: the duplicate instants collapse to one slot each.
    const slots = generateOpenSlots([utcWindow(), utcWindow()], new Set(), NOW).filter((s) =>
      s.startsAt.startsWith('2026-06-23'),
    )
    expect(slots.length).toBe(4) // not 8
  })

  it('returns slots sorted ascending across the horizon', () => {
    const slots = generateOpenSlots([utcWindow()], new Set(), NOW)
    const times = slots.map((s) => s.startsAt)
    expect(times).toEqual([...times].sort())
    // Within 14 days there are two Tuesdays (the 23rd and the 30th).
    expect(slots.some((s) => s.startsAt.startsWith('2026-06-30'))).toBe(true)
  })

  it('an empty window set yields no slots', () => {
    expect(generateOpenSlots([], new Set(), NOW)).toEqual([])
  })

  it('a New York window emits the correct UTC instants', () => {
    // Tue 10:00-11:00 New York (EDT, UTC-4), 30-min slots => 10:00 + 10:30 local = 14:00 + 14:30 UTC.
    const nyWindow = utcWindow({ startMinute: 600, endMinute: 660, timezone: 'America/New_York' })
    const slots = generateOpenSlots([nyWindow], new Set(), NOW).filter((s) =>
      s.startsAt.startsWith('2026-06-23'),
    )
    expect(slots.map((s) => s.startsAt)).toEqual([
      '2026-06-23T14:00:00.000Z',
      '2026-06-23T14:30:00.000Z',
    ])
  })
})

describe('slotLengthAt (pure)', () => {
  it('returns the slot length for a real slot boundary, null otherwise', () => {
    const windows = [utcWindow()]
    expect(slotLengthAt(windows, new Date('2026-06-23T10:30:00Z').getTime(), NOW)).toBe(30)
    // 10:15 is not a slot boundary.
    expect(slotLengthAt(windows, new Date('2026-06-23T10:15:00Z').getTime(), NOW)).toBeNull()
    // A past time is not generated, so it is not a valid slot.
    expect(slotLengthAt(windows, new Date('2026-06-23T07:00:00Z').getTime(), NOW)).toBeNull()
  })
})

describe('setSpaceAvailability (action) — permission gating', () => {
  it('rejects an anonymous caller and writes nothing', async () => {
    currentProfileId = null
    const r = await setSpaceAvailability('space-1', [utcWindow()])
    expect('error' in r).toBe(true)
    expect(db.inserts).toHaveLength(0)
    expect(db.deletes).toHaveLength(0)
  })

  it('rejects a caller without canEditProfile and writes nothing', async () => {
    canEdit = false
    const r = await setSpaceAvailability('space-1', [utcWindow()])
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/permission/i)
    expect(db.inserts).toHaveLength(0)
  })

  it('rejects a missing Space', async () => {
    resolvedSpace = null
    const r = await setSpaceAvailability('nope', [utcWindow()])
    expect('error' in r).toBe(true)
    expect(db.inserts).toHaveLength(0)
  })

  it('an authorized editor replaces the windows (delete then insert), dropping invalid ones', async () => {
    const r = await setSpaceAvailability('space-1', [
      utcWindow(),
      { weekday: 9, startMinute: 0, endMinute: 10, slotMinutes: 30, timezone: 'UTC' }, // invalid weekday: dropped
    ])
    expect('error' in r).toBe(false)
    expect(db.deletes).toContain('space-1') // cleared first
    expect(db.inserts).toHaveLength(1) // only the valid window was inserted
    expect(db.inserts[0]!.start_minute).toBe(600)
  })

  it('an empty list clears availability (valid "not taking bookings")', async () => {
    db.availability.push({ id: 'a0', space_id: 'space-1', weekday: 2, start_minute: 600, end_minute: 720, slot_minutes: 30, timezone: 'UTC' })
    const r = await setSpaceAvailability('space-1', [])
    expect('error' in r).toBe(false)
    expect(db.deletes).toContain('space-1')
    expect(db.inserts).toHaveLength(0)
  })
})

describe('listOpenSlots (action)', () => {
  it('returns [] for an anonymous caller', async () => {
    currentProfileId = null
    expect(await listOpenSlots('space-1')).toEqual([])
  })

  it('returns generated open slots, excluding a confirmed booking', async () => {
    db.availability.push({ id: 'a0', space_id: 'space-1', weekday: 2, start_minute: 600, end_minute: 720, slot_minutes: 30, timezone: 'UTC' })
    // Book the next available Tuesday 10:00 across the horizon (use a far-future confirmed row).
    const slotsBefore = await listOpenSlots('space-1')
    expect(slotsBefore.length).toBeGreaterThan(0)
    const first = slotsBefore[0]!.startsAt
    db.bookings.push({
      id: 'b0',
      space_id: 'space-1',
      member_profile_id: 'someone',
      starts_at: first,
      ends_at: first,
      status: 'confirmed',
      note: null,
    })
    const slotsAfter = await listOpenSlots('space-1')
    expect(slotsAfter.some((s) => s.startsAt === first)).toBe(false)
    expect(slotsAfter.length).toBe(slotsBefore.length - 1)
  })

  it('a cancelled booking does NOT block its slot', async () => {
    db.availability.push({ id: 'a0', space_id: 'space-1', weekday: 2, start_minute: 600, end_minute: 720, slot_minutes: 30, timezone: 'UTC' })
    const slots = await listOpenSlots('space-1')
    const first = slots[0]!.startsAt
    db.bookings.push({
      id: 'b0',
      space_id: 'space-1',
      member_profile_id: 'someone',
      starts_at: first,
      ends_at: first,
      status: 'cancelled',
      note: null,
    })
    const after = await listOpenSlots('space-1')
    expect(after.some((s) => s.startsAt === first)).toBe(true)
  })

  it('returns [] when the Space has no availability', async () => {
    expect(await listOpenSlots('space-1')).toEqual([])
  })
})

describe('createBooking (action)', () => {
  // The createBooking action derives "now" from the real system clock (new Date()), and the slot
  // generator only emits instants within HORIZON_DAYS of now. These tests assert against fixed
  // instants (the 2026-06-30 slot boundaries and a 2020 past time), so we FREEZE the clock to a
  // fixed instant where those dates land correctly: 2026-06-29T08:00:00Z makes the 2026-06-30 slots
  // future AND within the 14-day horizon, and the 2020 instant past. Without this the suite is a
  // time-bomb: once the real date reaches 2026-06-30 the "future" slot instants become past and the
  // off-boundary test wrongly trips the "already passed" guard before the slot-boundary guard.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-29T08:00:00.000Z'))
    db.availability.push({ id: 'a0', space_id: 'space-1', weekday: 2, start_minute: 600, end_minute: 720, slot_minutes: 30, timezone: 'UTC' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects an anonymous caller', async () => {
    currentProfileId = null
    const r = await createBooking('space-1', new Date('2026-06-30T10:00:00Z').toISOString())
    expect('error' in r).toBe(true)
    expect(db.bookings).toHaveLength(0)
  })

  it('rejects a past time', async () => {
    const r = await createBooking('space-1', new Date('2020-01-01T10:00:00Z').toISOString())
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/passed/i)
    expect(db.bookings).toHaveLength(0)
  })

  it('rejects a time that is not a published slot boundary', async () => {
    const r = await createBooking('space-1', new Date('2026-06-30T10:15:00Z').toISOString())
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/no longer available/i)
    expect(db.bookings).toHaveLength(0)
  })

  it('books a valid open slot (confirmed)', async () => {
    const open = await listOpenSlots('space-1')
    const target = open.find((s) => s.startsAt > NOW.toISOString())!.startsAt
    const r = await createBooking('space-1', target, '  Looking forward.  ')
    expect('error' in r).toBe(false)
    expect(db.bookings).toHaveLength(1)
    expect(db.bookings[0]!.status).toBe('confirmed')
    expect(db.bookings[0]!.member_profile_id).toBe(currentProfileId)
    expect(db.bookings[0]!.note).toBe('Looking forward.') // trimmed
    // ends_at = starts_at + 30 minutes.
    expect(new Date(db.bookings[0]!.ends_at).getTime() - new Date(target).getTime()).toBe(30 * 60000)
  })

  it('rejects an already-taken slot with a friendly message (pre-check)', async () => {
    const open = await listOpenSlots('space-1')
    const target = open[0]!.startsAt
    db.bookings.push({
      id: 'b0',
      space_id: 'space-1',
      member_profile_id: 'someone-else',
      starts_at: target,
      ends_at: target,
      status: 'confirmed',
      note: null,
    })
    const r = await createBooking('space-1', target)
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/just taken/i)
  })

  it('translates the unique-index race (insert error) into a friendly message', async () => {
    const open = await listOpenSlots('space-1')
    const target = open[0]!.startsAt
    db.failNextInsert = true // simulate the partial-unique-index rejection
    const r = await createBooking('space-1', target)
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/just taken/i)
  })
})

describe('cancelBooking (action) — permission', () => {
  beforeEach(() => {
    db.bookings.push({
      id: 'b1',
      space_id: 'space-1',
      member_profile_id: 'member-0000-4000-a000-0000000membr',
      starts_at: '2026-06-30T10:00:00.000Z',
      ends_at: '2026-06-30T10:30:00.000Z',
      status: 'confirmed',
      note: null,
    })
  })

  it('the booker may cancel their own booking', async () => {
    const r = await cancelBooking('b1')
    expect('error' in r).toBe(false)
    expect(db.bookings[0]!.status).toBe('cancelled')
  })

  it('a non-booker who is NOT an admin may not cancel', async () => {
    currentProfileId = 'other-0000-4000-a000-00000000othr'
    canEdit = false
    isAdmin = false
    const r = await cancelBooking('b1')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/permission/i)
    expect(db.bookings[0]!.status).toBe('confirmed') // unchanged
  })

  it('a space admin may cancel another member booking', async () => {
    currentProfileId = 'admin-0000-4000-a000-00000000admn'
    isAdmin = true
    const r = await cancelBooking('b1')
    expect('error' in r).toBe(false)
    expect(db.bookings[0]!.status).toBe('cancelled')
  })

  it('rejects an anonymous caller', async () => {
    currentProfileId = null
    const r = await cancelBooking('b1')
    expect('error' in r).toBe(true)
  })
})

describe('listSpaceBookings (action) — owner only', () => {
  beforeEach(() => {
    db.profiles.push({ id: 'm1', display_name: 'Ada Lovelace' })
    db.bookings.push({
      id: 'b1',
      space_id: 'space-1',
      member_profile_id: 'm1',
      starts_at: '2099-06-30T10:00:00.000Z',
      ends_at: '2099-06-30T10:30:00.000Z',
      status: 'confirmed',
      note: 'hi',
    })
  })

  it('returns [] for a non-editor (gated on canEditProfile)', async () => {
    canEdit = false
    expect(await listSpaceBookings('space-1')).toEqual([])
  })

  it('a platform janitor (staff preview) sees the real bookings even as a non-editor', async () => {
    canEdit = false
    currentWebRole = 'janitor'
    const list = await listSpaceBookings('space-1')
    expect(list).toHaveLength(1)
    expect(list[0]!.memberName).toBe('Ada Lovelace')
  })

  it('returns the owner upcoming bookings with the member display name', async () => {
    const list = await listSpaceBookings('space-1')
    expect(list).toHaveLength(1)
    expect(list[0]!.memberName).toBe('Ada Lovelace')
    expect(list[0]!.startsAt).toBe('2099-06-30T10:00:00.000Z')
  })

  it('falls back to a generic name when the profile is missing', async () => {
    db.profiles = []
    const list = await listSpaceBookings('space-1')
    expect(list[0]!.memberName).toBe('A member')
  })
})

// ── P1 (ADR-605): service durations slice the generator; window-to-service binding ──────────────
describe('generateOpenSlots with a service duration (P1, pure)', () => {
  it('slices a window by the SERVICE duration, not the window slot_minutes', () => {
    // Window 10:00-12:00 UTC declared at 30-min slots, but a 60-min service => 10:00, 11:00 only.
    const slots = generateOpenSlots([utcWindow()], new Set(), NOW, undefined, {
      durationMinutes: 60,
    }).filter((s) => s.startsAt.startsWith('2026-06-23'))
    expect(slots.map((s) => s.startsAt)).toEqual([
      '2026-06-23T10:00:00.000Z',
      '2026-06-23T11:00:00.000Z',
    ])
    // Every emitted slot carries the SERVICE length, so the surface labels it correctly.
    expect(slots.every((s) => s.slotMinutes === 60)).toBe(true)
  })

  it('drops the trailing partial against the SERVICE duration', () => {
    // 10:00-11:10 with a 45-min service => 10:00 fits (ends 10:45); 10:45 would end 11:30 > 11:10, dropped.
    const slots = generateOpenSlots([utcWindow({ endMinute: 670 })], new Set(), NOW, undefined, {
      durationMinutes: 45,
    }).filter((s) => s.startsAt.startsWith('2026-06-23'))
    expect(slots.map((s) => s.startsAt)).toEqual(['2026-06-23T10:00:00.000Z'])
  })

  it('a service longer than the window yields no slots for that window', () => {
    // A 120-min service does not fit a 120-min window? 10:00-12:00 is exactly 120 => one slot at 10:00.
    const exact = generateOpenSlots([utcWindow()], new Set(), NOW, undefined, {
      durationMinutes: 120,
    }).filter((s) => s.startsAt.startsWith('2026-06-23'))
    expect(exact.map((s) => s.startsAt)).toEqual(['2026-06-23T10:00:00.000Z'])
    // A 121-min service does not fit at all.
    const tooLong = generateOpenSlots([utcWindow()], new Set(), NOW, undefined, {
      durationMinutes: 130,
    }).filter((s) => s.startsAt.startsWith('2026-06-23'))
    expect(tooLong).toEqual([])
  })

  it('an out-of-range duration falls back to the window slot_minutes', () => {
    // A bogus 0-minute duration is ignored; the window's own 30-min slicing applies (four slots).
    const slots = generateOpenSlots([utcWindow()], new Set(), NOW, undefined, {
      durationMinutes: 0,
    }).filter((s) => s.startsAt.startsWith('2026-06-23'))
    expect(slots.length).toBe(4)
    expect(slots.every((s) => s.slotMinutes === 30)).toBe(true)
  })
})

describe('slotLengthAt with a service duration (P1, pure)', () => {
  it('validates the instant against the service duration and returns it', () => {
    const windows = [utcWindow()]
    // With a 60-min service, 11:00 is a real boundary (10:00 + 60), 10:30 is NOT.
    expect(slotLengthAt(windows, new Date('2026-06-23T11:00:00Z').getTime(), NOW, undefined, { durationMinutes: 60 })).toBe(60)
    expect(slotLengthAt(windows, new Date('2026-06-23T10:30:00Z').getTime(), NOW, undefined, { durationMinutes: 60 })).toBeNull()
  })
})

describe('windowsForService (pure)', () => {
  const general = utcWindow({ serviceTypeId: null })
  const boundA = utcWindow({ weekday: 3, serviceTypeId: 'svc-a' })
  const boundB = utcWindow({ weekday: 4, serviceTypeId: 'svc-b' })

  it('returns every window when no service is chosen', () => {
    expect(windowsForService([general, boundA, boundB], null)).toHaveLength(3)
  })

  it('keeps general (unbound) windows plus windows bound to the chosen service only', () => {
    const forA = windowsForService([general, boundA, boundB], 'svc-a')
    expect(forA).toContain(general)
    expect(forA).toContain(boundA)
    expect(forA).not.toContain(boundB)
  })
})

// ── P2 (ADR-605): buffers, minimum notice, booking window, date overrides (pure) ────────────────
describe('generateOpenSlots minimum notice (P2, pure)', () => {
  it('drops slots starting sooner than minNoticeMinutes from now', () => {
    // now 09:00Z, window 10:00-12:00 @30. A 120-min notice makes 11:00 the earliest bookable start.
    const slots = generateOpenSlots([utcWindow()], new Set(), NOW, undefined, {
      minNoticeMinutes: 120,
    }).filter((s) => s.startsAt.startsWith('2026-06-23'))
    expect(slots.map((s) => s.startsAt)).toEqual([
      '2026-06-23T11:00:00.000Z',
      '2026-06-23T11:30:00.000Z',
    ])
  })
})

describe('generateOpenSlots buffer-aware conflict (P2, pure)', () => {
  it('blocks slots within the before/after buffers of an existing booking', () => {
    // A 30-min booking 10:30-11:00. With 30-min buffers both sides, 10:00 (before) and 11:00 (after)
    // are blocked; 10:30 is the exact booked instant; only 11:30 survives today.
    const bookedRanges = [
      { startMs: new Date('2026-06-23T10:30:00Z').getTime(), endMs: new Date('2026-06-23T11:00:00Z').getTime() },
    ]
    const bookedExact = new Set([new Date('2026-06-23T10:30:00Z').getTime()])
    const slots = generateOpenSlots([utcWindow()], bookedExact, NOW, undefined, {
      bufferBeforeMinutes: 30,
      bufferAfterMinutes: 30,
      bookedRanges,
    }).filter((s) => s.startsAt.startsWith('2026-06-23'))
    expect(slots.map((s) => s.startsAt)).toEqual(['2026-06-23T11:30:00.000Z'])
  })

  it('allows back-to-back slots when buffers are zero (no false block)', () => {
    const bookedRanges = [
      { startMs: new Date('2026-06-23T10:30:00Z').getTime(), endMs: new Date('2026-06-23T11:00:00Z').getTime() },
    ]
    const slots = generateOpenSlots([utcWindow()], new Set(), NOW, undefined, {
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      bookedRanges,
    }).filter((s) => s.startsAt.startsWith('2026-06-23'))
    // 11:00 (immediately after the booking) is allowed with no buffer.
    expect(slots.map((s) => s.startsAt)).toContain('2026-06-23T11:00:00.000Z')
  })
})

describe('generateOpenSlots booking window horizon (P2, pure)', () => {
  it('a shorter horizon drops the far Tuesday', () => {
    const wide = generateOpenSlots([utcWindow()], new Set(), NOW, 14)
    expect(wide.some((s) => s.startsAt.startsWith('2026-06-30'))).toBe(true)
    const narrow = generateOpenSlots([utcWindow()], new Set(), NOW, 3)
    expect(narrow.some((s) => s.startsAt.startsWith('2026-06-30'))).toBe(false)
    // The near Tuesday (today) is still offered within the short window.
    expect(narrow.some((s) => s.startsAt.startsWith('2026-06-23'))).toBe(true)
  })
})

describe('generateOpenSlots date overrides (P2, pure)', () => {
  it('a blackout removes that local date but keeps other days', () => {
    const slots = generateOpenSlots([utcWindow()], new Set(), NOW, 14, {
      overrides: [{ date: '2026-06-23', isBlackout: true }],
    })
    expect(slots.some((s) => s.startsAt.startsWith('2026-06-23'))).toBe(false)
    expect(slots.some((s) => s.startsAt.startsWith('2026-06-30'))).toBe(true)
  })

  it('an open-block override replaces that day hours with its own block', () => {
    // Override 2026-06-23 to 14:00-15:00 UTC. The weekly 10:00-12:00 window is skipped that date;
    // the override injects 14:00 + 14:30 (default 30-min step).
    const slots = generateOpenSlots([utcWindow()], new Set(), NOW, 14, {
      overrides: [{ date: '2026-06-23', isBlackout: false, startMinute: 840, endMinute: 900 }],
      overrideTimezone: 'UTC',
    }).filter((s) => s.startsAt.startsWith('2026-06-23'))
    expect(slots.map((s) => s.startsAt)).toEqual([
      '2026-06-23T14:00:00.000Z',
      '2026-06-23T14:30:00.000Z',
    ])
  })
})

describe('slotLengthAt honors notice + overrides (P2, pure)', () => {
  it('rejects a slot inside the minimum notice', () => {
    const windows = [utcWindow()]
    // 10:00 is a real boundary but inside a 120-min notice from 09:00 => rejected.
    expect(slotLengthAt(windows, new Date('2026-06-23T10:00:00Z').getTime(), NOW, 14, { minNoticeMinutes: 120 })).toBeNull()
    // 11:00 is outside the notice => valid.
    expect(slotLengthAt(windows, new Date('2026-06-23T11:00:00Z').getTime(), NOW, 14, { minNoticeMinutes: 120 })).toBe(30)
  })

  it('rejects a slot on a blacked-out date', () => {
    const windows = [utcWindow()]
    expect(
      slotLengthAt(windows, new Date('2026-06-23T10:30:00Z').getTime(), NOW, 14, {
        overrides: [{ date: '2026-06-23', isBlackout: true }],
      }),
    ).toBeNull()
  })
})

// ── P3 (ADR-605): lifecycle policy window + questions/answers parsing (pure) ─────────────────────
describe('withinModifyWindow (P3, pure)', () => {
  it('allows a booking far enough out and blocks one inside the notice window', () => {
    const inThreeHours = new Date(Date.now() + 3 * 3600_000).toISOString()
    const inThirtyMin = new Date(Date.now() + 30 * 60_000).toISOString()
    expect(withinModifyWindow(inThreeHours, 60)).toBe(true) // 3h out, 1h notice
    expect(withinModifyWindow(inThirtyMin, 60)).toBe(false) // 30m out, 1h notice
  })
  it('a zero notice always allows a future booking; a past one is never modifiable', () => {
    expect(withinModifyWindow(new Date(Date.now() + 60_000).toISOString(), 0)).toBe(true)
    expect(withinModifyWindow(new Date(Date.now() - 60_000).toISOString(), 0)).toBe(false)
  })
})

describe('parseQuestions / parseAnswers (P3, pure, fail-closed)', () => {
  it('parses well-formed questions and drops malformed ones', () => {
    const qs = parseQuestions([
      { id: 'q1', label: 'Focus?', type: 'long', required: true },
      { id: '', label: 'no id' },
      { id: 'q2', label: '', type: 'short' },
      { id: 'q3', label: 'Goal?', type: 'weird', required: false },
    ])
    expect(qs).toEqual([
      { id: 'q1', label: 'Focus?', type: 'long', required: true },
      { id: 'q3', label: 'Goal?', type: 'short', required: false }, // unknown type -> short
    ])
  })
  it('parses labeled answers and drops entries missing a label or value', () => {
    const a = parseAnswers([
      { id: 'q1', label: 'Focus?', value: 'shoulders' },
      { id: 'q2', label: 'Goal?', value: '' },
      { label: '', value: 'x' },
    ])
    expect(a).toEqual([{ id: 'q1', label: 'Focus?', value: 'shoulders' }])
  })
  it('non-array input yields empty', () => {
    expect(parseQuestions(null)).toEqual([])
    expect(parseAnswers('nope')).toEqual([])
  })
})

describe('rescheduleBooking (action) — atomic new-then-cancel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-29T08:00:00.000Z')) // Monday; next Tue is 2026-06-30
    db.availability.push({ id: 'a0', space_id: 'space-1', weekday: 2, start_minute: 600, end_minute: 720, slot_minutes: 30, timezone: 'UTC' })
    db.bookings.push({
      id: 'b1',
      space_id: 'space-1',
      member_profile_id: 'member-0000-4000-a000-0000000membr',
      starts_at: '2026-06-30T10:00:00.000Z',
      ends_at: '2026-06-30T10:30:00.000Z',
      status: 'confirmed',
      note: null,
    })
  })
  afterEach(() => vi.useRealTimers())

  it('books the new slot and cancels the old (no free-then-lose)', async () => {
    const r = await rescheduleBooking('b1', '2026-06-30T10:30:00.000Z')
    expect('error' in r).toBe(false)
    // Old booking released.
    expect(db.bookings.find((b) => b.id === 'b1')!.status).toBe('cancelled')
    // A new confirmed booking exists at the new time.
    const fresh = db.bookings.find((b) => b.status === 'confirmed' && b.starts_at === '2026-06-30T10:30:00.000Z')
    expect(fresh).toBeTruthy()
  })

  it('keeps the old booking when the new slot is invalid', async () => {
    const r = await rescheduleBooking('b1', '2026-06-30T10:15:00.000Z') // not a slot boundary
    expect('error' in r).toBe(true)
    expect(db.bookings.find((b) => b.id === 'b1')!.status).toBe('confirmed') // unchanged
  })

  it('carries the original answers forward so a service with a REQUIRED question can be rescheduled', async () => {
    // A service with a required question, and an existing booking that already answered it. The reschedule
    // picker hides the question inputs, so without carrying answers forward the server would reject the move
    // with "Answer the required questions to book." (the pre-fix bug).
    db.serviceTypes.push({
      id: 'svc-1',
      space_id: 'space-1',
      name: 'Intro call',
      duration_minutes: 30,
      active: true,
      sort_order: 0,
      questions: [{ id: 'q1', label: 'Your goal', type: 'short', required: true }],
    })
    db.bookings.length = 0
    db.bookings.push({
      id: 'b1',
      space_id: 'space-1',
      member_profile_id: 'member-0000-4000-a000-0000000membr',
      starts_at: '2026-06-30T10:00:00.000Z',
      ends_at: '2026-06-30T10:30:00.000Z',
      status: 'confirmed',
      note: null,
      service_type_id: 'svc-1',
      answers: [{ id: 'q1', label: 'Your goal', value: 'Flexibility' }],
    })

    const r = await rescheduleBooking('b1', '2026-06-30T10:30:00.000Z', 'svc-1')
    expect('error' in r).toBe(false)
    expect(db.bookings.find((b) => b.id === 'b1')!.status).toBe('cancelled')
    const fresh = db.bookings.find(
      (b) => b.status === 'confirmed' && b.starts_at === '2026-06-30T10:30:00.000Z',
    )
    expect(fresh).toBeTruthy()
    // The answers rode along to the new booking (owner still sees them on the calendar).
    expect(fresh!.answers).toEqual([{ id: 'q1', label: 'Your goal', value: 'Flexibility' }])
  })
})

// ── P4 (ADR-605): deposits are DARK (double-gated off) ───────────────────────────────────────────
describe('deposits stay dark (P4)', () => {
  it('bookingDepositsLive is false with payments off', async () => {
    expect(await bookingDepositsLive()).toBe(false)
  })
  it('startServiceDeposit no-ops with a "payments not on" message and writes no booking', async () => {
    const r = await startServiceDeposit('space-1', 'svc-1', new Date('2099-06-30T10:00:00Z').toISOString())
    expect(r.url).toBeUndefined()
    expect(r.error).toMatch(/not turned on/i)
    expect(db.bookings).toHaveLength(0) // no hold placed
  })
})

// ── summarizeAvailability (pure, the owner-console at-a-glance read) ─────────────────────────────
describe('summarizeAvailability', () => {
  const w = (
    weekday: number,
    startMinute: number,
    endMinute: number,
    slotMinutes: number,
  ): AvailabilityWindow => ({ weekday, startMinute, endMinute, slotMinutes, timezone: 'UTC' })

  it('is all zero for no windows', () => {
    expect(summarizeAvailability([])).toEqual({
      windowCount: 0,
      dayCount: 0,
      weeklySlots: 0,
      slotLengths: [],
    })
  })

  it('counts only whole slots that fit (drops the trailing partial, like the generator)', () => {
    // 09:00-10:15 (75 min) at 30 min => 2 whole slots (the trailing 15 min is dropped).
    expect(summarizeAvailability([w(1, 540, 615, 30)]).weeklySlots).toBe(2)
  })

  it('aggregates days, weekly slots, and distinct ascending slot lengths', () => {
    const s = summarizeAvailability([
      w(1, 540, 600, 30), // Mon 09:00-10:00 @30 => 2
      w(1, 600, 660, 60), // Mon 10:00-11:00 @60 => 1
      w(3, 540, 600, 30), // Wed 09:00-10:00 @30 => 2
    ])
    expect(s.windowCount).toBe(3)
    expect(s.dayCount).toBe(2) // Mon + Wed (the two Monday windows collapse to one day)
    expect(s.weeklySlots).toBe(5)
    expect(s.slotLengths).toEqual([30, 60])
  })
})
