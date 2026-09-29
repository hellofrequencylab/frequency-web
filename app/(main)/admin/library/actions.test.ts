import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-576 (ADR-1577): the metadata action is the ONE door through which an operator sets the three
// protection hooks. The consequence these lock: a download policy outside the closed set is refused
// with a sentence (never handed to the CHECK constraint), a non-boolean Protected is refused, a date
// the runtime cannot parse is refused, an empty Expires clears the licence end, and a caller that
// sends title and tags only writes exactly what it wrote before this row.

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('@/lib/admin/guard', () => ({ requireAdmin: async () => ({ id: 'staff-1' }) }))
vi.mock('@/lib/library/store', () => ({
  getRootSpaceId: async () => 'root',
  insertSpaceLibraryImage: async () => 'id',
  findLibraryAssetBySha256: async () => null,
}))
vi.mock('@/lib/library/ingest', () => ({ ingestImageBytes: () => ({}) }))
vi.mock('@/lib/library/image-describe', () => ({ readImageDescriptor: () => ({}) }))
vi.mock('@/lib/library/upload-kinds', () => ({
  classifyLoomUpload: () => null,
  fallbackExtFor: () => 'bin',
  fallbackMimeFor: () => 'application/octet-stream',
}))
const usage = { ok: true as boolean, pages: 0 }
vi.mock('@/lib/library/usage', () => ({ findLibraryAssetUsage: async () => ({ ...usage }) }))

// ── An in-memory Supabase: just enough of the table and storage API for the metadata door and the
// protect move (LIVE-577). Rows live in `tables`, objects in `buckets`, every step lands in `log` so a
// test can read the ORDER (a version recorded before the first copy), and `fail` breaks one step.
type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {}
const buckets: Record<string, Set<string>> = {}
const log: string[] = []
const fail: { copyAt?: string; versionUpdate?: boolean; remove?: boolean } = {}
const updates: Array<{ table: string; patch: Record<string, unknown>; eqs: [string, unknown][] }> = []

function query(table: string) {
  const rows = () => (tables[table] ??= [])
  const filters: Array<(r: Row) => boolean> = []
  let patch: Record<string, unknown> | null = null
  let head = false
  let rec: (typeof updates)[number] | null = null
  const matching = () => rows().filter((r) => filters.every((f) => f(r)))
  const api = {
    select: (_cols?: string, opts?: { head?: boolean }) => {
      head = !!opts?.head
      return api
    },
    update: (p: Record<string, unknown>) => {
      patch = p
      rec = { table, patch: p, eqs: [] }
      updates.push(rec)
      return api
    },
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val)
      rec?.eqs.push([col, val])
      return api
    },
    neq: (col: string, val: unknown) => {
      filters.push((r) => r[col] !== val)
      return api
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]))
      return api
    },
    or: (expr: string) => {
      const arms = expr.split(',').map((t) => t.split('.eq.'))
      filters.push((r) => arms.some(([c, v]) => r[c] === v))
      return api
    },
    maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => {
      if (patch) {
        if (fail.versionUpdate && table === 'library_versions' && patch.storage_bucket === 'library-private') {
          return Promise.resolve(resolve({ data: null, error: { message: 'boom' } }))
        }
        const hit = matching()
        for (const r of hit) Object.assign(r, patch)
        log.push(`update:${table}`)
        return Promise.resolve(resolve({ data: hit.map((r) => ({ id: r.id })), error: null }))
      }
      if (head) return Promise.resolve(resolve({ count: matching().length, error: null }))
      return Promise.resolve(resolve({ data: matching(), error: null }))
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => query(table),
    storage: {
      from: (bucket: string) => {
        const objs = (buckets[bucket] ??= new Set())
        return {
          copy: async (from: string, to: string, opts: { destinationBucket: string }) => {
            if (fail.copyAt === from || !objs.has(from)) return { data: null, error: { message: 'copy failed' } }
            ;(buckets[opts.destinationBucket] ??= new Set()).add(to)
            log.push(`copy:${from}`)
            return { data: { path: to }, error: null }
          },
          remove: async (paths: string[]) => {
            if (fail.remove && bucket === 'library-media') return { data: null, error: { message: 'remove failed' } }
            for (const p of paths) objs.delete(p)
            log.push(`remove:${bucket}`)
            return { data: [], error: null }
          },
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
        }
      },
    },
  }),
}))

