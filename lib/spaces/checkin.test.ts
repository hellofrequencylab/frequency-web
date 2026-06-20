import { describe, it, expect, beforeEach, vi } from 'vitest'

// EVENT SPACE CHECK-IN (ENTITY-SPACES-BUILD §C, Phase 2). What is locked here, all network-free (the
// supabase admin client + auth + store + capability seam are mocked):
//   1. PURE normalization is fail-safe: a malformed `since` reads as null (no lower bound), a bad
//      limit clamps to the default, both pure.
//   2. PERMISSION GATING: ensureCheckinNode / listCheckins / countCheckins require canEditProfile (an
//      anonymous + a non-editor caller are rejected, nothing is read / created; [] / 0 / null back).
//   3. CROSS-SPACE ISOLATION: an owner of Space A reads only A's check-in node + captures, never B's,
//      even though both live in the same nodes/captures tables (the lib scopes by space_id).
//   4. ROSTER correctness: newest-first, names resolved, a generic fallback when a profile is missing.
//   5. ensureCheckinNode is create-or-get: it reuses the existing kind='checkin' node for the Space,
//      and only an EDITOR mints one (a janitor previewer reads an existing node but never creates).

// ── Mock the caller identity + Space resolver + capability seam (toggled per test) ──────────────
let currentProfileId: string | null = 'owner-A'
let currentWebRole: 'none' | 'admin' | 'janitor' = 'none'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
  getCallerProfile: async () =>
    currentProfileId ? { id: currentProfileId, webRole: currentWebRole } : null,
}))

// Two Spaces, A and B, each owned by a different profile. getSpaceById returns whichever id is asked.
const spaces: Record<string, { id: string; slug: string; name: string; brandName: string | null; ownerProfileId: string }> = {
  'space-A': { id: 'space-A', slug: 'a', name: 'Alpha', brandName: 'Alpha', ownerProfileId: 'owner-A' },
  'space-B': { id: 'space-B', slug: 'b', name: 'Beta', brandName: 'Beta', ownerProfileId: 'owner-B' },
}
vi.mock('./store', () => ({
  getSpaceById: async (id: string) => spaces[id] ?? null,
}))

// canEditProfile is true only when the caller OWNS the space being asked about (the real gate's shape).
vi.mock('./entitlements', () => ({
  getSpaceCapabilities: async (
    space: { ownerProfileId?: string | null } | null | undefined,
    profileId: string | null | undefined,
  ) => {
    const isOwner = !!space?.ownerProfileId && space.ownerProfileId === profileId
    return {
      isOwner,
      isAdmin: isOwner,
      role: isOwner ? 'admin' : null,
      canEditProfile: isOwner,
      canManageMembers: isOwner,
      canInvite: isOwner,
    }
  },
}))

// ── A chainable admin-client mock backed by an in-memory store ──────────────────────────────────
type NodeRow = {
  id: string
  type: string
  kind: string
  space_id: string
  label: string | null
  secret: string | null
  capture_rule: string
  zaps_value: number
  active: boolean
  created_at: string
}
type CaptureRow = { id: string; node_id: string; actor_profile_id: string; captured_at: string }
const store = {
  nodes: [] as NodeRow[],
  captures: [] as CaptureRow[],
  profiles: [] as { id: string; display_name: string | null; handle: string | null; avatar_url: string | null }[],
  nodeInserts: [] as Record<string, unknown>[],
}

function nodesBuilder() {
  const filters: { space_id?: string; kind?: string } = {}
  let pendingInsert: Record<string, unknown> | null = null
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'space_id') filters.space_id = val
      if (col === 'kind') filters.kind = val
      return api
    },
    order() {
      return api
    },
    limit() {
      return api
    },
    insert(rows: Record<string, unknown>[]) {
      pendingInsert = rows[0] ?? null
      return api
    },
    async maybeSingle() {
      if (pendingInsert) {
        store.nodeInserts.push(pendingInsert)
        const row = {
          id: `node-${store.nodes.length}`,
          created_at: new Date().toISOString(),
          ...(pendingInsert as object),
        } as NodeRow
        store.nodes.push(row)
        return { data: row, error: null }
      }
      let rows = store.nodes
      if (filters.space_id) rows = rows.filter((n) => n.space_id === filters.space_id)
      if (filters.kind) rows = rows.filter((n) => n.kind === filters.kind)
      return { data: rows[0] ?? null, error: null }
    },
  }
  return api
}

