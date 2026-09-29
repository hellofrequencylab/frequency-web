import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LIBRARY_PRIVATE_BUCKET } from './protect-move'
import { RENDITION_PRESETS } from './renditions'
import type { LoomPickAsset } from './store'

// LIVE-580 (ADR-1623; owner rulings "Width-capped proof, no watermark" and "Store a small proof file"):
// a protected asset is shown as its STORED proof, never its original. These lock the consequences:
// every proof link signs `proofs/<path>` and never the master's path; a missing proof is written from
// storage's resize and refused unless its own bytes are at most 480 wide; a flagged row whose file is
// still public, a vector or a fileless row shows nothing; a pick list never carries a storage key.

type Signed = { bucket: string; path: string; ttl: number; opts?: { transform?: { width?: number; resize?: string } } }
const signed: Signed[] = []
const uploads: Array<{ bucket: string; path: string; bytes: Uint8Array; contentType?: string }> = []
const removed: Array<{ bucket: string; paths: string[] }> = []
let objects = new Set<string>()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, ttl: number, opts?: Signed['opts']) => {
          signed.push({ bucket, path, ttl, opts })
          // Storage refuses to sign an object that is not there; the proof reader relies on it.
          if (!objects.has(`${bucket}/${path}`)) return { data: null, error: { message: 'Object not found' } }
          const seg = opts?.transform ? 'render/image/sign' : 'object/sign'
          return { data: { signedUrl: `https://x.supabase.co/storage/v1/${seg}/${bucket}/${path}?token=t` }, error: null }
        },
        upload: async (path: string, bytes: Uint8Array, o?: { contentType?: string }) => {
          uploads.push({ bucket, path, bytes, contentType: o?.contentType })
          objects.add(`${bucket}/${path}`)
          return { data: { path }, error: null }
        },
        remove: async (paths: string[]) => {
          removed.push({ bucket, paths })
          for (const p of paths) objects.delete(`${bucket}/${p}`)
          return { data: [], error: null }
        },
      }),
    },
  }),
}))

const { proofLibraryAssetUrl, withLoomProofs, LIBRARY_PROOF_WIDTH, LIBRARY_PROOF_TTL_SECONDS } = await import('./asset-urls')
const { libraryProofPath, writeLibraryProof, removeLibraryProof, LIBRARY_PROOF_PREFIX } = await import('./proof-object')

/** A PNG header with the given width (readImageDimensions parses IHDR). */
function png(width: number, height = 100): Uint8Array {
  const b = new Uint8Array(64)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  new DataView(b.buffer).setUint32(16, width)
  new DataView(b.buffer).setUint32(20, height)
  return b
}

let served: { status: number; type: string; body: Uint8Array } = { status: 200, type: 'image/png', body: png(480) }
const fetched: string[] = []

const pub = (p: string) => `https://x.supabase.co/storage/v1/object/public/library-media/${p}`
const gridOf = (p: string) =>
  `https://x.supabase.co/storage/v1/render/image/public/library-media/${p}?width=480&resize=contain`
const master = (p: string) => objects.add(`${LIBRARY_PRIVATE_BUCKET}/${p}`)

