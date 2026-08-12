import { describe, it, expect } from 'vitest'
import {
  COVER_SCRIM_DEFAULT,
  COVER_SCRIM_OPTIONS,
  heroOverlayForScrim,
  readCoverScrimSetting,
  writeCoverScrimSetting,
} from './cover-scrim'

// The seam between the word an operator picks ('shade') and the word the renderer takes ('shadow').
// It is one function precisely so a second copy of the mapping cannot appear in a page and drift.

describe('heroOverlayForScrim', () => {
  it('maps every stored overlay onto the PageHero prop', () => {
    expect(heroOverlayForScrim('none')).toBe('none')
    expect(heroOverlayForScrim('shade')).toBe('shadow')
    expect(heroOverlayForScrim('blend')).toBe('fade')
  })

  it('covers every option the picker offers', () => {
    // A fourth option added to the picker without a mapping would be a silently unrendered choice.
    for (const o of COVER_SCRIM_OPTIONS) {
      expect(['none', 'shadow', 'fade']).toContain(heroOverlayForScrim(o.value))
    }
  })
})

describe('reading and writing the overlay on a jsonb bag', () => {
  it('defaults to the legible-on-any-photo treatment', () => {
    // Circles that predate the control, and anything malformed, read as the default.
    expect(readCoverScrimSetting(undefined)).toBe(COVER_SCRIM_DEFAULT)
    expect(readCoverScrimSetting({})).toBe(COVER_SCRIM_DEFAULT)
    expect(readCoverScrimSetting({ coverScrim: 'nonsense' })).toBe(COVER_SCRIM_DEFAULT)
    expect(COVER_SCRIM_DEFAULT).toBe('shade')
  })

  it('round-trips a chosen overlay', () => {
    expect(readCoverScrimSetting(writeCoverScrimSetting({}, 'blend'))).toBe('blend')
  })

  it('never clobbers the rest of the bag', () => {
    // circles.theme also carries coverFocus + heroHeight. A blind write would drop them.
    const theme = { coverFocus: '20% 80%', heroHeight: 'tall' }
    expect(writeCoverScrimSetting(theme, 'none')).toEqual({
      coverFocus: '20% 80%',
      heroHeight: 'tall',
      coverScrim: 'none',
    })
  })
})
