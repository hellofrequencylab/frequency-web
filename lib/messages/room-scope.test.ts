import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { belongsToRoomScope, joinRoomRefusal } from './room-scope'
import { sourceWithoutComments } from '@/test/source-shape'

// LIVE-651 / SEC-5. The membership walk is table-driven against the same chainable admin
// mock scoped-dm.test.ts uses. One case per rooms.visibility, plus the host/guide/mentor
// shortcuts and the fail-closed edges (no scope_id, inactive membership, missing row).

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}

function builder(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
  const api = {
    select() {
      return api
    },
    eq(col: string, val: unknown) {
      filters.push((r) => r[col] === val)
      return api
    },
    in(col: string, vals: unknown[]) {
      filters.push((r) => vals.includes(r[col]))
      return api
    },
    limit() {
      return api
    },
    async maybeSingle() {
      return { data: rows()[0] ?? null, error: null }
    },
    then(resolve: (v: { data: Row[]; error: null }) => void) {
      resolve({ data: rows(), error: null })
    },
  }
  return api
}

const admin = { from: (t: string) => builder(t) }
const ME = 'member-1'
const OTHER = 'stranger-1'
const CIRCLE = 'c-1'
const HUB = 'h-1'
const NEXUS = 'n-1'
const OUTPOST = 'o-1'
const CHANNEL = 'ch-1'

function tree(extra: Record<string, Row[]> = {}) {
  tables = {
    circles: [{ id: CIRCLE, hub_id: HUB, host_id: 'host-1' }],
    hubs: [{ id: HUB, nexus_id: NEXUS, guide_id: 'guide-1' }],
    nexuses: [{ id: NEXUS, outpost_id: OUTPOST, mentor_id: 'mentor-1' }],
    memberships: [{ id: 'm-1', circle_id: CIRCLE, profile_id: ME, status: 'active' }],
    topical_channel_memberships: [{ profile_id: ME, topical_channel_id: CHANNEL }],
    ...extra,
  }
}

beforeEach(() => {
  tables = {}
})

