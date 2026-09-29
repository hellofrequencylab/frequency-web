import { describe, it, expect } from 'vitest'

// One asset's words (LIVE-568, ADR-1586): the one validation both Loom doors share. The Space door's
// write (updateSpaceLoomAssetMeta) moved to the caller's session in LIVE-571 and is proved, bound to
// space_id and refused by the update policy, in lib/library/space-loom-store.test.ts.

import { normalizeAssetMeta } from './asset-meta'

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
