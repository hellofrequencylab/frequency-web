import { existsSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MEGA_THEMES } from '@/lib/theme/mega-theme'
import { THEME_ASSET_SLOTS, THEME_LIBRARY, themeAssetPath, themeIdFromSlug, themePagePath } from './library'
import { THEME_ASSETS_READY } from './library-assets'

describe('theme library', () => {
  it('has one entry per Mega Theme that is offered, in the same order (the earlier network theme is not)', () => {
    expect(THEME_LIBRARY.map((t) => t.id)).toEqual(MEGA_THEMES.map((t) => t.id).filter((id) => id !== 'network'))
  })
  it('keeps every tagline to 70 characters and every surface listed once', () => {
    for (const t of THEME_LIBRARY) {
      expect(t.tagline.length).toBeLessThanOrEqual(70)
      expect(t.surfaces.map((s) => s.id)).toEqual(['spotlight', 'website', 'email', 'space'])
    }
  })
  it('never promises a website theme on the Space page beyond fonts and accent', () => {
    for (const t of THEME_LIBRARY) expect(t.surfaces.find((s) => s.id === 'space')!.carries).toMatch(/fonts, your accent/)
  })
  it('gives every theme one address, and the two renamed ones their own (Nocturne and Network)', () => {
    const paths = THEME_LIBRARY.map((t) => themePagePath(t.id))
    expect(new Set(paths).size).toBe(paths.length)
    expect(themePagePath('midnight')).toBe('/themes/nocturne')
    expect(themePagePath('network-kit')).toBe('/themes/network')
    for (const t of THEME_LIBRARY) expect(t.id === 'midnight' ? null : themeIdFromSlug(themePagePath(t.id).slice('/themes/'.length)), t.id).toBe(t.id === 'midnight' ? null : t.id)
  })
  it('lists a picture exactly when its file exists', () => {
    for (const t of THEME_LIBRARY) {
      for (const s of THEME_ASSET_SLOTS) {
        const key = `${t.id}/${s.slot}`
        expect(THEME_ASSETS_READY.has(key), key).toBe(existsSync(`public${themeAssetPath(t.id, s.slot)}`))
      }
    }
    if (existsSync('public/themes')) expect(readdirSync('public/themes').filter((d) => !THEME_LIBRARY.some((t) => t.id === d))).toEqual([])
  })
})
