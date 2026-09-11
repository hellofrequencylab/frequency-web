import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// LIVE-295 — the post box's space-scoped Dispatch send.
//
// 🔴 THE ONE THING THAT MUST NOT GO WRONG. lib/events/dispatch.ts writes audience_scope 'global',
// which is EVERY member of the platform. A space Dispatch that landed as global would be a
// mass-notification incident, not a bug. So the load-bearing test here is not "the happy path
// works" (that is one `it`), it is the SWEEP: every reachable outcome of sendSpaceDispatch is driven
// once, and the assertion is made over the rows that actually reached the database — a row is
// written only at audience_scope 'space' with audience_id equal to the SERVER-resolved Space id, and
// no refusal writes anything at all.
//
// The real `composeSpaceDispatch` runs (only the Supabase admin client, the roster and the
// notification router are faked), so what is asserted is the REAL insert payload, not a re-statement
// of the action's intent. Breaking either half fails this file: change the writer's scope literal and
// every sweep row goes red; delete a refusal and its case writes a row where zero were allowed.

const SPACE_ID = 'aaaaaaaa-0000-4000-a000-00000000000a'
const OTHER_SPACE_ID = 'bbbbbbbb-0000-4000-b000-00000000000b'
const SLUG = 'riverside-studio'
const OWNER = '00000000-0000-4000-a000-0000000owner'
const MEMBER = '00000000-0000-4000-a000-000000member'
const DISPATCH_ID = 'dddddddd-0000-4000-a000-00000000000d'

// ── The fakes ────────────────────────────────────────────────────────────────────────────────────

/** Every insert that reached the (faked) database, with its payload. */
const inserts: Array<{ table: string; row: Record<string, unknown> }> = []

