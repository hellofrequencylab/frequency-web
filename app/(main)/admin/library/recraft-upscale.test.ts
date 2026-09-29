import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-589 (PROG-D7, ADR-1563): upscale is the fourth non-destructive Recraft op. The consequences
// these lock: a vector is refused before Recraft is ever called or anything is written; a raster is
// sent to the crisp upscale call; the pre-edit state is versioned BEFORE the live row is re-pointed
// (so the small original is never lost); and the row records the upscaled file's new dimensions.

const events: string[] = []
const updates: Array<Record<string, unknown>> = []
let assetRow: { url: string | null; title: string | null; mime: string | null } | null = null

vi.mock('next/server', () => ({ after: () => undefined }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('@/lib/admin/guard', () => ({ requireAdmin: async () => ({ profileId: 'staff-1' }) }))
vi.mock('@/lib/ai/usage', () => ({
  aiAvailable: async () => true,
  featureOverBudget: async () => false,
  recordAiUsage: async () => undefined,
}))
vi.mock('@/lib/library/store', () => ({ getRootSpaceId: async () => 'root' }))
vi.mock('@/lib/library/styles', () => ({
  listStyles: async () => [],
  recordStyle: async () => null,
  resolveStyleId: async () => null,
  deleteStyle: async () => undefined,
}))
vi.mock('@/lib/library/versions', () => ({
  recordVersion: async (_id: string, note: string) => {
    events.push(`version:${note}`)
  },
  rollbackToVersion: async () => ({ ok: true }),
  listVersions: async () => [],
}))

// A bare PNG signature + IHDR: enough for ingest's header parse to read the dimensions.
function pngHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const dv = new DataView(b.buffer)
  dv.setUint32(16, width)
  dv.setUint32(20, height)
  return b
}

const upscaleImage = vi.fn(async () => 'https://recraft.test/up.png')
vi.mock('@/lib/loom/recraft', () => ({
  recraftConfigured: () => true,
  generateImages: async () => [],
  downloadRecraft: async (url: string) => {
    events.push(`download:${url}`)
    return url.includes('recraft.test')
      ? { bytes: pngHeader(2048, 1536), contentType: 'image/png' }
      : { bytes: pngHeader(512, 384), contentType: 'image/png' }
  },
  vectorizeImage: async () => 'https://recraft.test/v.svg',
  imageToImage: async () => 'https://recraft.test/var.png',
  removeBackground: async () => 'https://recraft.test/bg.png',
  upscaleImage: (...args: unknown[]) => {
    events.push('recraft:upscale')
    return (upscaleImage as unknown as (...a: unknown[]) => Promise<string>)(...args)
  },
  createStyle: async () => 'style',
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const select = () => {
        const api = {
          eq: () => api,
          maybeSingle: async () => ({ data: table === 'library_assets' ? assetRow : null }),
        }
        return api
      }
      const update = (patch: Record<string, unknown>) => {
        events.push(`update:${table}`)
        updates.push(patch)
        return { eq: async () => ({ error: null }) }
      }
      return { select, update }
    },
    storage: {
      from: () => ({
        upload: async () => {
          events.push('storage:upload')
          return { error: null }
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://store.test/${path}` } }),
      }),
    },
  }),
}))

const { recraftEditAsset } = await import('./recraft-actions')

beforeEach(() => {
  events.length = 0
  updates.length = 0
  upscaleImage.mockClear()
})

describe('recraftEditAsset upscale (LIVE-589)', () => {
  it('refuses an SVG by mime before Recraft is called or anything is written', async () => {
    assetRow = { url: 'https://store.test/root/mark.svg', title: 'Mark', mime: 'image/svg+xml' }
    const res = await recraftEditAsset({ assetId: 'a1', op: 'upscale' })
    expect('error' in res && res.error).toMatch(/vector/)
    expect(upscaleImage).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })

  it('refuses an SVG by extension when the mime was never recorded', async () => {
    assetRow = { url: 'https://store.test/root/mark.svg?v=2', title: 'Mark', mime: null }
    const res = await recraftEditAsset({ assetId: 'a1', op: 'upscale' })
    expect('error' in res).toBe(true)
    expect(events).toEqual([])
  })

  it('upscales a raster with crisp, versions the original first, then re-points the row', async () => {
    assetRow = { url: 'https://store.test/root/photo.png', title: 'Photo', mime: 'image/png' }
    const res = await recraftEditAsset({ assetId: 'a1', op: 'upscale' })
    expect(res).toEqual({ ok: true })

    expect(upscaleImage).toHaveBeenCalledTimes(1)
    const call = upscaleImage.mock.calls[0] as unknown as [Uint8Array, string, string]
    expect(call[1]).toBe('image.png')
    expect(call[2]).toBe('crisp')

    const version = events.indexOf('version:Recraft upscale (crisp)')
    const update = events.indexOf('update:library_assets')
    expect(version).toBeGreaterThan(-1)
    expect(update).toBeGreaterThan(version)

    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ width: 2048, height: 1536, mime: 'image/png' })
    expect(typeof updates[0].sha256).toBe('string')
    expect(String(updates[0].url)).toMatch(/^https:\/\/store\.test\/root\/photo-/)
  })
})
