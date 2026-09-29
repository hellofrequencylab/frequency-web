import { describe, it, expect, vi, beforeEach } from 'vitest'

// The Space Loom Studio's edit and safe delete (LIVE-568, ADR-1586). What matters, in order: the
// delete reads where the image is placed BEFORE it removes anything, and refuses on a placed image
// and on a failed read; the edit and the count use the Studio's own door (canManageSpaceLoom), and
// only ever touch or describe this Space's own rows.

const state = {
  caller: { id: 'u1' } as { id: string } | null,
  canManage: true,
  holds: true,
  usage: { ok: true, pages: 0, refs: 0, places: [] } as unknown,
  updateOut: 'ok' as 'ok' | 'missing' | 'failed',
  deleted: [] as string[],
  updated: [] as unknown[],
  usageReads: 0,
}

vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => state.caller }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ storage: { from: () => ({ remove: async () => ({}) }) } }),
}))
vi.mock('@/lib/spaces/store', () => ({
  getSpaceById: async (k: string) => (k === 'space-1' ? { id: 'space-1', slug: 'camp' } : null),
  getSpaceBySlug: async (k: string) => (k === 'camp' ? { id: 'space-1', slug: 'camp' } : null),
  loadRootSpaceId: async () => 'root',
}))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: async () => ({ role: 'editor', canEditProfile: true }) }))
vi.mock('@/lib/library/space-loom-access', () => ({ canManageSpaceLoom: () => state.canManage }))
vi.mock('@/lib/spaces/operated', () => ({ listOperatedSpaces: async () => [] }))
vi.mock('@/lib/library/store', () => ({
  getLibraryAsset: async (spaceId: string, id: string) => (state.holds ? { id, spaceId } : null),
  deleteSpaceLibraryAsset: async (_spaceId: string, id: string) => {
    state.deleted.push(id)
    return { bucket: 'library-media', path: 'p' }
  },
  listLoomScopeImages: async () => [],
  listLoomScopeTags: async () => [],
  insertSpaceLibraryImage: async () => null,
  findLibraryAssetBySha256: async () => null,
  updateSpaceLibraryAssetMeta: async (...args: unknown[]) => {
    state.updated.push(args)
    return state.updateOut
  },
}))
vi.mock('@/lib/library/usage', () => ({
  findLibraryAssetUsage: async () => {
    state.usageReads++
    return state.usage
  },
}))
vi.mock('@/lib/elements/store', () => ({ resolveElement: async () => null }))

import { deleteSpaceLoomImage, updateSpaceLoomImageMeta, spaceLoomImageUsage } from './picker-actions'

beforeEach(() => {
  state.caller = { id: 'u1' }
  state.canManage = true
  state.holds = true
  state.usage = { ok: true, pages: 0, refs: 0, places: [] }
  state.updateOut = 'ok'
  state.deleted = []
  state.updated = []
  state.usageReads = 0
})

describe('deleteSpaceLoomImage: the safe delete', () => {
  it('removes an image no page places', async () => {
    expect(await deleteSpaceLoomImage('camp', 'a1')).toEqual({ ok: true })
    expect(state.deleted).toEqual(['a1'])
  })
  it('refuses an image still placed on a page, with the count, and removes nothing', async () => {
    state.usage = { ok: true, pages: 2, refs: 3, places: [] }
    const out = await deleteSpaceLoomImage('camp', 'a1')
    expect(out).toEqual({ error: expect.stringContaining('2 pages') })
    expect(state.deleted).toEqual([])
  })
  it('refuses when it could not check, and removes nothing', async () => {
    state.usage = { ok: false, error: 'boom' }
    const out = await deleteSpaceLoomImage('camp', 'a1')
    expect('error' in out && out.error).toMatch(/Could not check/)
    expect(state.deleted).toEqual([])
  })
  it('an image that is not this Space is refused before any usage read', async () => {
    state.holds = false
    expect(await deleteSpaceLoomImage('camp', 'a1')).toEqual({ error: 'That image is not in this library.' })
    expect(state.usageReads).toBe(0)
    expect(state.deleted).toEqual([])
  })
  it('keeps the Studio door: below the bar, nothing is read or removed', async () => {
    state.canManage = false
    expect(await deleteSpaceLoomImage('camp', 'a1')).toEqual({ error: 'You cannot manage that library.' })
    expect(state.usageReads).toBe(0)
    expect(await deleteSpaceLoomImage('mine', 'a1')).toEqual({ error: 'You cannot manage that library.' })
  })
})

describe('updateSpaceLoomImageMeta: rename, caption, retag', () => {
  it('writes the validated words to this Space and returns them', async () => {
    const out = await updateSpaceLoomImageMeta('camp', 'a1', { title: ' Lake ', alt: 'A lake at dawn', tags: 'Lake, dawn' })
    expect(out).toEqual({ ok: true, title: 'Lake', alt: 'A lake at dawn', tags: ['lake', 'dawn'] })
    expect(state.updated).toEqual([['space-1', 'a1', { title: 'Lake', alt: 'A lake at dawn', tags: ['lake', 'dawn'] }]])
  })
  it('an empty title is refused before any write', async () => {
    expect(await updateSpaceLoomImageMeta('camp', 'a1', { title: '  ' })).toEqual({ error: 'Title cannot be empty.' })
    expect(state.updated).toEqual([])
  })
  it('an id from another Space updates nothing and says so', async () => {
    state.updateOut = 'missing'
    expect(await updateSpaceLoomImageMeta('camp', 'b9', { title: 'x' })).toEqual({ error: 'That image is not in this library.' })
  })
  it('the same door as the delete: below the bar, or signed out, nothing is written', async () => {
    state.canManage = false
    expect(await updateSpaceLoomImageMeta('camp', 'a1', { title: 'x' })).toEqual({ error: 'You cannot manage that library.' })
    state.canManage = true
    state.caller = null
    expect(await updateSpaceLoomImageMeta('camp', 'a1', { title: 'x' })).toEqual({ error: 'Sign in to manage this library.' })
    expect(state.updated).toEqual([])
  })
})

describe('spaceLoomImageUsage: the count beside Remove', () => {
  it('returns the page count for this Space own image', async () => {
    state.usage = { ok: true, pages: 3, refs: 4, places: [{ key: 'k', label: 'Space: other', href: null, live: true, hits: 1 }] }
    expect(await spaceLoomImageUsage('camp', 'a1')).toEqual({ ok: true, pages: 3 })
  })
  it('a failed read is not zero', async () => {
    state.usage = { ok: false, error: 'boom' }
    expect(await spaceLoomImageUsage('camp', 'a1')).toEqual({ ok: false })
  })
  it('never describes another Space image, or answers below the bar', async () => {
    state.holds = false
    expect(await spaceLoomImageUsage('camp', 'a1')).toEqual({ ok: false })
    state.holds = true
    state.canManage = false
    expect(await spaceLoomImageUsage('camp', 'a1')).toEqual({ ok: false })
    expect(state.usageReads).toBe(0)
  })
})
