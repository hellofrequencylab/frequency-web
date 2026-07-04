import { describe, it, expect, beforeEach, vi } from 'vitest'

// saveMemberGridLayout (ADR-516 Phase C) accepts the freeform ROWS from the in-rail builder and SANITIZES
// them before persist (never trust the wire): a bad column count drops its row, an unknown / duplicate
// block id becomes null, and the whole layout lands under meta.entityGrid — the live Spotlight nodes are
// untouched. Owner-only + SESSION-DERIVED (no target id): the write always binds to the authed user's row.

const { getUser, maybeSingle, update } = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({}) }) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
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
  maybeSingle.mockResolvedValue({ data: { handle: 'ada', meta: {} } })
})

describe('saveMemberGridLayout - rows sanitize', () => {
  it('persists sanitized rows under meta.entityGrid', async () => {
    const res = await saveMemberGridLayout({
      rows: [
        { id: 'notsafe', columns: 2, slots: ['about', 'about'] }, // dup about -> second null; id regenerated
        { id: 'r1', columns: 9, slots: ['stats'] }, // bad columns -> row dropped
        { id: 'r2', columns: 1, slots: ['ghost'] }, // unknown id -> null cell
      ],
      hidden: ['links'],
    })
    expect(res).toEqual({})
    expect(update).toHaveBeenCalledTimes(1)
    const patch = update.mock.calls[0][0] as { meta: { entityGrid: { rows: unknown[]; hidden?: string[] } } }
    const grid = patch.meta.entityGrid
    // The columns:9 row is gone; the dup is nulled; the unknown-id row keeps a null cell.
    expect(grid.rows).toEqual([
      { id: expect.stringMatching(/^r[0-9a-z]+$/i), columns: 2, slots: ['about', null] },
      { id: expect.stringMatching(/^r[0-9a-z]+$/i), columns: 1, slots: [null] },
    ])
    expect(grid.hidden).toEqual(['links'])
  })

  it('rejects a signed-out caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await saveMemberGridLayout({ rows: [{ id: 'r0', columns: 1, slots: ['about'] }] })
    expect(res).toEqual({ error: 'Unauthorized' })
    expect(update).not.toHaveBeenCalled()
  })
})