describe('belongsToRoomScope', () => {
  it('circle: an active member belongs, a stranger does not', async () => {
    tree()
    expect(await belongsToRoomScope(admin, { visibility: 'circle', scopeId: CIRCLE, profileId: ME })).toBe(true)
    expect(await belongsToRoomScope(admin, { visibility: 'circle', scopeId: CIRCLE, profileId: OTHER })).toBe(false)
  })

  it('circle: the host belongs without a memberships row', async () => {
    tree({ memberships: [] })
    expect(await belongsToRoomScope(admin, { visibility: 'circle', scopeId: CIRCLE, profileId: 'host-1' })).toBe(true)
    expect(await belongsToRoomScope(admin, { visibility: 'circle', scopeId: CIRCLE, profileId: ME })).toBe(false)
  })

  it('circle: an inactive membership is not enough', async () => {
    tree({ memberships: [{ id: 'm-1', circle_id: CIRCLE, profile_id: ME, status: 'left' }] })
    expect(await belongsToRoomScope(admin, { visibility: 'circle', scopeId: CIRCLE, profileId: ME })).toBe(false)
  })

  it('hub: a member of a Circle in the Hub belongs; a stranger does not', async () => {
    tree()
    expect(await belongsToRoomScope(admin, { visibility: 'hub', scopeId: HUB, profileId: ME })).toBe(true)
    expect(await belongsToRoomScope(admin, { visibility: 'hub', scopeId: HUB, profileId: OTHER })).toBe(false)
  })

  it('hub: the guide belongs without a circle membership', async () => {
    tree({ memberships: [] })
    expect(await belongsToRoomScope(admin, { visibility: 'hub', scopeId: HUB, profileId: 'guide-1' })).toBe(true)
  })

  it('nexus: a member of a Circle under the Nexus belongs; a stranger does not', async () => {
    tree()
    expect(await belongsToRoomScope(admin, { visibility: 'nexus', scopeId: NEXUS, profileId: ME })).toBe(true)
    expect(await belongsToRoomScope(admin, { visibility: 'nexus', scopeId: NEXUS, profileId: OTHER })).toBe(false)
  })

  it('nexus: the mentor belongs without a circle membership', async () => {
    tree({ memberships: [] })
    expect(await belongsToRoomScope(admin, { visibility: 'nexus', scopeId: NEXUS, profileId: 'mentor-1' })).toBe(true)
  })

  it('outpost: a member of a Circle under a Nexus on the Outpost belongs; a stranger does not', async () => {
    tree()
    expect(await belongsToRoomScope(admin, { visibility: 'outpost', scopeId: OUTPOST, profileId: ME })).toBe(true)
    expect(await belongsToRoomScope(admin, { visibility: 'outpost', scopeId: OUTPOST, profileId: OTHER })).toBe(false)
  })

  it('channel: tune-in belongs; a member who is not tuned in does not', async () => {
    tree()
    expect(await belongsToRoomScope(admin, { visibility: 'channel', scopeId: CHANNEL, profileId: ME })).toBe(true)
    expect(await belongsToRoomScope(admin, { visibility: 'channel', scopeId: CHANNEL, profileId: OTHER })).toBe(false)
  })

  it('fails closed: no scope_id, a missing scope row, public/private, unknown visibility', async () => {
    tree()
    expect(await belongsToRoomScope(admin, { visibility: 'circle', scopeId: null, profileId: ME })).toBe(false)
    expect(await belongsToRoomScope(admin, { visibility: 'circle', scopeId: 'missing', profileId: ME })).toBe(false)
    expect(await belongsToRoomScope(admin, { visibility: 'public', scopeId: CIRCLE, profileId: ME })).toBe(false)
    expect(await belongsToRoomScope(admin, { visibility: 'private', scopeId: CIRCLE, profileId: ME })).toBe(false)
    expect(await belongsToRoomScope(admin, { visibility: 'mystery', scopeId: CIRCLE, profileId: ME })).toBe(false)
  })
})

describe('joinRoomRefusal', () => {
  it('names the scope in house voice, with no em dash', () => {
    expect(joinRoomRefusal('private')).toBe('This room is private. You need an invite to join.')
    expect(joinRoomRefusal('circle')).toContain('Circle')
    expect(joinRoomRefusal('hub')).toContain('Hub')
    expect(joinRoomRefusal('nexus')).toContain('Nexus')
    expect(joinRoomRefusal('outpost')).toContain('Outpost')
    expect(joinRoomRefusal('channel')).toContain('Tune into this Channel')
    for (const v of ['public', 'private', 'circle', 'hub', 'nexus', 'outpost', 'channel', 'other']) {
      expect(joinRoomRefusal(v)).not.toContain('—')
    }
  })
})

const joinSource = sourceWithoutComments('app/(main)/messages/rooms/actions.ts', { imports: true })
const joinAt = joinSource.indexOf('export async function joinRoom')
const joinBody = joinSource.slice(joinAt, joinSource.indexOf('\nexport ', joinAt + 10))

describe('joinRoom actually asks this module (guards a vacuous pass)', () => {
  it('the action file is a real file and joinRoom is in it', () => {
    expect(readFileSync('app/(main)/messages/rooms/actions.ts', 'utf8').length).toBeGreaterThan(1000)
    expect(joinAt).toBeGreaterThan(0)
    expect(joinBody.length).toBeGreaterThan(200)
  })

  it('joinRoom reads scope_id and compares circle, hub, nexus, outpost and channel membership', () => {
    expect(joinBody).toContain('scope_id')
    expect(joinBody).toContain('belongsToRoomScope')
    expect(joinBody).toContain("visibility === 'circle'")
    expect(joinBody).toContain("visibility === 'hub'")
    expect(joinBody).toContain("visibility === 'nexus'")
    expect(joinBody).toContain("visibility === 'outpost'")
    expect(joinBody).toContain("visibility === 'channel'")
  })
})
