import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  LIBRARY_PRIVATE_BUCKET,
  LIBRARY_PUBLIC_BUCKET,
  PROTECT_REFUSAL,
  planProtectMove,
  protectRefusal,
  type ProtectVersionRow,
} from './protect-move'

// LIVE-577 (ADR-1595): Protected moves the file. These lock the plan's consequences (the flag
// follows the bucket, every version's file moves with the asset, a private row stores no url) and
// the one signing function's (a protected private row is signed, everything else passes through).

const signed: Array<{ bucket: string; path: string; ttl: number }> = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, ttl: number) => {
          signed.push({ bucket, path, ttl })
          return { data: { signedUrl: `https://x.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t` }, error: null }
        },
      }),
    },
  }),
}))

const { signedLibraryAssetUrl, LIBRARY_SIGNED_URL_TTL_SECONDS } = await import('./asset-urls')

const pub = (p: string) => `https://x.supabase.co/storage/v1/object/public/library-media/${p}`
const image = {
  id: 'a',
  kind: 'image',
  storage_bucket: LIBRARY_PUBLIC_BUCKET,
  storage_path: 'root/b.png',
  url: pub('root/b.png'),
  is_protected: false,
}
const version = (id: string, path: string, bucket = LIBRARY_PUBLIC_BUCKET): ProtectVersionRow => ({
  id,
  storage_bucket: bucket,
  storage_path: path,
  recipe: { url: pub(path), storage_bucket: bucket, storage_path: path, width: 10 },
})

describe('planProtectMove', () => {
  it('moves the current file and every version file in the same bucket, once each', () => {
    const plan = planProtectMove(image, [version('v1', 'root/a.png'), version('v2', 'root/b.png')], true, pub)
    if (!plan.ok || !plan.move) throw new Error('expected a move')
    expect(plan.from).toBe(LIBRARY_PUBLIC_BUCKET)
    expect(plan.to).toBe(LIBRARY_PRIVATE_BUCKET)
    expect(plan.paths).toEqual(['root/b.png', 'root/a.png'])
    expect(plan.asset).toEqual({ storage_bucket: LIBRARY_PRIVATE_BUCKET, url: null, is_protected: true })
    expect(plan.assetBefore).toEqual({ storage_bucket: LIBRARY_PUBLIC_BUCKET, url: pub('root/b.png'), is_protected: false })
    // A version's snapshot follows the file, keeps its other fields, and stores no url when private.
    expect(plan.versions[0].after.recipe).toEqual({
      url: null,
      storage_bucket: LIBRARY_PRIVATE_BUCKET,
      storage_path: 'root/a.png',
      width: 10,
    })
    expect(plan.versions[0].before.storage_bucket).toBe(LIBRARY_PUBLIC_BUCKET)
  })

  it('leaves a version whose file is in another bucket where it is', () => {
    const plan = planProtectMove(image, [version('v1', 'root/old.png', 'site-media')], true, pub)
    if (!plan.ok || !plan.move) throw new Error('expected a move')
    expect(plan.paths).toEqual(['root/b.png'])
    expect(plan.versions).toEqual([])
  })

  it('switching off moves back and restores the public url', () => {
    const priv = { ...image, storage_bucket: LIBRARY_PRIVATE_BUCKET, url: null, is_protected: true }
    const plan = planProtectMove(priv, [version('v1', 'root/a.png', LIBRARY_PRIVATE_BUCKET)], false, pub)
    if (!plan.ok || !plan.move) throw new Error('expected a move')
    expect(plan.to).toBe(LIBRARY_PUBLIC_BUCKET)
    expect(plan.asset).toEqual({ storage_bucket: LIBRARY_PUBLIC_BUCKET, url: pub('root/b.png'), is_protected: false })
    expect(plan.versions[0].after.recipe?.url).toBe(pub('root/a.png'))
  })

  it('moves nothing when the file already sits where the flag says', () => {
    expect(planProtectMove(image, [], false, pub)).toEqual({ ok: true, move: false, isProtected: false })
    const priv = { ...image, storage_bucket: LIBRARY_PRIVATE_BUCKET, url: null }
    expect(planProtectMove(priv, [], true, pub)).toEqual({ ok: true, move: false, isProtected: true })
  })

  it('moves a row flagged Protected whose file stayed public: the bucket decides, not the flag', () => {
    const plan = planProtectMove({ ...image, is_protected: true }, [], true, pub)
    expect(plan.ok && plan.move).toBe(true)
  })

  it('releasing audio or an element moves nothing and refuses nothing', () => {
    const audio = { ...image, kind: 'audio', storage_bucket: 'recordings-media' }
    expect(planProtectMove(audio, [], false, pub)).toEqual({ ok: true, move: false, isProtected: false })
    const element = { ...image, kind: 'element', storage_bucket: null, storage_path: null, url: null }
    expect(planProtectMove(element, [], false, pub)).toEqual({ ok: true, move: false, isProtected: false })
  })
})

