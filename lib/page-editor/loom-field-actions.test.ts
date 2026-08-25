import { describe, it, expect, vi, beforeEach } from 'vitest'

// The Loom-backed image field's upload action is gated on PER-SPACE edit permission (owner / admin /
// editor of THIS space), NOT platform staff, and scopes every write to the space's own library. This
// test locks:
//   - an UNAUTHORIZED caller (no canEditProfile) gets an error from upload (fail-closed), and never
//     touches storage / the catalog.
//   - an unknown / blank slug is rejected before any space work.
//   - an AUTHORIZED editor's upload files into the SPACE (via insertSpaceLibraryImage).

const SPACE_A = 'aaaaaaaa-0000-4000-a000-00000000000a'

let caps = { canEditProfile: false }
let space: { id: string } | null = { id: SPACE_A }

const uploadMock = vi.fn<(...args: unknown[]) => Promise<{ error: null }>>(async () => ({ error: null }))
const getPublicUrlMock = vi.fn(() => ({ data: { publicUrl: 'https://cdn/library-media/x.png' } }))
const removeMock = vi.fn<(...args: unknown[]) => Promise<{ error: null }>>(async () => ({ error: null }))
const insertMock = vi.fn<(...args: unknown[]) => Promise<string | null>>(async () => 'new-asset-id')
const dedupeMock = vi.fn<(...args: unknown[]) => Promise<{ id: string; url: string | null; title: string } | null>>(
  async () => null,
)

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock, remove: removeMock }) },
  }),
}))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'caller-1' }) }))
vi.mock('@/lib/spaces/store', () => ({ getVisibleSpaceBySlug: async () => space }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: async () => caps }))
vi.mock('@/lib/library/store', () => ({
  insertSpaceLibraryImage: (...args: unknown[]) => insertMock(...(args as [])),
  // Checksum dedupe (PROG-D1): null = "these bytes are new here", the path every test below wants.
  findLibraryAssetBySha256: (...args: unknown[]) => dedupeMock(...(args as [])),
}))

import { uploadToLoom } from './loom-field-actions'

function imageFormData(): FormData {
  const fd = new FormData()
  fd.set('file', new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' }))
  return fd
}

beforeEach(() => {
  caps = { canEditProfile: false }
  space = { id: SPACE_A }
  uploadMock.mockClear()
  insertMock.mockClear()
  removeMock.mockClear()
  dedupeMock.mockReset()
  dedupeMock.mockResolvedValue(null)
})

describe('gate: only a per-space editor may upload', () => {
  it('a caller without canEditProfile cannot upload (fail-closed, no storage write)', async () => {
    caps = { canEditProfile: false }
    const res = await uploadToLoom('willow-studio', imageFormData())
    expect('error' in res).toBe(true)
    expect(uploadMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('a blank slug is rejected before any space work', async () => {
    caps = { canEditProfile: true }
    const res = await uploadToLoom('', imageFormData())
    expect('error' in res).toBe(true)
  })

  it('an unknown slug (space not found) is rejected', async () => {
    caps = { canEditProfile: true }
    space = null
    expect('error' in (await uploadToLoom('ghost', imageFormData()))).toBe(true)
  })
})

describe('an authorized editor: upload files into the space', () => {
  it('upload files into the SPACE library and returns the served URL', async () => {
    caps = { canEditProfile: true }
    const res = await uploadToLoom('willow-studio', imageFormData())
    expect('url' in res && res.url).toBe('https://cdn/library-media/x.png')
    // Filed into the space, not root: insertSpaceLibraryImage got this space id.
    const arg = insertMock.mock.calls[0][0] as { spaceId: string }
    expect(arg.spaceId).toBe(SPACE_A)
    // Object namespaced under the space prefix.
    expect(uploadMock.mock.calls[0][0]).toMatch(new RegExp(`^${SPACE_A}/`))
  })

  it('CHECKSUM DEDUPE short-circuits: identical bytes store nothing and write no row', async () => {
    // The whole value of dedupe is that it happens BEFORE the storage write. A version that
    // deduplicated only the catalog row would still leave a second copy of the object on disk, and
    // the Loom's storage bill is the thing this is for.
    caps = { canEditProfile: true }
    dedupeMock.mockResolvedValueOnce({ id: 'existing-asset', url: 'https://cdn/already-there.png', title: 'Logo' })
    const res = await uploadToLoom('willow-studio', imageFormData())
    expect(res).toEqual({ url: 'https://cdn/already-there.png', id: 'existing-asset' })
    expect(uploadMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('passes the ingest metadata to the catalog: a checksum, and the dimensions it could read', async () => {
    caps = { canEditProfile: true }
    await uploadToLoom('willow-studio', imageFormData())
    const arg = insertMock.mock.calls[0][0] as { sha256?: string; width: number | null; bytes: number | null }
    // A 3-byte fixture is not a parseable image, so the dimensions are honestly NULL — but the
    // checksum is always real, which is what dedupe runs on.
    expect(arg.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(arg.width).toBeNull()
    expect(arg.bytes).toBe(3)
  })

  it('rolls back the stored file when the catalog insert fails', async () => {
    caps = { canEditProfile: true }
    insertMock.mockResolvedValueOnce(null)
    const res = await uploadToLoom('willow-studio', imageFormData())
    expect('error' in res).toBe(true)
    expect(removeMock).toHaveBeenCalled()
  })
})