// recordVersion snapshots the row into library_versions, as lib/library/versions.ts does.
vi.mock('@/lib/library/versions', () => ({
  recordVersion: async (assetId: string, note: string) => {
    const a = (tables.library_assets ?? []).find((r) => r.id === assetId)
    if (!a) return
    log.push(`version:${note}`)
    ;(tables.library_versions ??= []).push({
      id: `v-${(tables.library_versions ?? []).length + 1}`,
      asset_id: assetId,
      storage_bucket: a.storage_bucket,
      storage_path: a.storage_path,
      recipe: { url: a.url, storage_bucket: a.storage_bucket, storage_path: a.storage_path },
    })
  },
}))

const { updateLibraryAssetMeta, protectLibraryAsset } = await import('./actions')

const ID = '11111111-2222-4333-8444-555555555555'
const PUB = (p: string) => `https://x.supabase.co/storage/v1/object/public/library-media/${p}`

/** One uploaded image in library-media, edited once (so an older original sits beside it). */
function seedImage(over: Row = {}) {
  tables.library_assets = [
    {
      id: ID,
      kind: 'image',
      storage_bucket: 'library-media',
      storage_path: 'root/b.png',
      url: PUB('root/b.png'),
      is_protected: false,
      ...over,
    },
  ]
  tables.library_versions = [
    {
      id: 'v-old',
      asset_id: ID,
      storage_bucket: 'library-media',
      storage_path: 'root/a.png',
      recipe: { url: PUB('root/a.png'), storage_bucket: 'library-media', storage_path: 'root/a.png' },
    },
  ]
  buckets['library-media'] = new Set(['root/a.png', 'root/b.png'])
  buckets['library-private'] = new Set()
}

beforeEach(() => {
  updates.length = 0
  log.length = 0
  for (const k of Object.keys(tables)) delete tables[k]
  for (const k of Object.keys(buckets)) delete buckets[k]
  for (const k of Object.keys(fail)) delete fail[k as keyof typeof fail]
  usage.ok = true
  usage.pages = 0
})

describe('updateLibraryAssetMeta: the protection hooks reach the row through one validated door', () => {
  it('refuses a download policy outside LIBRARY_DOWNLOAD_POLICIES and writes nothing', async () => {
    const res = await updateLibraryAssetMeta('a1', { downloadPolicy: 'everyone' })
    expect(res).toEqual({ error: 'Download policy must be one of open, members, staff.' })
    expect(updates).toHaveLength(0)
  })

  it('writes each of the three policies the schema allows', async () => {
    for (const policy of ['open', 'members', 'staff']) {
      updates.length = 0
      expect(await updateLibraryAssetMeta('a1', { downloadPolicy: policy })).toEqual({ ok: true })
      expect(updates[0].patch.download_policy).toBe(policy)
      expect(updates[0].eqs).toEqual([['id', 'a1']])
    }
  })

  it('refuses a Protected that is not a boolean', async () => {
    const res = await updateLibraryAssetMeta('a1', { isProtected: 'yes' as unknown as boolean })
    expect('error' in res).toBe(true)
    expect(updates).toHaveLength(0)
  })

  it('hands Protected to the move instead of writing a bare flag (LIVE-577)', async () => {
    seedImage()
    expect(await updateLibraryAssetMeta(ID, { title: 'Sunrise', isProtected: true })).toEqual({ ok: true })
    const row = tables.library_assets[0]
    expect(row).toMatchObject({ is_protected: true, storage_bucket: 'library-private', url: null, title: 'Sunrise' })
    // The metadata patch itself never carries the flag.
    const metaPatch = updates.find((u) => u.table === 'library_assets' && 'title' in u.patch)
    expect(metaPatch && 'is_protected' in metaPatch.patch).toBe(false)
  })

  it('saves nothing when the move is refused', async () => {
    seedImage()
    usage.pages = 2
    const res = await updateLibraryAssetMeta(ID, { title: 'Sunrise', isProtected: true })
    expect(res).toEqual({ error: 'This asset is on 2 pages. Swap it out there first, then protect it.' })
    expect(tables.library_assets[0]).toMatchObject({ is_protected: false, storage_bucket: 'library-media' })
    expect('title' in tables.library_assets[0]).toBe(false)
    expect(updates).toEqual([])
  })

  it('normalises a date-only Expires to an ISO timestamptz', async () => {
    expect(await updateLibraryAssetMeta('a1', { expiresAt: '2026-12-31' })).toEqual({ ok: true })
    expect(updates[0].patch.expires_at).toBe('2026-12-31T00:00:00.000Z')
  })

  it('clears the licence end on null or an empty string', async () => {
    await updateLibraryAssetMeta('a1', { expiresAt: null })
    expect(updates[0].patch.expires_at).toBeNull()
    await updateLibraryAssetMeta('a1', { expiresAt: '  ' })
    expect(updates[1].patch.expires_at).toBeNull()
  })

  it('refuses a date the runtime cannot parse', async () => {
    const res = await updateLibraryAssetMeta('a1', { expiresAt: 'someday' })
    expect(res).toEqual({ error: 'Expires needs a real date, or leave it blank.' })
    expect(updates).toHaveLength(0)
  })

  it('leaves the three columns untouched when a caller sends only the old fields', async () => {
    await updateLibraryAssetMeta('a1', { title: 'Sunrise', tags: 'a, b' })
    const patch = updates[0].patch
    expect(patch.title).toBe('Sunrise')
    expect(patch.tags).toEqual(['a', 'b'])
    expect('download_policy' in patch).toBe(false)
    expect('is_protected' in patch).toBe(false)
    expect('expires_at' in patch).toBe(false)
  })
})

