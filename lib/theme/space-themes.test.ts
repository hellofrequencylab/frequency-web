import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  SPACE_THEMES,
  DEFAULT_SPACE_THEME,
  isSpaceThemeId,
  resolveSpaceTheme,
  parseSpaceTheme,
} from './space-themes'

describe('space-theme registry (ADR-578)', () => {
  it('lists bold (today\'s look) first and registers it as the default', () => {
    expect(SPACE_THEMES[0].id).toBe('bold')
    expect(DEFAULT_SPACE_THEME).toBe('bold')
    expect(SPACE_THEMES.some((t) => t.id === DEFAULT_SPACE_THEME)).toBe(true)
  })

  it('has unique theme ids and a font pairing on every theme', () => {
    const ids = SPACE_THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of SPACE_THEMES) {
      expect(t.displayFont.length).toBeGreaterThan(0)
      expect(t.bodyFont.length).toBeGreaterThan(0)
    }
  })

  it('resolveSpaceTheme / isSpaceThemeId pass known ids through and fall back otherwise', () => {
    for (const t of SPACE_THEMES) {
      expect(isSpaceThemeId(t.id)).toBe(true)
      expect(resolveSpaceTheme(t.id)).toBe(t.id)
    }
    expect(isSpaceThemeId('does-not-exist')).toBe(false)
    expect(resolveSpaceTheme('does-not-exist')).toBe(DEFAULT_SPACE_THEME)
    expect(resolveSpaceTheme(null)).toBe(DEFAULT_SPACE_THEME)
    expect(resolveSpaceTheme(undefined)).toBe(DEFAULT_SPACE_THEME)
  })

  it('parseSpaceTheme reads preferences.theme fail-safe', () => {
    expect(parseSpaceTheme({ theme: 'classic' })).toBe('classic')
    expect(parseSpaceTheme({ theme: 'nope' })).toBe(DEFAULT_SPACE_THEME)
    expect(parseSpaceTheme({})).toBe(DEFAULT_SPACE_THEME)
    expect(parseSpaceTheme(null)).toBe(DEFAULT_SPACE_THEME)
    expect(parseSpaceTheme([])).toBe(DEFAULT_SPACE_THEME)
    expect(parseSpaceTheme({ theme: 42 })).toBe(DEFAULT_SPACE_THEME)
  })
})

// The CSS ⇄ registry CONTRACT (mirrors skins.test.ts). Every theme id MUST have its
// `[data-space-theme="<id>"]` block authored in app/globals.css. A theme added to the registry without
// its CSS (or vice-versa) fails the build, so the two can never quietly drift apart.
describe('space-theme CSS contract (every theme id has its [data-space-theme] block)', () => {
  const globalsCss = readFileSync(
    fileURLToPath(new URL('../../app/globals.css', import.meta.url)),
    'utf8',
  )
  for (const theme of SPACE_THEMES) {
    it(`theme "${theme.id}" has a [data-space-theme] block`, () => {
      const re = new RegExp(`\\[data-space-theme="${theme.id}"\\]\\s*\\{`)
      expect(globalsCss).toMatch(re)
    })
  }
})
