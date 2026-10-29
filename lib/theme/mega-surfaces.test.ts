import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/spaces/accent'
import { MEGA_SURFACES } from './mega-surfaces'
import { MEGA_THEMES } from './mega-theme'
import { pageSurface } from './surface'
import { THEME_PRESETS, validateSpotlightTheme } from '@/lib/spotlight/theme'

// LIVE-1521: Spotlight wears every Mega Theme (email follows once its pin is rewritten); the Space page and event page still take Midnight's ground only.
describe('mega theme surfaces', () => {
  it('gives every theme but the default a flat token set, and keeps the default on the house palette', () => {
    for (const { id } of MEGA_THEMES) expect(MEGA_SURFACES[id] !== undefined, id).toBe(id !== 'frequency')
  })

  it('reads on its own ground: text, muted text and the accent label clear AA', () => {
    for (const [id, s] of Object.entries(MEGA_SURFACES)) {
      expect(contrastRatio(s!.text, s!.canvas), `${id} text`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(s!.muted, s!.canvas), `${id} muted`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(s!.accent.on, s!.accent.accent), `${id} accent label`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(s!.onSolid, s!.solid), `${id} solid label`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('gives each theme a Spotlight preset that survives validation and matches its ground', () => {
    for (const { id } of MEGA_THEMES.filter((t) => t.id !== 'network' && t.id !== 'temple')) {
      const preset = THEME_PRESETS.find((p) => p.id === id)
      expect(preset, id).toBeDefined()
      if (id !== 'midnight') expect(validateSpotlightTheme(preset!.theme)).toEqual(preset!.theme)
      const s = MEGA_SURFACES[id]
      if (s) expect(preset!.theme.bg).toMatchObject({ kind: 'solid', color: s.canvas.toLowerCase() })
    }
  })

  it('never lends a ground to the Space page: only Midnight keeps one (ADR-578)', () => {
    for (const { id } of MEGA_THEMES) expect(pageSurface({ megaTheme: { theme: id } }) !== null, id).toBe(id === 'midnight')
  })
})