function builder(table: string) {
  const api = {
    select: () => api,
    eq: () => api,
    async maybeSingle() {
      if (table === 'spaces') return { data: { name: 'Riverside Studio' }, error: null }
      return { data: null, error: null }
    },
    insert(row: Record<string, unknown>) {
      inserts.push({ table, row })
      return {
        select: () => ({ maybeSingle: async () => ({ data: { id: DISPATCH_ID }, error: null }) }),
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
vi.mock('@/lib/notifications/router', () => ({
  routeNotification: async () => ({ enqueuedCount: 1, outcomes: [], event: 'event.dispatch' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const getCallerProfile = vi.fn()
vi.mock('@/lib/auth', () => ({ getCallerProfile: () => getCallerProfile() }))

const getVisibleSpaceBySlug = vi.fn()
vi.mock('@/lib/spaces/store', () => ({
  getVisibleSpaceBySlug: (slug: string, viewerId: string | null) =>
    getVisibleSpaceBySlug(slug, viewerId),
}))

const resolveSpaceManageAccess = vi.fn()
vi.mock('@/lib/spaces/entitlements', () => ({
  resolveSpaceManageAccess: (...args: unknown[]) => resolveSpaceManageAccess(...args),
}))

import { sendSpaceDispatch } from './dispatch-actions'

const SPACE = { id: SPACE_ID, slug: SLUG, name: 'Riverside Studio', brandName: null }

/** The default world: a signed-in manager of a visible Space. */
function asManager() {
  getCallerProfile.mockResolvedValue({ id: OWNER, webRole: 'none' })
  getVisibleSpaceBySlug.mockResolvedValue(SPACE)
  resolveSpaceManageAccess.mockResolvedValue({ canManage: true, staffViewing: false })
}

const GOOD = { slug: SLUG, spaceId: SPACE_ID, body: 'Doors open at 7.' }

beforeEach(() => {
  inserts.length = 0
  getCallerProfile.mockReset()
  getVisibleSpaceBySlug.mockReset()
  resolveSpaceManageAccess.mockReset()
  asManager()
})

// ── 1. The happy path ────────────────────────────────────────────────────────────────────────────

describe('sendSpaceDispatch (the send)', () => {
  it('publishes one Dispatch scoped to the Space the server resolved', async () => {
    const res = await sendSpaceDispatch(GOOD)
    expect(res).toEqual({ data: { dispatchId: DISPATCH_ID } })

    const rows = inserts.filter((i) => i.table === 'dispatches')
    expect(rows).toHaveLength(1)
    expect(rows[0].row).toMatchObject({
      audience_scope: 'space',
      audience_id: SPACE_ID,
      author_id: OWNER,
      body: 'Doors open at 7.',
      status: 'published',
    })
  })

  it('titles an untitled Dispatch from the Space, never a raw null', async () => {
    await sendSpaceDispatch(GOOD)
    expect(inserts[0].row.title).toBe('From Riverside Studio')
  })

  it('carries a given title through', async () => {
    await sendSpaceDispatch({ ...GOOD, title: 'Tonight' })
    expect(inserts[0].row.title).toBe('Tonight')
  })
})

// ── 2. The gate ──────────────────────────────────────────────────────────────────────────────────

describe('sendSpaceDispatch (authorization)', () => {
  it('refuses a signed-out caller and writes nothing', async () => {
    getCallerProfile.mockResolvedValue(null)
    expect(await sendSpaceDispatch(GOOD)).toEqual({ error: 'Sign in to send a Dispatch.' })
    expect(inserts).toHaveLength(0)
  })

  it('refuses a viewer who cannot manage the Space, and writes nothing', async () => {
    resolveSpaceManageAccess.mockResolvedValue({ canManage: false, staffViewing: false })
    const res = await sendSpaceDispatch(GOOD)
    expect(res).toEqual({ error: 'Only someone who runs this space can send a Dispatch.' })
    expect(inserts).toHaveLength(0)
  })

  it("refuses a staff janitor's read-only preview (staffViewing is not canManage)", async () => {
    getCallerProfile.mockResolvedValue({ id: MEMBER, webRole: 'janitor' })
    resolveSpaceManageAccess.mockResolvedValue({ canManage: false, staffViewing: true })
    const res = await sendSpaceDispatch(GOOD)
    expect(res).toEqual({ error: 'Only someone who runs this space can send a Dispatch.' })
    expect(inserts).toHaveLength(0)
  })

  it('refuses a Space the caller cannot see, and writes nothing', async () => {
    getVisibleSpaceBySlug.mockResolvedValue(null)
    expect(await sendSpaceDispatch(GOOD)).toEqual({ error: 'We could not find that space.' })
    expect(inserts).toHaveLength(0)
  })

  it('does NOT trust the client spaceId: a mismatch is refused, not reconciled', async () => {
    const res = await sendSpaceDispatch({ ...GOOD, spaceId: OTHER_SPACE_ID })
    expect(res).toEqual({ error: 'That Dispatch does not match this space.' })
    expect(inserts).toHaveLength(0)
  })

  it('resolves the Space from the SLUG under the caller, never from the client id', async () => {
    await sendSpaceDispatch(GOOD)
    expect(getVisibleSpaceBySlug).toHaveBeenCalledWith(SLUG, OWNER)
  })
})

// ── 3. 🔴 THE CONTROL: a space-scoped send can never produce a global row ────────────────────────

describe('🔴 no space send can ever produce a global Dispatch', () => {
  /** Every reachable outcome of the action, and whether it is allowed to write. */
  const CASES: { name: string; arrange?: () => void; input: Parameters<typeof sendSpaceDispatch>[0]; writes: boolean }[] = [
    { name: 'a manager sending', input: GOOD, writes: true },
    { name: 'a manager sending with a title', input: { ...GOOD, title: 'Tonight' }, writes: true },
    { name: 'signed out', arrange: () => getCallerProfile.mockResolvedValue(null), input: GOOD, writes: false },
    { name: 'no slug', input: { ...GOOD, slug: '' }, writes: false },
    { name: 'no space id', input: { ...GOOD, spaceId: '' }, writes: false },
    { name: 'whitespace slug', input: { ...GOOD, slug: '   ' }, writes: false },
    { name: 'a mismatched space id', input: { ...GOOD, spaceId: OTHER_SPACE_ID }, writes: false },
    {
      name: 'a Space the caller cannot see',
      arrange: () => getVisibleSpaceBySlug.mockResolvedValue(null),
      input: GOOD,
      writes: false,
    },
    {
      name: 'a non-manager',
      arrange: () => resolveSpaceManageAccess.mockResolvedValue({ canManage: false, staffViewing: false }),
      input: GOOD,
      writes: false,
    },
    {
      name: 'a staff previewer',
      arrange: () => resolveSpaceManageAccess.mockResolvedValue({ canManage: false, staffViewing: true }),
      input: GOOD,
      writes: false,
    },
    { name: 'an empty body', input: { ...GOOD, body: '   ' }, writes: false },
    { name: 'an over-long body', input: { ...GOOD, body: 'x'.repeat(5001) }, writes: false },
    { name: 'an over-long title', input: { ...GOOD, title: 'x'.repeat(201) }, writes: false },
  ]

  it('sweeps every outcome: a row exists only at scope space, and never at global', async () => {
    let allowedWrites = 0
    for (const c of CASES) {
      inserts.length = 0
      asManager()
      c.arrange?.()

      await sendSpaceDispatch(c.input)

      const rows = inserts.filter((i) => i.table === 'dispatches')
      // The refusals write NOTHING. A refusal that started writing would land here first.
      expect(rows.length, `${c.name} wrote ${rows.length} rows`).toBe(c.writes ? 1 : 0)
      for (const r of rows) {
        allowedWrites++
        // The assertion the row was filed for. Stated as an inequality as well as an equality so a
        // renamed-but-still-wrong scope ('platform', 'all', undefined) cannot slip past the match.
        expect(r.row.audience_scope, `${c.name} wrote scope ${String(r.row.audience_scope)}`).toBe('space')
        expect(r.row.audience_scope).not.toBe('global')
        // A 'space' row with no audience_id is a Dispatch addressed to nobody, which the schema's
        // own CHECK forbids; assert the id is the SERVER-resolved Space, not the client's claim.
        expect(r.row.audience_id).toBe(SPACE_ID)
      }
    }
    // The sweep must actually have exercised the write path. Without this the whole `it` would pass
    // green on a build where nothing writes at all, which is the control passing without firing.
    expect(allowedWrites).toBe(CASES.filter((c) => c.writes).length)
    expect(allowedWrites).toBeGreaterThan(0)
  })

  it('the action names no other scope: source carries no global fallback', () => {
    const src = readFileSync(join(process.cwd(), 'app/(main)/spaces/[slug]/dispatch-actions.ts'), 'utf8')
    // The word may appear in the comment that explains WHY it must not appear in code, so this reads
    // the code lines only.
    const code = src
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*') && !l.trimStart().startsWith('/*'))
      .join('\n')
    expect(code).not.toMatch(/audience_scope/)
    expect(code).not.toMatch(/'global'/)
    // And it must still route through the ONE writer that owns the space scope, so the scope can
    // never be re-declared at a second call site.
    expect(src).toContain("from '@/lib/spaces/dispatch'")
    expect(src).toContain('composeSpaceDispatch(')
  })
})

// ── 4. The post box actually mounts it (the row's own consequence) ───────────────────────────────

describe('the post box is the caller', () => {
  const box = readFileSync(join(process.cwd(), 'components/feed/capture-box.tsx'), 'utf8')

  it('capture-box takes a space scope and sends through this action', () => {
    expect(box).toContain('spaceScope')
    expect(box).toContain('sendSpaceDispatch')
  })

  it('the space send path cannot be reached without a resolved space scope', () => {
    // The override is guarded on the narrowed `spaceDispatch`, so there is no branch in the box that
    // calls the space action with an absent scope.
    expect(box).toMatch(/const spaceDispatch = spaceScope != null && mode === 'dispatch'/)
    expect(box).toMatch(/spaceId: spaceDispatch\.spaceId/)
    expect(box).toMatch(/slug: spaceDispatch\.slug/)
  })

  it('a space mount with no manage grant renders nothing', () => {
    expect(box).toContain('if (spaceScope && !canAnnounce) return null')
  })
})
