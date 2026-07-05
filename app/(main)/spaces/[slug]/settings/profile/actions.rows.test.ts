import { describe, it, expect, beforeEach, vi } from 'vitest'

// saveSpaceProfileLayout + saveSpaceGridLayout (ADR-516 Phase D) accept the freeform ROWS from the in-rail
// Space builder and SANITIZE them to unified SPACE block ids before persist (never trust the wire): a
// member-only id is dropped, a duplicate becomes null, a bad column count drops its row, and the node lands
// at spaces.preferences.profileLayout preserving every other preferences key. OWNER-gated: a non-manager is
// refused. saveSpaceGridLayout is the slug-keyed entry the shared store's debounced flush calls.

const { getCallerProfile, getSpaceById, getVisibleSpaceBySlug, resolveSpaceManageAccess, update } =
  vi.hoisted(() => ({
    getCallerProfile: vi.fn(),
    getSpaceById: vi.fn(),
    getVisibleSpaceBySlug: vi.fn(),
    resolveSpaceManageAccess: vi.fn(),
    update: vi.fn(),
  }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById, getVisibleSpaceBySlug }))
vi.mock('@/lib/spaces/entitlements', () => ({ resolveSpaceManageAccess }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (v: Record<string, unknown>) => {
        update(v)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))

import { saveSpaceProfileLayout, saveSpaceGridLayout } from './actions'

// The action is typed to EntityLayout; the tests deliberately feed WIRE-shaped (untrusted) values a
// client could POST — an out-of-range column count, a member-only id — to prove the server sanitizes them.
type LayoutArg = Parameters<typeof saveSpaceProfileLayout>[1]

const space = { id: 'space-1', slug: 'calm', preferences: { accent: 'sky' } }

beforeEach(() => {
  vi.clearAllMocks()
  getCallerProfile.mockResolvedValue({ id: 'caller-1', webRole: null })
  getSpaceById.mockResolvedValue(space)
  getVisibleSpaceBySlug.mockResolvedValue(space)
  resolveSpaceManageAccess.mockResolvedValue({ canManage: true, staffViewing: false })
})

describe('saveSpaceProfileLayout - rows sanitize', () => {
  it('persists sanitized space rows at preferences.profileLayout, preserving other keys', async () => {
    const res = await saveSpaceProfileLayout('space-1', {
      rows: [
        { id: 'x', columns: 2, slots: ['offerings', 'offerings'] }, // dup -> 2nd null; id regenerated
        { id: 'r1', columns: 9, slots: ['events'] }, // bad columns -> row dropped
        { id: 'r2', columns: 1, slots: ['topfriends'] }, // member-only id -> null cell
      ],
      hidden: ['events'],
    } as unknown as LayoutArg)
    expect('error' in res && res.error).toBeFalsy()
    expect(update).toHaveBeenCalledTimes(1)
    const patch = update.mock.calls[0][0] as {
      preferences: { accent: string; profileLayout: { rows: unknown[]; hidden?: string[] } }
    }
    // Other preferences keys are preserved.
    expect(patch.preferences.accent).toBe('sky')
    const grid = patch.preferences.profileLayout
    expect(grid.rows).toEqual([
      { id: expect.stringMatching(/^r[0-9a-z]+$/i), columns: 2, cells: [['offerings'], []] },
      { id: expect.stringMatching(/^r[0-9a-z]+$/i), columns: 1, cells: [[]] },
    ])
    expect(grid.hidden).toEqual(['events'])
  })

  it('refuses a non-manager (fail-closed, no write)', async () => {
    resolveSpaceManageAccess.mockResolvedValue({ canManage: false, staffViewing: true })
    const res = await saveSpaceProfileLayout('space-1', {
      rows: [{ id: 'r0', columns: 1, cells: [['about']] }],
    })
    expect('error' in res && res.error).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })
})

describe('saveSpaceGridLayout - slug-keyed store flush', () => {
  it('resolves the space by slug and persists the sanitized rows', async () => {
    const res = await saveSpaceGridLayout('calm', {
      rows: [{ id: 'r0', columns: 1, cells: [['about']] }],
      hidden: [],
    })
    expect(res).toEqual({})
    expect(getVisibleSpaceBySlug).toHaveBeenCalledWith('calm', 'caller-1')
    expect(update).toHaveBeenCalledTimes(1)
    const patch = update.mock.calls[0][0] as { preferences: { profileLayout: { rows: unknown[] } } }
    expect(patch.preferences.profileLayout.rows).toEqual([{ id: 'r0', columns: 1, cells: [['about']] }])
  })

  it('returns an error when the slug does not resolve', async () => {
    getVisibleSpaceBySlug.mockResolvedValue(null)
    const res = await saveSpaceGridLayout('nope', { rows: [], hidden: [] })
    expect(res.error).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })
})