describe('protectLibraryAsset: Protected moves the original off the open web (LIVE-577)', () => {
  it('moves the current file AND every version file into library-private, recording a version first', async () => {
    seedImage()
    expect(await protectLibraryAsset(ID, true)).toEqual({ ok: true })

    expect(tables.library_assets[0]).toMatchObject({ storage_bucket: 'library-private', url: null, is_protected: true })
    // The original from before the edit moved too, so no public URL reaches any version of it.
    expect([...buckets['library-media']]).toEqual([])
    expect([...buckets['library-private']].sort()).toEqual(['root/a.png', 'root/b.png'])
    for (const v of tables.library_versions) {
      expect(v.storage_bucket).toBe('library-private')
      expect((v.recipe as Row).storage_bucket).toBe('library-private')
      expect((v.recipe as Row).url).toBeNull()
    }
    expect(log[0]).toBe('version:Before protect')
    expect(log.indexOf('version:Before protect')).toBeLessThan(log.findIndex((l) => l.startsWith('copy:')))
    expect(log.at(-1)).toBe('remove:library-media')
  })

  it('moves it back with a public url when Protected is switched off', async () => {
    seedImage()
    await protectLibraryAsset(ID, true)
    expect(await protectLibraryAsset(ID, false)).toEqual({ ok: true })
    expect(tables.library_assets[0]).toMatchObject({
      storage_bucket: 'library-media',
      url: PUB('root/b.png'),
      is_protected: false,
    })
    expect([...buckets['library-private']]).toEqual([])
    expect(tables.library_versions.every((v) => v.storage_bucket === 'library-media')).toBe(true)
  })

  it('refuses an asset placed on a page, and changes nothing', async () => {
    seedImage()
    usage.pages = 1
    expect(await protectLibraryAsset(ID, true)).toEqual({
      error: 'This asset is on 1 page. Swap it out there first, then protect it.',
    })
    expect(tables.library_assets[0].storage_bucket).toBe('library-media')
    expect(log).toEqual([])
  })

  it('counts a column image (a Space logo) as a page, which the block usage index cannot see', async () => {
    seedImage()
    tables.spaces = [{ id: 's1', brand_logo_asset_id: ID, cover_image_asset_id: null }]
    const res = await protectLibraryAsset(ID, true)
    expect(res).toEqual({ error: 'This asset is on 1 page. Swap it out there first, then protect it.' })
    expect(buckets['library-media'].has('root/b.png')).toBe(true)
  })

  it('refuses when usage could not be read: unread is not unused', async () => {
    seedImage()
    usage.ok = false
    expect('error' in (await protectLibraryAsset(ID, true))).toBe(true)
    expect(log).toEqual([])
  })

  it('refuses audio with a sentence, and an element with no file', async () => {
    seedImage({ kind: 'audio', storage_bucket: 'recordings-media' })
    expect(await protectLibraryAsset(ID, true)).toEqual({
      error: 'Audio and video cannot be protected yet. Their files live in a bucket with no private side.',
    })
    seedImage({ kind: 'element', storage_bucket: null, storage_path: null, url: null })
    expect('error' in (await protectLibraryAsset(ID, true))).toBe(true)
  })

  it('undoes the copies already made when a later copy fails, leaving the row unchanged', async () => {
    seedImage()
    fail.copyAt = 'root/a.png'
    expect(await protectLibraryAsset(ID, true)).toEqual({ error: 'Could not move the file, so nothing changed. Try again.' })
    expect(tables.library_assets[0]).toMatchObject({ storage_bucket: 'library-media', url: PUB('root/b.png'), is_protected: false })
    expect([...buckets['library-private']]).toEqual([])
    expect([...buckets['library-media']].sort()).toEqual(['root/a.png', 'root/b.png'])
  })

  it('restores the row and drops the copies when a version row cannot follow', async () => {
    seedImage()
    fail.versionUpdate = true
    expect('error' in (await protectLibraryAsset(ID, true))).toBe(true)
    expect(tables.library_assets[0]).toMatchObject({ storage_bucket: 'library-media', url: PUB('root/b.png'), is_protected: false })
    expect([...buckets['library-private']]).toEqual([])
    expect([...buckets['library-media']].sort()).toEqual(['root/a.png', 'root/b.png'])
  })

  it('keeps the move when only the public copy failed to go, and the next protect sweeps it', async () => {
    seedImage()
    fail.remove = true
    expect(await protectLibraryAsset(ID, true)).toEqual({
      error: 'Protected, but the public copy could not be removed yet. Save again to finish.',
    })
    // The row and the private copies agree; nothing was dropped.
    expect(tables.library_assets[0]).toMatchObject({ storage_bucket: 'library-private', is_protected: true })
    expect(buckets['library-private'].has('root/b.png')).toBe(true)
    delete fail.remove
    expect(await protectLibraryAsset(ID, true)).toEqual({ ok: true })
    expect([...buckets['library-media']]).toEqual([])
  })

  it('moves a row LIVE-576 flagged while its file stayed public: the bucket decides, not the flag', async () => {
    seedImage({ is_protected: true })
    expect(await protectLibraryAsset(ID, true)).toEqual({ ok: true })
    expect(tables.library_assets[0]).toMatchObject({ storage_bucket: 'library-private', url: null })
  })

  it('refuses a file another Loom row shares, so protecting one cannot pull the other off the web', async () => {
    seedImage()
    tables.library_assets.push({ id: 'other', kind: 'image', storage_bucket: 'library-media', storage_path: 'root/b.png' })
    expect(await protectLibraryAsset(ID, true)).toEqual({
      error: 'Another Loom asset uses this same file, so moving it would pull that one off the web too.',
    })
    expect([...buckets['library-media']].sort()).toEqual(['root/a.png', 'root/b.png'])
    expect(log).toEqual([])
  })

  it('refuses a file another asset keeps in its history', async () => {
    seedImage()
    tables.library_versions.push({ id: 'v-x', asset_id: 'other', storage_bucket: 'library-media', storage_path: 'root/a.png', recipe: null })
    expect('error' in (await protectLibraryAsset(ID, true))).toBe(true)
    expect(tables.library_assets[0].storage_bucket).toBe('library-media')
  })

  it('refuses a seed image the importer filed, which its Space may paint by address', async () => {
    seedImage({ source: 'seed' })
    expect(await protectLibraryAsset(ID, true)).toEqual({
      error: 'This image came in with a Space import, and that Space may show it by its address. Upload your own copy to protect it.',
    })
    expect(log).toEqual([])
  })

  it('refuses an id that is not a uuid before it reads anything', async () => {
    expect(await protectLibraryAsset('a1', true)).toEqual({ error: 'Missing asset id.' })
  })
})