beforeEach(() => {
  signed.length = 0
  uploads.length = 0
  removed.length = 0
  fetched.length = 0
  objects = new Set()
  served = { status: 200, type: 'image/png', body: png(480) }
  vi.stubGlobal('fetch', async (url: string) => {
    fetched.push(url)
    return new Response(served.body.slice().buffer as ArrayBuffer, { status: served.status, headers: { 'content-type': served.type } })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('libraryProofPath', () => {
  it('is a separate object under proofs/, never the master path', () => {
    expect(libraryProofPath('space/a.jpg')).toBe('proofs/space/a.jpg')
    expect(libraryProofPath('space/a.jpg')).not.toBe('space/a.jpg')
    expect(libraryProofPath('/space/a.jpg').startsWith(LIBRARY_PROOF_PREFIX)).toBe(true)
  })

  it('caps at the grid preset width', () => {
    expect(LIBRARY_PROOF_WIDTH).toBe(RENDITION_PRESETS.grid.maxWidth)
  })
})

describe('proofLibraryAssetUrl', () => {
  it('signs the stored proof object, and never the master path', async () => {
    master('root/b.jpg')
    objects.add(`${LIBRARY_PRIVATE_BUCKET}/proofs/root/b.jpg`)
    const url = await proofLibraryAssetUrl({ isProtected: true, url: null, storagePath: 'root/b.jpg', kind: 'image' })
    expect(url).toBe('https://x.supabase.co/storage/v1/object/sign/library-private/proofs/root/b.jpg?token=t')
    expect(signed.map((s) => s.path)).toEqual(['proofs/root/b.jpg'])
    expect(uploads).toEqual([])
  })

  it('writes a missing proof from storage resize, then signs it; the master is signed only to make it, never returned', async () => {
    master('root/b.jpg')
    const url = await proofLibraryAssetUrl({ isProtected: true, url: null, storagePath: 'root/b.jpg' })
    expect(url).toContain('/object/sign/library-private/proofs/root/b.jpg')
    // The one signature of the master carries the width cap and is fetched server-side only.
    const ofMaster = signed.filter((s) => s.path === 'root/b.jpg')
    expect(ofMaster).toHaveLength(1)
    expect(ofMaster[0].opts?.transform).toEqual({ width: LIBRARY_PROOF_WIDTH, resize: 'contain' })
    expect(ofMaster[0].ttl).toBeLessThanOrEqual(60)
    expect(fetched).toHaveLength(1)
    expect(url).not.toBe(fetched[0])
    expect(uploads).toHaveLength(1)
    expect(uploads[0]).toMatchObject({ bucket: LIBRARY_PRIVATE_BUCKET, path: 'proofs/root/b.jpg', contentType: 'image/png' })
  })

  it('never lives longer than the hour, however it is asked', async () => {
    objects.add(`${LIBRARY_PRIVATE_BUCKET}/proofs/root/b.jpg`)
    await proofLibraryAssetUrl({ isProtected: true, url: null, storagePath: 'root/b.jpg' }, 24 * 60 * 60)
    await proofLibraryAssetUrl({ isProtected: true, url: null, storagePath: 'root/b.jpg' }, 60)
    expect(signed.map((s) => s.ttl)).toEqual([LIBRARY_PROOF_TTL_SECONDS, 60])
  })

  it('shows nothing for a flagged row whose file is still public: any link there is a link to a public master', async () => {
    expect(await proofLibraryAssetUrl({ isProtected: true, url: pub('root/b.jpg'), storagePath: 'root/b.jpg' })).toBeNull()
    expect(signed).toEqual([])
  })

  it('shows nothing for a protected vector or a row with no file', async () => {
    expect(await proofLibraryAssetUrl({ isProtected: true, url: null, storagePath: 'root/logo.svg' })).toBeNull()
    expect(await proofLibraryAssetUrl({ isProtected: true, url: null, storagePath: null })).toBeNull()
    expect(signed).toEqual([])
  })

  it('shows nothing when no proof can be written', async () => {
    master('root/b.jpg')
    served = { status: 400, type: 'application/json', body: new Uint8Array([123, 125]) }
    expect(await proofLibraryAssetUrl({ isProtected: true, url: null, storagePath: 'root/b.jpg' })).toBeNull()
    expect(uploads).toEqual([])
  })

  it('never signs an unprotected row: it gets the thumbnail it always had', async () => {
    expect(await proofLibraryAssetUrl({ isProtected: false, url: pub('root/b.jpg'), storagePath: 'root/b.jpg' })).toBe(gridOf('root/b.jpg'))
    expect(await proofLibraryAssetUrl({ isProtected: false, url: null, storagePath: 'root/b.jpg' })).toBeNull()
    expect(signed).toEqual([])
  })

  it('serves audio and video as they are (they cannot be private, and a transform breaks a player)', async () => {
    const mp3 = 'https://x.supabase.co/storage/v1/object/public/recordings-media/a.mp3'
    expect(await proofLibraryAssetUrl({ isProtected: true, url: mp3, storagePath: 'a.mp3', kind: 'audio' })).toBe(mp3)
  })
})

describe('writeLibraryProof', () => {
  it('refuses to store bytes wider than the cap: a proof can never be the master under another name', async () => {
    master('root/b.jpg')
    served = { status: 200, type: 'image/png', body: png(4000) }
    expect(await writeLibraryProof('root/b.jpg')).toBe(false)
    expect(uploads).toEqual([])
  })

  it('refuses bytes whose width cannot be read, and anything that is not a raster image', async () => {
    master('root/b.jpg')
    served = { status: 200, type: 'image/png', body: new Uint8Array(64) }
    expect(await writeLibraryProof('root/b.jpg')).toBe(false)
    served = { status: 200, type: 'image/svg+xml', body: png(100) }
    expect(await writeLibraryProof('root/b.jpg')).toBe(false)
    expect(uploads).toEqual([])
  })

  it('never makes a proof of a proof', async () => {
    expect(await writeLibraryProof('proofs/root/b.jpg')).toBe(false)
    expect(signed).toEqual([])
  })

  it('removeLibraryProof deletes only the proof object', async () => {
    await removeLibraryProof('root/b.jpg')
    await removeLibraryProof(null)
    expect(removed).toEqual([{ bucket: LIBRARY_PRIVATE_BUCKET, paths: ['proofs/root/b.jpg'] }])
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

  it('swaps a protected row for its proof link and strips every storage key', async () => {
    objects.add(`${LIBRARY_PRIVATE_BUCKET}/proofs/root/p.jpg`)
    const out = await withLoomProofs([
      row({ id: 'open', storagePath: 'root/a.jpg' }),
      row({ id: 'locked', url: '', isProtected: true, storagePath: 'root/p.jpg' }),
    ])
    expect(out.map((a) => a.id)).toEqual(['open', 'locked'])
    expect(out[0].url).toBe(pub('root/a.jpg'))
    expect(out[1].url).toContain('/object/sign/library-private/proofs/root/p.jpg')
    for (const a of out) expect('storagePath' in a).toBe(false)
  })

  it('never hands a picker a protected master, even one still in the public bucket', async () => {
    const out = await withLoomProofs([row({ id: 'flagged', isProtected: true, url: pub('root/f.jpg') })])
    expect(out).toEqual([])
  })

  it('drops a protected row that has no proof to show', async () => {
    served = { status: 500, type: 'text/plain', body: new Uint8Array([1]) }
    const out = await withLoomProofs([row({ id: 'locked', url: '', isProtected: true, storagePath: 'root/p.jpg' })])
    expect(out).toEqual([])
  })
})
