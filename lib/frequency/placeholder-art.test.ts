import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FQ_PLACEHOLDER_PHOTOS, fqPlaceholderArt } from './placeholder-art'

describe('fqPlaceholderArt', () => {
  it('is stable for the same key', () => {
    expect(fqPlaceholderArt('sunrise-sit')).toBe(fqPlaceholderArt('sunrise-sit'))
  })

  it('only hands back installed brand photos', () => {
    for (const url of FQ_PLACEHOLDER_PHOTOS) expect(existsSync(join(process.cwd(), 'public', url))).toBe(true)
    for (const key of ['a', 'beach-cleanup', 'cold-plunge-club', '00000000-0000-0000-0000-000000000000']) {
      expect(FQ_PLACEHOLDER_PHOTOS).toContain(fqPlaceholderArt(key))
    }
  })

  it('spreads neighbouring slugs across the set', () => {
    const keys = Array.from({ length: 40 }, (_, i) => `starter-${i}`)
    expect(new Set(keys.map(fqPlaceholderArt)).size).toBeGreaterThan(8)
  })
})
