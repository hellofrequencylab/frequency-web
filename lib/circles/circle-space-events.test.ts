import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ADR-857: a circle attached to a Space makes its events that Space's events too.
// Two halves are locked here:
//   1. FUNCTIONAL — spaceIdForCircle derives the owning space, and transferCircle restamps the
//      circle's events' placement when the circle moves (the calendars follow the circle).
//   2. SOURCE-SHAPE — every circle-event writer derives placement through spaceIdForCircle, so a
//      new writer copy-pasted from an old one fails here instead of silently stamping root.

const ROOT_ID = 'f0000000-0000-4000-a000-00000000root'
const SPACE_A = 'aaaaaaaa-0000-4000-a000-00000000000a'
const SPACE_B = 'bbbbbbbb-0000-4000-a000-00000000000b'
const CIRCLE = 'cccccccc-0000-4000-a000-00000000000c'

// One tiny fake PostgREST: records every update per table with its filters.
const state: {
  circleRow: Record<string, unknown> | null
  updates: Array<{ table: string; patch: Record<string, unknown>; filters: Array<[string, unknown]> }>
} = { circleRow: null, updates: [] }

function builder(table: string) {
  const filters: Array<[string, unknown]> = []
  const api = {
    select: () => api,
    eq(col: string, val: unknown) {
      filters.push([col, val])
      return api
    },
    neq: () => api,
    order: () => api,
    limit: async () => ({ data: [], error: null }),
    async maybeSingle() {
      if (table === 'circles') return { data: state.circleRow, error: null }
      if (table === 'profiles') return { data: { id: 'someone' }, error: null }
      return { data: null, error: null }
    },
    update(patch: Record<string, unknown>) {
      const rec = { table, patch, filters }
      state.updates.push(rec)
      const chain = {
        eq(col: string, val: unknown) {
          filters.push([col, val])
          return chain
        },
        then(resolve: (v: { error: null }) => void) {
          resolve({ error: null })
        },
      }
      return chain
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))
vi.mock('@/lib/spaces/store', () => ({
  loadRootSpaceId: async () => ROOT_ID,
  getSpaceById: async (id: string) => ({ id, visibility: 'network' }),
}))
vi.mock('@/lib/spaces/entitlements', () => ({
  getSpaceCapabilities: async () => ({ canEditProfile: true }),
}))
vi.mock('@/lib/auth', () => ({
  isPlatformStaff: async () => false,
}))

import { spaceIdForCircle } from './store'
import { transferCircle } from './transfer'

beforeEach(() => {
  state.circleRow = null
  state.updates = []
})

describe('spaceIdForCircle (the one placement derivation)', () => {
  it('returns the owning space of a Space circle', async () => {
    state.circleRow = { space_id: SPACE_A }
    expect(await spaceIdForCircle(CIRCLE)).toBe(SPACE_A)
  })

  it('fails soft to null on a missing circle (placement never blocks a write)', async () => {
    state.circleRow = null
    expect(await spaceIdForCircle(CIRCLE)).toBeNull()
    expect(await spaceIdForCircle('')).toBeNull()
  })
})

describe('transferCircle restamps the circle events (calendars follow the circle)', () => {
  it('a move to a Space restamps circle-scoped events to that Space', async () => {
    state.circleRow = { id: CIRCLE, slug: 'c', host_id: 'me', space_id: SPACE_A }
    const res = await transferCircle(CIRCLE, { kind: 'space', spaceId: SPACE_B }, 'me')
    expect(res.ok).toBe(true)

    const eventUpdate = state.updates.find((u) => u.table === 'events')
    expect(eventUpdate).toBeDefined()
    expect(eventUpdate!.patch).toEqual({ space_id: SPACE_B })
    // Scoped to exactly this circle's events, nothing broader.
    expect(eventUpdate!.filters).toEqual(
      expect.arrayContaining([
        ['scope_type', 'circle'],
        ['scope_id', CIRCLE],
      ]),
    )
  })

  it('a move to a person restamps the events back to root (a personal circle)', async () => {
    state.circleRow = { id: CIRCLE, slug: 'c', host_id: 'me', space_id: SPACE_A }
    const res = await transferCircle(CIRCLE, { kind: 'person', profileId: 'me' }, 'me')
    expect(res.ok).toBe(true)

    const eventUpdate = state.updates.find((u) => u.table === 'events')
    expect(eventUpdate).toBeDefined()
    expect(eventUpdate!.patch).toEqual({ space_id: ROOT_ID })
  })
})

describe('every circle-event writer derives placement (source shape)', () => {
  const root = join(__dirname, '..', '..')
  const read = (p: string) => readFileSync(join(root, p), 'utf8')

  it.each([
    'app/(main)/events/actions.ts',
    'app/(main)/admin/events/actions.ts',
    'lib/circles/events.ts',
    'lib/journeys/runs.ts',
  ])('%s stamps circle events through spaceIdForCircle', (f) => {
    expect(read(f)).toContain('spaceIdForCircle')
  })

  it('the handoff accept restamps events to root, mirroring transferCircle', () => {
    const src = read('lib/circles/handoff.ts')
    expect(src).toMatch(/from\('events'\)[\s\S]{0,200}space_id: root/)
  })

  it('runs.ts derives at BOTH insert sites (kickoff and phase events)', () => {
    const src = read('lib/journeys/runs.ts')
    expect(src.match(/spaceIdForCircle\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})
