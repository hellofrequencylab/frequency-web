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
vi.mock('@/lib/library/usage', () => ({ findLibraryAssetUsage: async () => ({ ok: true, pages: 0 }) }))

const updates: Array<{ table: string; patch: Record<string, unknown>; eqs: [string, unknown][] }> = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => {
        const rec = { table, patch, eqs: [] as [string, unknown][] }
        updates.push(rec)
        const api = {
          eq: (col: string, val: unknown) => {
            rec.eqs.push([col, val])
            return api
          },
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ error: null })),
        }
        return api
      },
    }),
    storage: { from: () => ({}) },
  }),
}))

const { updateLibraryAssetMeta } = await import('./actions')

beforeEach(() => {
  updates.length = 0
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

  it('stores Protected on and off', async () => {
    await updateLibraryAssetMeta('a1', { isProtected: true })
    expect(updates[0].patch.is_protected).toBe(true)
    await updateLibraryAssetMeta('a1', { isProtected: false })
    expect(updates[1].patch.is_protected).toBe(false)
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