describe('protectRefusal', () => {
  it('refuses audio, video, a code element and a foreign bucket, only when protecting', () => {
    expect(protectRefusal({ ...image, kind: 'video' }, true)).toBe(PROTECT_REFUSAL.av)
    expect(protectRefusal({ ...image, storage_bucket: 'recordings-media' }, true)).toBe(PROTECT_REFUSAL.av)
    expect(protectRefusal({ ...image, storage_bucket: null, storage_path: null }, true)).toBe(PROTECT_REFUSAL.noFile)
    expect(protectRefusal({ ...image, storage_bucket: 'event-media' }, true)).toBe(PROTECT_REFUSAL.foreign)
    expect(protectRefusal({ ...image, source: 'seed' }, true)).toBe(PROTECT_REFUSAL.filed)
    expect(protectRefusal({ ...image, source: 'import' }, true)).toBe(PROTECT_REFUSAL.filed)
    expect(protectRefusal({ ...image, source: 'curated' }, true)).toBeNull()
    expect(protectRefusal(image, true)).toBeNull()
    expect(protectRefusal({ ...image, kind: 'video' }, false)).toBeNull()
  })

  it('reads in the house voice: no em dash in any refusal', () => {
    for (const sentence of Object.values(PROTECT_REFUSAL)) expect(sentence).not.toMatch(/—/)
  })
})

describe('signedLibraryAssetUrl', () => {
  beforeEach(() => {
    signed.length = 0
  })

  it('signs a protected row whose file is private, from the private bucket, for the default hour', async () => {
    const url = await signedLibraryAssetUrl({ isProtected: true, url: null, storagePath: 'root/b.png' })
    expect(url).toContain('/object/sign/library-private/root/b.png')
    expect(signed).toEqual([{ bucket: LIBRARY_PRIVATE_BUCKET, path: 'root/b.png', ttl: LIBRARY_SIGNED_URL_TTL_SECONDS }])
  })

  it('passes an explicit ttl through', async () => {
    await signedLibraryAssetUrl({ isProtected: true, url: null, storagePath: 'root/b.png' }, 60)
    expect(signed[0].ttl).toBe(60)
  })

  it('returns an unprotected row url unchanged and signs nothing', async () => {
    expect(await signedLibraryAssetUrl({ isProtected: false, url: pub('root/b.png'), storagePath: 'root/b.png' })).toBe(
      pub('root/b.png'),
    )
    expect(signed).toEqual([])
  })

  it('serves a flagged row whose file is still public by its public url', async () => {
    expect(await signedLibraryAssetUrl({ isProtected: true, url: pub('root/b.png'), storagePath: 'root/b.png' })).toBe(
      pub('root/b.png'),
    )
    expect(signed).toEqual([])
  })

  it('is null for a protected row with no file', async () => {
    expect(await signedLibraryAssetUrl({ isProtected: true, url: null, storagePath: null })).toBeNull()
  })
})
