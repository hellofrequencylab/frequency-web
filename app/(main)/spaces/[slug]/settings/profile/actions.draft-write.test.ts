import { beforeEach, describe, expect, it, vi } from 'vitest'

// PROG-E5 item 1. The Space page builder's draft autosave goes through save_space_profile_draft (the same write and
// the same revision counter as the canvas). The RPC is mocked; the whole-blob update runs only while the function
// is unavailable.

const { getCallerProfile, getSpaceById, getVisibleSpaceBySlug, resolveSpaceManageAccess, update, saveDraft } =
  vi.hoisted(() => ({
    getCallerProfile: vi.fn(),
    getSpaceById: vi.fn(),
    getVisibleSpaceBySlug: vi.fn(),
    resolveSpaceManageAccess: vi.fn(),
    update: vi.fn(),
    saveDraft: vi.fn(),
  }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById, getVisibleSpaceBySlug }))
vi.mock('@/lib/spaces/entitlements', () => ({ resolveSpaceManageAccess }))
vi.mock('@/lib/spaces/profile-draft-write', () => ({ saveSpaceProfileDraft: saveDraft }))
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

import { saveSpaceGridLayout } from './actions'

type LayoutArg = Parameters<typeof saveSpaceGridLayout>[1]
const space = { id: 'space-1', slug: 'calm', preferences: { accent: 'sky' } }
const layout = { rows: [{ id: 'r1', columns: 1, cells: [['text']] }] } as unknown as LayoutArg

beforeEach(() => {
  vi.clearAllMocks()
  getCallerProfile.mockResolvedValue({ id: 'caller-1', webRole: null })
  getSpaceById.mockResolvedValue(space)
  getVisibleSpaceBySlug.mockResolvedValue(space)
  resolveSpaceManageAccess.mockResolvedValue({ canManage: true, staffViewing: false })
  saveDraft.mockResolvedValue({ status: 'written', revision: 2 })
})

describe('the Space page builder draft save (PROG-E5 item 1)', () => {
  it('writes only the draft key through the function, as the caller, moving the shared counter', async () => {
    expect(await saveSpaceGridLayout('calm', layout)).toEqual({})
    expect(saveDraft).toHaveBeenCalledTimes(1)
    const arg = saveDraft.mock.calls[0]![0]
    expect(arg).toMatchObject({ spaceId: 'space-1', actor: 'caller-1', expected: null })
    expect(arg.draft).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })

  it('keeps the whole-blob write as the fallback while the function is unavailable', async () => {
    saveDraft.mockResolvedValue({ status: 'unavailable' })
    expect(await saveSpaceGridLayout('calm', layout)).toEqual({})
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0]![0].preferences.accent).toBe('sky')
  })

  it('refuses with no write when the function says the caller may not manage the Space', async () => {
    saveDraft.mockResolvedValue({ status: 'forbidden' })
    expect(await saveSpaceGridLayout('calm', layout)).toEqual({ error: 'You do not have permission to edit this space.' })
    expect(update).not.toHaveBeenCalled()
  })

  it('never reaches the function for a caller the action already refused', async () => {
    resolveSpaceManageAccess.mockResolvedValue({ canManage: false, staffViewing: true })
    expect(await saveSpaceGridLayout('calm', layout)).toEqual({ error: 'You do not have permission to edit this space.' })
    expect(saveDraft).not.toHaveBeenCalled()
  })
})
