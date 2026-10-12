import { describe, expect, it } from 'vitest'
import { ALCHEMICAL, MARKS, MOON_PHASES, TEXT_PRESENTATION, WILDHEART_GLYPHS, ZODIAC, moonPhasePath } from './wildheart-symbols'

const EMOJI_PRESENTATION = '️'

describe('the Wildheart symbol library never shows an emoji', () => {
  const all = Object.entries(WILDHEART_GLYPHS)

  it('has the twelve signs, the elements with Sun and Moon, and the three marks', () => {
    expect(ZODIAC).toHaveLength(12)
    expect(ALCHEMICAL.map((a) => a.id)).toEqual(['fire', 'water', 'air', 'earth', 'quintessence', 'sun', 'moon'])
    expect(MARKS.map((m) => m.id)).toEqual(['star', 'spark', 'triplemoon'])
    expect(all).toHaveLength(22)
  })

  it('carries no emoji-presentation selector and no emoji-presentation codepoint without a text selector', () => {
    for (const [id, glyph] of all) {
      expect(glyph, id).not.toContain(EMOJI_PRESENTATION)
      const chars = [...glyph]
      chars.forEach((ch, i) => {
        if (/\p{Emoji_Presentation}/u.test(ch)) expect(chars[i + 1], `${id}: ${ch} needs U+FE0E`).toBe(TEXT_PRESENTATION)
      })
      expect(glyph.endsWith(TEXT_PRESENTATION), `${id} ends with U+FE0E`).toBe(true)
      // No pictographic emoji block at all (the alchemical block U+1F700 is not one).
      expect(glyph, id).not.toMatch(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1FAFF}]/u)
    }
  })

  it('pairs every sign with its house numeral, in tropical order', () => {
    expect(ZODIAC.map((z) => z.house)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'])
    expect(ZODIAC[0].id).toBe('aries')
    expect(ZODIAC[9].id).toBe('capricorn')
  })
})

describe('moonPhasePath', () => {
  it('draws nothing for a new moon and a full disc for a full moon', () => {
    expect(moonPhasePath(0, 10)).toBe('')
    expect(moonPhasePath(4, 10)).toMatch(/^M10,0A10,10 0 1 1 10,20A10,10 0 1 1 10,0Z$/)
    expect(MOON_PHASES[4]).toBe('Full moon')
  })

  it('lights the right limb while waxing and the left while waning, with the terminator bowing to the dark', () => {
    // Waxing crescent: right limb (sweep 1), terminator out past it (sweep 0).
    expect(moonPhasePath(1, 10)).toMatch(/^M10,0A10,10 0 0 1 10,20A7\.071,10 0 0 0 10,0Z$/)
    // Waxing gibbous: terminator into the left (sweep 1).
    expect(moonPhasePath(3, 10)).toMatch(/A7\.071,10 0 0 1 10,0Z$/)
    // Last quarter: the left half only.
    expect(moonPhasePath(6, 10)).toBe('M10,0A10,10 0 0 0 10,20Z')
    // Balsamic: left limb, terminator into the left (sweep 1).
    expect(moonPhasePath(7, 10)).toMatch(/^M10,0A10,10 0 0 0 10,20A7\.071,10 0 0 1 10,0Z$/)
  })
})
