import { describe, it, expect, vi, beforeEach } from 'vitest'

// One asset's words (LIVE-568, ADR-1586): the one validation both Loom doors share, and the Space
// door's write (lib/library/store.ts), which must be bound to space_id so an id from another Space updates nothing.

const calls: string[] = []
let result: { data: unknown; error: { message: string } | null } = { data: { id: 'a1' }, error: null }
let patchSeen: Record<string, unknown> | null = null

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      calls.push(`from:${table}`)
      const chain = {
        update: (patch: Record<string, unknown>) => {
          patchSeen = patch
          return chain
        },
        eq: (col: string, val: unknown) => {
          calls.push(`eq:${col}=${String(val)}`)
          return chain
        },
        select: () => chain,
        maybeSingle: () => Promise.resolve(result),
      }
      return chain
    },
  }),
}))

import { normalizeAssetMeta } from './asset-meta'
import { updateSpaceLibraryAssetMeta } from './store'

beforeEach(() => {
  calls.length = 0
  patchSeen = null
  result = { data: { id: 'a1' }, error: null }
})

describe('normalizeAssetMeta', () => {
  it('shapes title, alt and tags the way the Loom Studio drawer always has', () => {
    expect(normalizeAssetMeta({ title: '  Sunrise  ', alt: ' A lake at dawn ', tags: ' Lake, DAWN, ,water ' })).toEqual({
      ok: true,
      patch: { title: 'Sunrise', alt: 'A lake at dawn', tags: ['lake', 'dawn', 'water'] },
    })
  })
  it('leaves a field it was not sent out of the patch', () => {
    expect(normalizeAssetMeta({ alt: 'x' })).toEqual({ ok: true, patch: { alt: 'x' } })
    expect(normalizeAssetMeta({})).toEqual({ ok: true, patch: {} })
  })
  it('refuses an empty title, and clears alt on an empty string', () => {
    expect(normalizeAssetMeta({ title: '   ' })).toEqual({ error: 'Title cannot be empty.' })
    expect(normalizeAssetMeta({ alt: '  ' })).toEqual({ ok: true, patch: { alt: null } })
  })
  it('caps the lengths: title 200, alt 500, tags 40', () => {
    const out = normalizeAssetMeta({
      title: 't'.repeat(300),
      alt: 'a'.repeat(900),
      tags: Array.from({ length: 60 }, (_, i) => `t${i}`).join(','),
    })
    if (!('ok' in out)) throw new Error('expected ok')
    expect(out.patch.title).toHaveLength(200)
    expect(out.patch.alt).toHaveLength(500)
    expect(out.patch.tags).toHaveLength(40)
  })
  it('refuses a value that is not text rather than throwing on it', () => {
    expect('error' in normalizeAssetMeta({ title: 42 })).toBe(true)
    expect('error' in normalizeAssetMeta({ alt: { x: 1 } })).toBe(true)
    expect('error' in normalizeAssetMeta({ tags: ['a'] })).toBe(true)
  })
})

describe('updateSpaceLibraryAssetMeta: bound to the Space', () => {
  it('filters the write on the asset id AND the space id', async () => {
    expect(await updateSpaceLibraryAssetMeta('space-1', 'a1', { title: 'New' })).toBe('ok')
    expect(calls).toEqual(['from:library_assets', 'eq:id=a1', 'eq:space_id=space-1'])
    expect(patchSeen).toMatchObject({ title: 'New' })
    expect(typeof patchSeen?.updated_at).toBe('string')
  })
  it('an id from another Space matches no row: missing, not ok', async () => {
    result = { data: null, error: null }
    expect(await updateSpaceLibraryAssetMeta('space-1', 'someone-elses', { title: 'x' })).toBe('missing')
  })
  it('a database error is failed', async () => {
    result = { data: null, error: { message: 'boom' } }
    expect(await updateSpaceLibraryAssetMeta('space-1', 'a1', { title: 'x' })).toBe('failed')
  })
  it('no space or no asset never reaches the database', async () => {
    expect(await updateSpaceLibraryAssetMeta('', 'a1', {})).toBe('missing')
    expect(await updateSpaceLibraryAssetMeta('space-1', '', {})).toBe('missing')
    expect(calls).toEqual([])
  })
})
