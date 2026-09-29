import { describe, it, expect, beforeEach, vi } from 'vitest'

// LIVE-651 (SEC-5, ADR-1626): joinRoom used to refuse only `private` rooms and upsert a
// room_members row through the ADMIN client for everything else, so any signed-in member could
// join a Circle, Hub, Nexus, Outpost or Channel room by posting its id. These tests run the real
// action and the real scope check against a small in-memory place tree, and prove both halves for
// every scoped kind: a stranger is refused and no row is written; someone inside gets in.

type Row = Record<string, unknown>

const { db, upserts, getCallerProfile, revalidatePath } = vi.hoisted(() => ({
  db: {} as Record<string, Array<Record<string, unknown>>>,
  upserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  getCallerProfile: vi.fn(),
  revalidatePath: vi.fn(),
}))

// A tiny PostgREST stand-in: select / eq / in / match / limit, awaited or via maybeSingle.
function query(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let max = Infinity
  const run = () => ({ data: (db[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, max), error: null })
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), q),
    in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), q),
    match: (m: Row) => (filters.push((r) => Object.entries(m).every(([k, v]) => r[k] === v)), q),
    limit: (n: number) => ((max = n), q),
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  }
  return q
}

vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`)
  },
}))
vi.mock('@/lib/auth', () => ({ getCallerProfile, getMyProfileId: vi.fn() }))
vi.mock('@/lib/ai/room-search', () => ({ searchRoom: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      ...query(table),
      upsert: async (row: Row) => {
        upserts.push({ table, row })
        return { error: null }
      },
    }),
  }),
}))

import { joinRoom, inviteToRoom } from './actions'

// ── The place tree: Outpost O > Nexus N > Hub H > Circle C, plus a Channel T ──
const OUTPOST = 'o-1'
const NEXUS = 'n-1'
const HUB = 'h-1'
const CIRCLE = 'c-1'
const OTHER_CIRCLE = 'c-2' // a Circle in no Hub: its member belongs to none of the places above
const CHANNEL = 't-1'

const INSIDER = 'p-insider' // active member of Circle C, tuned into Channel T
const STRANGER = 'p-stranger' // active member of OTHER_CIRCLE only, tuned into nothing
const LAPSED = 'p-lapsed' // an INACTIVE membership in Circle C
const HOST = 'p-host' // hosts Circle C through the leader column, holds no membership row
const STEWARD = 'p-steward' // an active stewardship edge on the Outpost, no membership

const ROOMS: Record<string, { visibility: string; scope_id: string | null }> = {
  'room-circle': { visibility: 'circle', scope_id: CIRCLE },
  'room-hub': { visibility: 'hub', scope_id: HUB },
  'room-nexus': { visibility: 'nexus', scope_id: NEXUS },
  'room-outpost': { visibility: 'outpost', scope_id: OUTPOST },
  'room-channel': { visibility: 'channel', scope_id: CHANNEL },
}
const SCOPED_ROOM_IDS = Object.keys(ROOMS)

function seed() {
  for (const k of Object.keys(db)) delete db[k]
  db.rooms = [
    ...Object.entries(ROOMS).map(([id, r]) => ({ id, ...r })),
    { id: 'room-public', visibility: 'public', scope_id: null },
    { id: 'room-private', visibility: 'private', scope_id: null },
    { id: 'room-orphan', visibility: 'circle', scope_id: null },
    { id: 'room-unknown', visibility: 'galaxy', scope_id: CIRCLE },
  ]
  db.memberships = [
    { profile_id: INSIDER, circle_id: CIRCLE, status: 'active' },
    { profile_id: STRANGER, circle_id: OTHER_CIRCLE, status: 'active' },
    { profile_id: LAPSED, circle_id: CIRCLE, status: 'inactive' },
  ]
  db.circles = [
    { id: CIRCLE, hub_id: HUB, host_id: HOST },
    { id: OTHER_CIRCLE, hub_id: null, host_id: null },
  ]
  db.hubs = [{ id: HUB, nexus_id: NEXUS, guide_id: null }]
  db.nexuses = [{ id: NEXUS, outpost_id: OUTPOST, mentor_id: null }]
  db.stewardships = [{ id: 's-1', profile_id: STEWARD, scope_type: 'outpost', scope_id: OUTPOST, state: 'active' }]
  db.topical_channel_memberships = [{ profile_id: INSIDER, topical_channel_id: CHANNEL }]
  db.room_members = []
  db.friendships = []
}

function joinedAs(profileId: string, roomId: string) {
  return upserts.some((u) => u.table === 'room_members' && u.row.profile_id === profileId && u.row.room_id === roomId)
}

async function joinAs(profileId: string, roomId: string) {
  getCallerProfile.mockResolvedValue({ id: profileId })
  return joinRoom(roomId)
}

beforeEach(() => {
  vi.clearAllMocks()
  upserts.length = 0
  seed()
})

describe('joinRoom refuses a caller outside the room scope (LIVE-651)', () => {
  it.each(SCOPED_ROOM_IDS)('refuses a stranger at %s and writes no membership', async (roomId) => {
    await expect(joinAs(STRANGER, roomId)).rejects.toThrow()
    expect(joinedAs(STRANGER, roomId)).toBe(false)
    expect(upserts).toHaveLength(0)
  })

  it('refuses in the naming canon words: join a Circle, tune into a Channel, no em dash', async () => {
    await expect(joinAs(STRANGER, 'room-circle')).rejects.toThrow('Join the Circle first.')
    await expect(joinAs(STRANGER, 'room-channel')).rejects.toThrow('Tune into this Channel to join its room.')
    for (const roomId of SCOPED_ROOM_IDS) {
      await expect(joinAs(STRANGER, roomId)).rejects.toThrow(/^[^—]*$/)
    }
  })

  it('refuses an inactive membership in the Circle', async () => {
    await expect(joinAs(LAPSED, 'room-circle')).rejects.toThrow()
    expect(upserts).toHaveLength(0)
  })

  it('fails closed on a scoped room with no scope id, and on a kind it does not know', async () => {
    await expect(joinAs(INSIDER, 'room-orphan')).rejects.toThrow()
    await expect(joinAs(INSIDER, 'room-unknown')).rejects.toThrow('You cannot join this room.')
    expect(upserts).toHaveLength(0)
  })

  it('still refuses a private room', async () => {
    await expect(joinAs(INSIDER, 'room-private')).rejects.toThrow('This room is private')
    expect(upserts).toHaveLength(0)
  })
})

describe('joinRoom still lets someone inside the scope in', () => {
  it.each(SCOPED_ROOM_IDS)('lets the Circle member (tuned into the Channel) join %s', async (roomId) => {
    await joinAs(INSIDER, roomId)
    expect(joinedAs(INSIDER, roomId)).toBe(true)
    expect(revalidatePath).toHaveBeenCalledWith(`/messages/r/${roomId}`)
  })

  it('lets the Circle host in through the leader column', async () => {
    await joinAs(HOST, 'room-circle')
    expect(joinedAs(HOST, 'room-circle')).toBe(true)
  })

  it('lets a steward of the Outpost into its room, and nowhere it has no edge', async () => {
    await joinAs(STEWARD, 'room-outpost')
    expect(joinedAs(STEWARD, 'room-outpost')).toBe(true)
    await expect(joinAs(STEWARD, 'room-circle')).rejects.toThrow()
  })

  it('keeps a public room open to anyone signed in', async () => {
    await joinAs(STRANGER, 'room-public')
    expect(joinedAs(STRANGER, 'room-public')).toBe(true)
  })
})

describe('inviteToRoom asks the same scope question of the invitee', () => {
  beforeEach(() => {
    db.room_members = [{ room_id: 'room-circle', profile_id: INSIDER, is_admin: false }]
    db.friendships = [
      { user_a_id: INSIDER < STRANGER ? INSIDER : STRANGER, user_b_id: INSIDER < STRANGER ? STRANGER : INSIDER, status: 'accepted' },
      { user_a_id: INSIDER < HOST ? INSIDER : HOST, user_b_id: INSIDER < HOST ? HOST : INSIDER, status: 'accepted' },
    ]
    getCallerProfile.mockResolvedValue({ id: INSIDER })
  })

  it('refuses to add a friend from outside the Circle to its room', async () => {
    await expect(inviteToRoom('room-circle', STRANGER)).rejects.toThrow('cannot be added')
    expect(upserts).toHaveLength(0)
  })

  it('adds a friend who belongs to the Circle', async () => {
    await inviteToRoom('room-circle', HOST)
    expect(joinedAs(HOST, 'room-circle')).toBe(true)
  })
})
