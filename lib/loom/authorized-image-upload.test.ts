import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ storageUpload: vi.fn(), storageRemove: vi.fn(), insert: vi.fn(), dedupe: vi.fn(), quota: vi.fn(), ingest: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ upload: mocks.storageUpload, remove: mocks.storageRemove, getPublicUrl: () => ({ data: { publicUrl: 'https://images.example/photo.jpg' } }) }) } }) }))
vi.mock('@/lib/library/store', () => ({ insertSpaceLibraryImage: mocks.insert, findLibraryAssetBySha256: mocks.dedupe }))
vi.mock('@/lib/library/quota', () => ({ loomAdmits: mocks.quota }))
vi.mock('@/lib/library/ingest', () => ({ ingestImageBytes: mocks.ingest }))
vi.mock('@/lib/library/image-describe', () => ({ readImageDescriptor: () => ({}) }))
import { uploadAuthorizedLoomImage } from './authorized-image-upload'
const data = () => { const fd = new FormData(); fd.append('file', new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' })); return fd }
describe('shared authorized Loom image ingestion', () => {
  beforeEach(() => { mocks.storageUpload.mockReset().mockResolvedValue({ error: null }); mocks.storageRemove.mockReset().mockResolvedValue({ error: null }); mocks.insert.mockReset().mockResolvedValue('photo'); mocks.dedupe.mockReset().mockResolvedValue(null); mocks.quota.mockReset().mockResolvedValue({ ok: true }); mocks.ingest.mockReset().mockReturnValue({ bytes: new Uint8Array([9]), sha256: 'stripped-hash', width: 10, height: 20 }) })
  it('uploads stripped bytes and preserves tenant/provenance/metadata through the canonical pipeline', async () => {
    expect(await uploadAuthorizedLoomImage('site', 'owner', data())).toEqual({ id: 'photo', url: 'https://images.example/photo.jpg' })
    expect(mocks.storageUpload).toHaveBeenCalledWith(expect.stringMatching(/^site\//), new Uint8Array([9]), { contentType: 'image/jpeg', upsert: false })
    expect(mocks.quota).toHaveBeenCalledExactlyOnceWith('site', 1)
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 'site', createdBy: 'owner', sha256: 'stripped-hash', source: 'upload', width: 10, height: 20 }))
  })
  it('refuses quota failures and cleans up storage after a failed library row insert', async () => {
    mocks.quota.mockResolvedValueOnce({ ok: false, error: 'Quota exceeded' })
    expect(await uploadAuthorizedLoomImage('site', 'owner', data())).toEqual({ error: 'Quota exceeded' })
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    mocks.insert.mockResolvedValue(null)
    expect(await uploadAuthorizedLoomImage('site', 'owner', data())).toHaveProperty('error')
    expect(mocks.storageRemove).toHaveBeenCalledWith([expect.stringMatching(/^site\//)])
  })
  it('asks dedupe to exclude protected and expired rows for website uploads', async () => {
    await uploadAuthorizedLoomImage('site', 'owner', data(), true)
    expect(mocks.dedupe).toHaveBeenCalledWith('site', 'stripped-hash', true)
  })
  it('reuses tenant-local duplicates without consuming quota or storing a second object', async () => {
    mocks.dedupe.mockResolvedValue({ id: 'existing', url: 'https://images.example/existing.jpg' })
    expect(await uploadAuthorizedLoomImage('site', 'owner', data())).toEqual({ id: 'existing', url: 'https://images.example/existing.jpg' })
    expect(mocks.quota).not.toHaveBeenCalled(); expect(mocks.storageUpload).not.toHaveBeenCalled()
  })
})
