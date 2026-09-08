import { describe, it, expect } from 'vitest'
import { SPOTLIGHT_STICKERS, spotlightStickerById } from './stickers'

// The closed sticker allowlist (ADR-1275). What these lock: ids are stable, unique, and safe as a
// stored token; every entry carries a glyph and a label; nothing is gated yet (the `requiredItem`
// seam is present and unused, so a cosmetics inventory can gate later without a shape change).

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

  it('is entirely free today: the requiredItem seam exists on the type and no row sets it', () => {
    for (const s of SPOTLIGHT_STICKERS) expect(s.requiredItem).toBeUndefined()
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
