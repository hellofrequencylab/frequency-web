import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DESCRIBE_ON_VIEW_LIMIT, pickUndescribed, type DescribeOnViewRow } from './describe-on-view'

// LIVE-588 (ADR-1590): the Loom grids describe the rows they render that were filed with no browser
// in the flow (importer seeds, event-photo copies). The decode needs a canvas and is not tested
// here; the choice of rows, the cap, and the wiring are.

const img = (id: string, extra: Partial<DescribeOnViewRow> = {}): DescribeOnViewRow => ({
  id,
  kind: 'image',
  url: `https://x.supabase.co/storage/v1/object/public/library/${id}.jpg`,
  blurhash: null,
  ...extra,
})

describe('pickUndescribed', () => {
  it('takes raster images whose blurhash is known to be missing, in grid order', () => {
    const rows = [img('a'), img('b', { blurhash: 'LEHV6nWB2yk8' }), img('c')]
    expect(pickUndescribed(rows, new Set()).map((r) => r.id)).toEqual(['a', 'c'])
  })

  it('never asks about more than the per-view cap, so a 48-card page is not 48 decodes', () => {
    const rows = Array.from({ length: 48 }, (_, i) => img(`r${i}`))
    expect(DESCRIBE_ON_VIEW_LIMIT).toBe(6)
    expect(pickUndescribed(rows, new Set())).toHaveLength(DESCRIBE_ON_VIEW_LIMIT)
  })

  it('skips a row this mount already asked about, success or not, so a failed decode never loops', () => {
    const rows = [img('a'), img('b')]
    expect(pickUndescribed(rows, new Set(['a'])).map((r) => r.id)).toEqual(['b'])
  })

  it('skips a row whose blurhash the reader did not carry, rather than guessing', () => {
    expect(pickUndescribed([img('a', { blurhash: undefined })], new Set())).toEqual([])
  })

  it('skips non-images, rows with no url, and vectors (by mime or by extension)', () => {
    const rows = [
      img('el', { kind: 'element' }),
      img('vid', { kind: 'video' }),
      img('nourl', { url: null }),
      img('svgmime', { mime: 'image/svg+xml' }),
      img('svgext', { url: 'https://x.supabase.co/storage/v1/object/public/library/logo.svg?v=2' }),
      img('ok'),
    ]
    expect(pickUndescribed(rows, new Set()).map((r) => r.id)).toEqual(['ok'])
  })
})

// ── Wiring guard (unwiring this is SILENT: a flat placeholder nobody reports) ─────────────────────
describe('both Loom grids describe on view through the one generated-asset path', () => {
  const grid = readFileSync('app/(main)/admin/library/loom-grid.tsx', 'utf8')
  const space = readFileSync('components/spaces/loom/space-loom-studio.tsx', 'utf8')
  const store = readFileSync('lib/library/store.ts', 'utf8')

  it('the Loom Studio grid passes its rows, with their blurhash, to the hook', () => {
    expect(grid).toContain("from '@/lib/library/describe-on-view'")
    expect(grid).toContain('blurhash: a.blurhash')
    expect(grid).toMatch(/useDescribeOnView\([\s\S]*?describeGeneratedAsset,?\s*\)/)
  })

  it('the Space Loom Studio does the same over its own list, where importer seeds land', () => {
    expect(space).toContain("from '@/lib/library/describe-on-view'")
    expect(space).toContain('useDescribeOnView(assets, describeGeneratedAsset)')
  })

  it('the picker reader carries blurhash, so the Space Loom Studio can tell a hole from a described row', () => {
    expect(store).toMatch(/\.select\('id, title, url, alt, kind, tags, config, category, is_protected, expires_at, blurhash'\)/)
  })
})
