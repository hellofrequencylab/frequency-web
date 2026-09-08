import { describe, it, expect } from 'vitest'
import { SPOTLIGHT_STICKERS, spotlightStickerById } from './stickers'

// The closed sticker allowlist (ADR-1275). What these lock: ids are stable, unique, and safe as a
// stored token; every entry carries a glyph and a label; the `requiredItem` seam is set only on the
// earned rows (ADR-1279), and lib/spotlight/cosmetics.test.ts proves each names a seeded store item.

describe('SPOTLIGHT_STICKERS', () => {
  it('has unique, stable, token-safe ids', () => {
    const ids = SPOTLIGHT_STICKERS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_-]{0,30}$/)
  })

  it('every sticker carries a glyph and a sentence-case label', () => {
    for (const s of SPOTLIGHT_STICKERS) {
      expect(s.glyph.length).toBeGreaterThan(0)
      expect(s.label).toMatch(/^[A-Z][a-z ]*$/)
    }
  })

  it('is free by default, with the earned rows naming a store item slug', () => {
    const earned = SPOTLIGHT_STICKERS.filter((s) => s.requiredItem !== undefined)
    expect(earned.length).toBeGreaterThan(0)
    expect(earned.length).toBeLessThan(SPOTLIGHT_STICKERS.length)
    for (const s of earned) expect(s.requiredItem).toMatch(/^[a-z][a-z0-9-]+$/)
    expect(spotlightStickerById('spectrum')?.requiredItem).toBe('full-spectrum-banner')
  })
})

describe('spotlightStickerById', () => {
  it('resolves an allowlisted id and nothing else', () => {
    expect(spotlightStickerById('star')?.glyph).toBe('⭐')
    expect(spotlightStickerById('STAR')).toBeNull()
    expect(spotlightStickerById('not-a-sticker')).toBeNull()
    expect(spotlightStickerById('')).toBeNull()
  })

  it('never throws on a non-string id', () => {
    for (const junk of [null, undefined, 42, {}, [], true]) {
      expect(spotlightStickerById(junk)).toBeNull()
    }
  })
})