function capturesBuilder() {
  const filters: { node_id?: string; since?: string } = {}
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'node_id') filters.node_id = val
      return api
    },
    gte(col: string, val: string) {
      if (col === 'captured_at') filters.since = val
      return api
    },
    order() {
      return api
    },
    limit() {
      return api
    },
    then(resolve: (r: { data: CaptureRow[] | null; error: null; count: number }) => unknown) {
      let data = store.captures.filter((c) => c.node_id === filters.node_id)
      if (filters.since) data = data.filter((c) => c.captured_at >= filters.since!)
      // newest first (the lib asks for desc; the mock sorts to match)
      data = [...data].sort((a, b) => (a.captured_at < b.captured_at ? 1 : -1))
      // The list path reads `data`; the head/count path (countCheckins) awaits the same builder and
      // reads `count`. Surfacing both keeps the one mock honest for either query.
      return Promise.resolve(resolve({ data, error: null, count: data.length }))
    },
  }
  return api
}

function profilesBuilder() {
  return {
    select() {
      return {
        async in(_col: string, ids: string[]) {
          return { data: store.profiles.filter((p) => ids.includes(p.id)) }
        },
      }
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'nodes') return nodesBuilder()
      if (table === 'captures') return capturesBuilder()
      if (table === 'profiles') return profilesBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  normalizeSince,
  normalizeLimit,
  ensureCheckinNode,
  listCheckins,
  countCheckins,
} from './checkin'

beforeEach(() => {
  currentProfileId = 'owner-A'
  currentWebRole = 'none'
  store.nodes = []
  store.captures = []
  store.profiles = []
  store.nodeInserts = []
})

function seedCheckinNode(spaceId: string, id: string) {
  store.nodes.push({
    id,
    type: 'qr',
    kind: 'checkin',
    space_id: spaceId,
    label: `${spaceId} check-in`,
    secret: 'sek',
    capture_rule: 'repeatable',
    zaps_value: 0,
    active: true,
    created_at: '2026-06-01T00:00:00.000Z',
  })
}

describe('normalizeSince (pure, fail-safe)', () => {
  it('returns an ISO string for a valid timestamp', () => {
    expect(normalizeSince('2026-06-20T10:00:00Z')).toBe('2026-06-20T10:00:00.000Z')
  })
  it('returns null for a non-string / unparseable value', () => {
    expect(normalizeSince(undefined)).toBeNull()
    expect(normalizeSince('not-a-date')).toBeNull()
    expect(normalizeSince(42)).toBeNull()
    expect(normalizeSince('')).toBeNull()
  })
})

describe('normalizeLimit (pure)', () => {
  it('clamps to [1, 500] and defaults a bad value', () => {
    expect(normalizeLimit(10)).toBe(10)
    expect(normalizeLimit(99999)).toBe(500)
    expect(normalizeLimit(0)).toBe(200)
    expect(normalizeLimit(-5)).toBe(200)
    expect(normalizeLimit('nope')).toBe(200)
  })
})

describe('ensureCheckinNode (create-or-get, gated)', () => {
  it('rejects an anonymous caller (no node created)', async () => {
    currentProfileId = null
    expect(await ensureCheckinNode('space-A')).toBeNull()
    expect(store.nodeInserts).toHaveLength(0)
  })

  it('rejects a non-owner (no node created)', async () => {
    currentProfileId = 'owner-B' // not the owner of space-A
    expect(await ensureCheckinNode('space-A')).toBeNull()
    expect(store.nodeInserts).toHaveLength(0)
  })

  it('creates a check-in node for the owner on first call', async () => {
    const node = await ensureCheckinNode('space-A')
    expect(node).not.toBeNull()
    expect(store.nodeInserts).toHaveLength(1)
    expect(store.nodeInserts[0]!.kind).toBe('checkin')
    expect(store.nodeInserts[0]!.space_id).toBe('space-A')
    expect(store.nodeInserts[0]!.type).toBe('qr') // routes through the normal scan pipeline
  })

  it('reuses the existing node on a second call (idempotent)', async () => {
    seedCheckinNode('space-A', 'node-A')
    const node = await ensureCheckinNode('space-A')
    expect(node?.id).toBe('node-A')
    expect(store.nodeInserts).toHaveLength(0) // no new node minted
  })

  it('a janitor previewer reads an existing node but never mints one', async () => {
    currentProfileId = 'staffer'
    currentWebRole = 'janitor'
    // No node yet: a previewer cannot create one.
    expect(await ensureCheckinNode('space-A')).toBeNull()
    expect(store.nodeInserts).toHaveLength(0)
    // An existing node IS readable to the previewer.
    seedCheckinNode('space-A', 'node-A')
    expect((await ensureCheckinNode('space-A'))?.id).toBe('node-A')
  })
})

describe('listCheckins (roster, gated + isolated)', () => {
  beforeEach(() => {
    seedCheckinNode('space-A', 'node-A')
    seedCheckinNode('space-B', 'node-B')
    store.profiles.push(
      { id: 'p1', display_name: 'Ada Lovelace', handle: 'ada', avatar_url: null },
      { id: 'p2', display_name: 'Alan Turing', handle: 'alan', avatar_url: null },
    )
    // Two check-ins at A, one at B.
    store.captures.push(
      { id: 'cap1', node_id: 'node-A', actor_profile_id: 'p1', captured_at: '2026-06-20T09:00:00.000Z' },
      { id: 'cap2', node_id: 'node-A', actor_profile_id: 'p2', captured_at: '2026-06-20T10:00:00.000Z' },
      { id: 'capB', node_id: 'node-B', actor_profile_id: 'p1', captured_at: '2026-06-20T11:00:00.000Z' },
    )
  })

  it('rejects an anonymous caller', async () => {
    currentProfileId = null
    expect(await listCheckins('space-A')).toEqual([])
  })

  it('rejects a non-owner', async () => {
    currentProfileId = 'owner-B' // not the owner of space-A
    expect(await listCheckins('space-A')).toEqual([])
  })

  it('CROSS-SPACE ISOLATION: owner A sees only A check-ins, never B', async () => {
    const roster = await listCheckins('space-A')
    expect(roster.map((r) => r.id)).toEqual(['cap2', 'cap1']) // A only, newest first
    expect(roster.some((r) => r.id === 'capB')).toBe(false)
  })

  it('owner B sees only B check-ins', async () => {
    currentProfileId = 'owner-B'
    const roster = await listCheckins('space-B')
    expect(roster.map((r) => r.id)).toEqual(['capB'])
  })

  it('resolves checker names + handles, newest first', async () => {
    const roster = await listCheckins('space-A')
    expect(roster[0]!.name).toBe('Alan Turing')
    expect(roster[0]!.handle).toBe('alan')
    expect(roster[1]!.name).toBe('Ada Lovelace')
  })

  it('falls back to a generic name when the profile is missing', async () => {
    store.profiles = []
    const roster = await listCheckins('space-A')
    expect(roster[0]!.name).toBe('A member')
    expect(roster[0]!.handle).toBeNull()
  })

  it('returns [] when the Space has no check-in node', async () => {
    store.nodes = store.nodes.filter((n) => n.space_id !== 'space-A')
    expect(await listCheckins('space-A')).toEqual([])
  })

  it('honors a `since` lower bound', async () => {
    const roster = await listCheckins('space-A', '2026-06-20T09:30:00.000Z')
    expect(roster.map((r) => r.id)).toEqual(['cap2']) // cap1 (09:00) is before the bound
  })

  it('ignores a malformed `since` (no lower bound applied)', async () => {
    const roster = await listCheckins('space-A', 'not-a-date')
    expect(roster).toHaveLength(2)
  })
})

describe('countCheckins (analytics, gated)', () => {
  beforeEach(() => {
    seedCheckinNode('space-A', 'node-A')
    store.captures.push(
      { id: 'cap1', node_id: 'node-A', actor_profile_id: 'p1', captured_at: '2026-06-20T09:00:00.000Z' },
      { id: 'cap2', node_id: 'node-A', actor_profile_id: 'p2', captured_at: '2026-06-20T10:00:00.000Z' },
    )
  })

  it('counts this Space check-ins for the owner', async () => {
    expect(await countCheckins('space-A')).toBe(2)
  })

  it('returns 0 for a non-owner (gated)', async () => {
    currentProfileId = 'owner-B'
    expect(await countCheckins('space-A')).toBe(0)
  })
})
