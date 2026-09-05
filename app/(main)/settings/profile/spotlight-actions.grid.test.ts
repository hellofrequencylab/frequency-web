import { describe, it, expect, beforeEach, vi } from 'vitest'

// saveMemberGridLayout (ADR-516 Phase C) accepts the freeform ROWS from the in-rail builder and SANITIZES
// them before persist (never trust the wire): a bad column count drops its row, an unknown / duplicate
// block id becomes null, and the whole layout lands under meta.entityGrid — the live Spotlight nodes are
// untouched. Owner-only + SESSION-DERIVED (no target id): the write always binds to the authed user's row.

// 2026-09-05 (scan2 L6-09): the layout no longer lands through a profiles UPDATE of the whole meta blob;
// ONLY the `entityGrid` key is merged through merge_profile_meta on the session client. `update` stays in
// the fake to prove it is never reached.
const { getUser, maybeSingle, update, rpc } = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({}) }) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
      update: (patch: unknown) => {
        update(patch)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))

import { saveMemberGridLayout } from './spotlight-actions'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  rpc.mockResolvedValue({ data: {}, error: null })
  maybeSingle.mockResolvedValue({ data: { id: 'prof-1', handle: 'ada', meta: {} } })
})

describe('saveMemberGridLayout - rows sanitize', () => {
  it('persists sanitized rows under meta.entityGrid', async () => {
    const res = await saveMemberGridLayout({
      rows: [
        { id: 'notsafe', columns: 2, slots: ['about', 'about'] }, // member clamps to 1 col -> keeps 'about'; id regenerated
        { id: 'r1', columns: 9, slots: ['stats'] }, // bad columns -> row dropped
        { id: 'r2', columns: 1, slots: ['ghost'] }, // unknown id -> null cell
      ],
      hidden: ['links'],
    })
    expect(res).toEqual({})
    expect(update).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
    const [name, args] = rpc.mock.calls[0] as [string, { p_profile_id: string; p_patch: { entityGrid: { rows: unknown[]; hidden?: string[] } } }]
    expect(name).toBe('merge_profile_meta')
    expect(args.p_profile_id).toBe('prof-1')
    expect(Object.keys(args.p_patch)).toEqual(['entityGrid'])
    const grid = args.p_patch.entityGrid
    // Member is single-column (ADR-526): the 2-col row clamps to 1, keeping 'about'; the columns:9 row is
    // dropped; the unknown-id row keeps its null cell.
    expect(grid.rows).toEqual([
      { id: expect.stringMatching(/^r[0-9a-z]+$/i), columns: 1, cells: [['about']] },
      { id: expect.stringMatching(/^r[0-9a-z]+$/i), columns: 1, cells: [[]] },
    ])
    expect(grid.hidden).toEqual(['links'])
  })

  it('rejects a signed-out caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await saveMemberGridLayout({ rows: [{ id: 'r0', columns: 1, slots: ['about'] }] })
    expect(res).toEqual({ error: 'Unauthorized' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
