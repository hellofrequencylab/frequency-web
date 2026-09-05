import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ADR-858: Space Dispatches ride the existing rail (one `dispatches` row scoped to
// the Space), and push fan-out reaches every active member EXCEPT the author.
// Two halves are locked here:
//   1. FUNCTIONAL — composeSpaceDispatch publishes the correctly-scoped row, skips
//      an empty body without touching the database, and never pushes the author.
//   2. SOURCE-SHAPE — the 'space' scope exists end-to-end: the migration widens the
//      CHECK, and both read paths (rail widget + weekly digest) carry a space branch,
//      so a partial revert fails here instead of silently dropping the lane.

const SPACE = 'aaaaaaaa-0000-4000-a000-00000000000a'
const OWNER = '00000000-0000-4000-a000-0000000owner'
const MEMBER = '00000000-0000-4000-a000-000000member'
const AUTHOR = OWNER
const DISPATCH_ID = 'dddddddd-0000-4000-a000-00000000000d'

// One tiny fake PostgREST: records every insert per table with its payload.
const state: {
  inserts: Array<{ table: string; row: Record<string, unknown> }>
} = { inserts: [] }

function builder(table: string) {
  const api = {
    select: () => api,
    eq: () => api,
    async maybeSingle() {
      if (table === 'spaces') return { data: { name: 'Riverside Studio' }, error: null }
      return { data: null, error: null }
    },
    insert(row: Record<string, unknown>) {
      state.inserts.push({ table, row })
      return {
        select: () => ({
          maybeSingle: async () => ({ data: { id: DISPATCH_ID }, error: null }),
        }),
      }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))
vi.mock('@/lib/spaces/resonance-roster', () => ({
  listActiveSpaceMemberIds: async () => [OWNER, MEMBER],
}))
const routeNotification = vi.fn(async (_event: unknown, _recipient: unknown, _ctx: unknown) => ({
  enqueuedCount: 1,
  outcomes: [],
  event: 'event.dispatch',
}))
vi.mock('@/lib/notifications/router', () => ({
  routeNotification: (event: unknown, recipient: unknown, ctx: unknown) =>
    routeNotification(event, recipient, ctx),
}))

import { composeSpaceDispatch } from './dispatch'

beforeEach(() => {
  state.inserts = []
  routeNotification.mockClear()
})

describe('composeSpaceDispatch (the publish half)', () => {
  it('publishes one dispatches row scoped to the Space', async () => {
    const res = await composeSpaceDispatch({ spaceId: SPACE, authorId: AUTHOR, body: 'Doors open at 7.' })
    expect(res.dispatchId).toBe(DISPATCH_ID)

    const insert = state.inserts.find((i) => i.table === 'dispatches')
    expect(insert).toBeDefined()
    expect(insert!.row).toMatchObject({
      author_id: AUTHOR,
      audience_scope: 'space',
      audience_id: SPACE,
      dispatch_type: 'post',
      status: 'published',
    })
    expect(insert!.row.published_at).toBeTruthy()
    // No caller title → the Space's name carries the default.
    expect(insert!.row.title).toBe('From Riverside Studio')
  })

  it('excludes the author from the push fan-out', async () => {
    const res = await composeSpaceDispatch({ spaceId: SPACE, authorId: AUTHOR, body: 'Doors open at 7.' })
    expect(res.enqueued).toBe(1)

    const pushedTo = routeNotification.mock.calls.map((c) => (c[1] as { profileId: string }).profileId)
    expect(pushedTo).toEqual([MEMBER])
    expect(pushedTo).not.toContain(AUTHOR)
  })

  it('names the Space as the subject, so "Mute a Circle or Space" actually mutes it', async () => {
    // 🔴 This fan-out passed a bare `{ profileId }` while `spaceId` was its own argument (meta-scan
    // B9 D2). The gate only consults a member's per-subject mute when the send names its subject,
    // so the settings card wrote 21 rows per mute that nothing read. The recipient now carries it.
    await composeSpaceDispatch({ spaceId: SPACE, authorId: AUTHOR, body: 'Doors open at 7.' })
    expect(routeNotification.mock.calls[0][1]).toEqual({
      profileId: MEMBER,
      subject: { subjectType: 'space', subjectId: SPACE },
    })
  })

  it('requires a body: an empty body returns null without inserting', async () => {
    const res = await composeSpaceDispatch({ spaceId: SPACE, authorId: AUTHOR, body: '   ' })
    expect(res).toEqual({ dispatchId: null, enqueued: 0 })
    expect(state.inserts).toHaveLength(0)
    expect(routeNotification).not.toHaveBeenCalled()
  })
})

describe("the 'space' scope exists end-to-end (source shape)", () => {
  const root = join(__dirname, '..', '..')
  const read = (p: string) => readFileSync(join(root, p), 'utf8')

  it('the migration widens the audience_scope CHECK to include space', () => {
    const sql = read('supabase/migrations/20270106000000_space_dispatch_scope.sql')
    expect(sql).toMatch(/audience_scope in \('circle', 'hub', 'nexus', 'global', 'space'\)/)
    // A scoped tier: 'space' must sit on the NOT NULL side of the audience_id pair.
    expect(sql).toMatch(/'space'\)\s+and audience_id is not null/)
  })

  it('the rail read (lib/dispatches.ts) carries a space branch', () => {
    expect(read('lib/dispatches.ts')).toContain(".eq('audience_scope', 'space')")
  })

  it('the weekly digest (lib/digest.ts) carries a space branch', () => {
    expect(read('lib/digest.ts')).toContain('audience_scope.eq.space')
  })
})
