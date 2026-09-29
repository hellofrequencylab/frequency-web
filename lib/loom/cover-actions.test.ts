import { describe, it, expect, vi, beforeEach } from 'vitest'

// The AI cover files into a Space's Loom, so it asks the same storage budget as every other Space
// write (LIVE-629, ADR-1602, through lib/library/quota.ts `loomAdmits`, which runs for real here).
// What this locks, in order: a Loom past its cap refuses BEFORE Vera draws (nothing spent, nothing
// stored); a failed sum refuses the same way; a cover whose own size tips the Loom over is refused
// before storage; under the cap it stores; the root Space ('mine') is uncapped and never sums.
// Every refusal is a returned `{ error }`, never a throw. No vendor is called: Recraft is mocked.

const SPACE = 'bbbbbbbb-0000-4000-b000-00000000000b'
const ROOT = 'rrrrrrrr-0000-4000-a000-00000000000r'
const GB = 1024 * 1024 * 1024
const COVER_BYTES = new Uint8Array([1, 2, 3, 4])

let owner: { id: string; type: string; plan: string } | null = null
let bytePages: ({ bytes: number | null }[] | null)[] = []
const bytesPageMock = vi.fn(async () => (bytePages.length ? (bytePages.shift() as { bytes: number | null }[] | null) : []))

const generateMock = vi.fn(async () => [{ url: 'https://recraft.example/cover.png', isSvg: false }])
const downloadMock = vi.fn(async () => ({ bytes: COVER_BYTES, contentType: 'image/png' }))
const uploadMock = vi.fn<(...args: unknown[]) => Promise<{ error: null }>>(async () => ({ error: null }))
const removeMock = vi.fn(async () => ({ error: null }))
const insertMock = vi.fn<(...args: unknown[]) => Promise<string | null>>(async () => 'cover-asset-id')

vi.mock('next/server', () => ({ after: () => undefined }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'caller-1' }) }))
vi.mock('@/lib/ai/usage', () => ({
  aiAvailable: async () => true,
  featureOverBudget: async () => false,
  recordAiUsage: async () => undefined,
}))
vi.mock('./recraft', () => ({
  recraftConfigured: () => true,
  generateImages: () => generateMock(),
  downloadRecraft: () => downloadMock(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: uploadMock,
        remove: removeMock,
        getPublicUrl: () => ({ data: { publicUrl: 'https://cdn/library-media/cover.png' } }),
      }),
    },
  }),
}))
vi.mock('@/lib/spaces/store', () => ({
  // The write scope resolves a Space by id; the budget reads the same Space by id.
  getSpaceById: async (id: string) => (owner && owner.id === id ? owner : null),
  getSpaceBySlug: async () => null,
  loadRootSpaceId: async () => ROOT,
}))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: async () => ({ canEditProfile: true }) }))
vi.mock('@/lib/library/store', () => ({
  insertSpaceLibraryImage: (...args: unknown[]) => insertMock(...(args as [])),
  listLibraryAssetBytesPage: () => bytesPageMock(),
}))

import { generateEntityCoverAction } from './cover-actions'

const draw = (scopeKey: string) => generateEntityCoverAction({ entity: 'journey', title: 'Morning stillness', scopeKey })

beforeEach(() => {
  owner = { id: SPACE, type: 'business', plan: 'free' }
  bytePages = []
  bytesPageMock.mockClear()
  generateMock.mockClear()
  downloadMock.mockClear()
  uploadMock.mockClear()
  insertMock.mockClear()
})

describe('the AI cover asks the Space Loom budget (LIVE-629, ADR-1602)', () => {
  it('a Loom already past its cap refuses before Vera draws: nothing spent, nothing stored', async () => {
    bytePages = [[{ bytes: GB + 1 }]]
    const res = await draw(SPACE)
    expect('error' in res && res.error).toMatch(/This library is full/)
    expect(generateMock).not.toHaveBeenCalled()
    expect(uploadMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('a failed sum refuses before Vera draws (a quota that fails open is not a quota)', async () => {
    bytePages = [null]
    const res = await draw(SPACE)
    expect('error' in res && res.error).toMatch(/Could not check/)
    expect(generateMock).not.toHaveBeenCalled()
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('a cover whose own size tips the Loom over is refused before storage', async () => {
    // Exactly at the cap before the draw (allowed with nothing incoming), then the 4-byte cover.
    bytePages = [[{ bytes: GB }], [{ bytes: GB }]]
    const res = await draw(SPACE)
    expect('error' in res && res.error).toMatch(/This library is full/)
    expect(generateMock).toHaveBeenCalledTimes(1)
    expect(uploadMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('under the cap the cover is stored in the Space and handed back', async () => {
    bytePages = [[{ bytes: 100 }], [{ bytes: 100 }]]
    const res = await draw(SPACE)
    expect('data' in res && res.data.url).toBe('https://cdn/library-media/cover.png')
    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(uploadMock.mock.calls[0][0]).toMatch(new RegExp(`^${SPACE}/`))
    expect((insertMock.mock.calls[0][0] as { spaceId: string }).spaceId).toBe(SPACE)
  })

  it("the root Space ('mine') is uncapped and never reads the sum", async () => {
    owner = { id: ROOT, type: 'root', plan: 'free' }
    bytePages = [null, null] // would refuse if either were read
    const res = await draw('mine')
    expect('data' in res).toBe(true)
    expect(bytesPageMock).not.toHaveBeenCalled()
    expect(uploadMock).toHaveBeenCalledTimes(1)
  })
})
