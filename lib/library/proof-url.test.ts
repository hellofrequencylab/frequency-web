import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LIBRARY_PRIVATE_BUCKET } from './protect-move'
import { RENDITION_PRESETS } from './renditions'
import type { LoomPickAsset } from './store'

// LIVE-580 (ADR-1623; owner ruling "Width-capped proof, no watermark"): a protected asset is shown as a
// proof, never its original. These lock the consequences: a private row is signed WITH a width-capped
// transform and a short life, a flagged row whose file is still public gets the public grid rendition,
// a vector or a fileless row shows nothing, and a pick list never carries a master or a storage key.

type Signed = { bucket: string; path: string; ttl: number; opts?: { transform?: { width?: number; resize?: string } } }
const signed: Signed[] = []
let failMint = false
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, ttl: number, opts?: Signed['opts']) => {
          if (failMint) return { data: null, error: { message: 'Object not found' } }
          signed.push({ bucket, path, ttl, opts })
          const seg = opts?.transform ? 'render/image/sign' : 'object/sign'
          return { data: { signedUrl: `https://x.supabase.co/storage/v1/${seg}/${bucket}/${path}?token=t` }, error: null }
        },
      }),
    },
  }),
}))

const { proofLibraryAssetUrl, withLoomProofs, LIBRARY_PROOF_WIDTH, LIBRARY_PROOF_TTL_SECONDS, LIBRARY_SIGNED_URL_TTL_SECONDS } =
  await import('./asset-urls')

const pub = (p: string) => `https://x.supabase.co/storage/v1/object/public/library-media/${p}`
const gridOf = (p: string) =>
  `https://x.supabase.co/storage/v1/render/image/public/library-media/${p}?width=480&resize=contain`

beforeEach(() => {
  signed.length = 0
  failMint = false
})

describe('proofLibraryAssetUrl', () => {
  it('signs a private protected row with a width-capped transform, never the bare object', async () => {
    const url = await proofLibraryAssetUrl({ isProtected: true, url: null, storagePath: 'root/b.jpg', kind: 'image' })
    expect(url).toContain('/render/image/sign/library-private/root/b.jpg')
    expect(url).not.toContain('/object/sign/')
    expect(signed).toHaveLength(1)
    expect(signed[0].bucket).toBe(LIBRARY_PRIVATE_BUCKET)
    expect(signed[0].opts?.transform).toEqual({ width: LIBRARY_PROOF_WIDTH, resize: 'contain' })
  })

  it('caps at the grid preset width', () => {
    expect(LIBRARY_PROOF_WIDTH).toBe(RENDITION_PRESETS.grid.maxWidth)
  })

  it('lives minutes, shorter than a Studio signature, and never longer however it is asked', async () => {
    expect(LIBRARY_PROOF_TTL_SECONDS).toBeLessThan(LIBRARY_SIGNED_URL_TTL_SECONDS)
    await proofLibraryAssetUrl({ isProtected: true, url: null, storagePath: 'root/b.jpg' })
    await proofLibraryAssetUrl({ isProtected: true, url: null, storagePath: 'root/b.jpg' }, 24 * 60 * 60)
    await proofLibraryAssetUrl({ isProtected: true, url: null, storagePath: 'root/b.jpg' }, 60)
    expect(signed.map((s) => s.ttl)).toEqual([LIBRARY_PROOF_TTL_SECONDS, LIBRARY_PROOF_TTL_SECONDS, 60])
  })

  it('gives a flagged row whose file is still public the public grid rendition, not the master', async () => {
    const url = await proofLibraryAssetUrl({ isProtected: true, url: pub('root/b.jpg'), storagePath: 'root/b.jpg' })
    expect(url).toBe(gridOf('root/b.jpg'))
    expect(signed).toEqual([])
  })

  it('shows nothing for a protected vector, a row with no file, or a failed mint', async () => {
    expect(await proofLibraryAssetUrl({ isProtected: true, url: null, storagePath: 'root/logo.svg' })).toBeNull()
    expect(await proofLibraryAssetUrl({ isProtected: true, url: pub('root/logo.svg'), storagePath: 'root/logo.svg' })).toBeNull()
    expect(await proofLibraryAssetUrl({ isProtected: true, url: null, storagePath: null })).toBeNull()
    failMint = true
    expect(await proofLibraryAssetUrl({ isProtected: true, url: null, storagePath: 'root/b.jpg' })).toBeNull()
    expect(signed).toEqual([])
  })

  it('never signs an unprotected row: it gets the thumbnail it always had', async () => {
    expect(await proofLibraryAssetUrl({ isProtected: false, url: pub('root/b.jpg'), storagePath: 'root/b.jpg' })).toBe(
      gridOf('root/b.jpg'),
    )
    expect(await proofLibraryAssetUrl({ isProtected: false, url: null, storagePath: 'root/b.jpg' })).toBeNull()
    expect(signed).toEqual([])
  })

  it('serves audio and video as they are (they cannot be private, and a transform breaks a player)', async () => {
    const mp3 = 'https://x.supabase.co/storage/v1/object/public/recordings-media/a.mp3'
    expect(await proofLibraryAssetUrl({ isProtected: true, url: mp3, storagePath: 'a.mp3', kind: 'audio' })).toBe(mp3)
  })
})

describe('withLoomProofs', () => {
  const row = (over: Partial<LoomPickAsset>): LoomPickAsset => ({
    id: 'a',
    title: 'A',
    url: pub('root/a.jpg'),
    alt: null,
    kind: 'image',
    generated: false,
    tags: [],
    category: null,
    isProtected: false,
    ...over,
  })

  it('swaps a protected row for its proof and strips every storage key', async () => {
    const out = await withLoomProofs([
      row({ id: 'open', storagePath: 'root/a.jpg' }),
      row({ id: 'locked', url: '', isProtected: true, storagePath: 'root/p.jpg' }),
    ])
    expect(out.map((a) => a.id)).toEqual(['open', 'locked'])
    expect(out[0].url).toBe(pub('root/a.jpg'))
    expect(out[1].url).toContain('/render/image/sign/library-private/root/p.jpg')
    for (const a of out) expect('storagePath' in a).toBe(false)
  })

  it('never hands a picker a protected master, even one still in the public bucket', async () => {
    const out = await withLoomProofs([row({ id: 'flagged', isProtected: true, url: pub('root/f.jpg') })])
    expect(out[0].url).toBe(gridOf('root/f.jpg'))
    expect(out[0].url).not.toBe(pub('root/f.jpg'))
  })

  it('drops a protected row that has no proof to show', async () => {
    failMint = true
    const out = await withLoomProofs([row({ id: 'locked', url: '', isProtected: true, storagePath: 'root/p.jpg' })])
    expect(out).toEqual([])
  })
})
