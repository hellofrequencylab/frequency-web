import { describe, expect, it } from 'vitest'
import { HOUSE_CSS } from './house-css'
import { MENSWORK_CSS } from './menswork-css'
import { MENSWORK_TOKENS_CSS } from '@/lib/theme/menswork'

// The Menswork website skin has to dress EVERY house section (owner ask 2026-10-07: "completely style every
// element of the website"). A new house class the skin never restyles would render in the house look on a
// Menswork site, so this fails until the skin answers it.

const classes = (css: string) => new Set(css.match(/\.hs-[a-z0-9-]+/g))

/** House classes that only lay content out (grid, flex, spacing) and read the same in either look. */
const LAYOUT_ONLY = new Set([
  '.hs-stack',
  '.hs-header-actions',
  '.hs-menu',
  '.hs-hero-actions',
  '.hs-start-who',
  '.hs-steps',
  '.hs-photo-tall',
  '.hs-stats',
  '.hs-stats-grid',
])

const skin = MENSWORK_CSS.slice(MENSWORK_TOKENS_CSS.length)

describe('the Menswork website skin', () => {
  it('restyles every house class that carries a look', () => {
    const own = classes(MENSWORK_CSS)
    const missing = [...classes(HOUSE_CSS)].filter((c) => !own.has(c) && !LAYOUT_ONLY.has(c))
    expect(missing).toEqual([])
  })

  it('scopes every rule under the Menswork root, so no other website changes', () => {
    const selectors = skin
      .replace(/\{[^}]*\}/g, '\n')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const sel of selectors) expect(sel, sel).toContain('[data-house-theme="menswork"]')
  })

  it('reads tokens only: no raw color, no shadow, no blur, no smooth gradient', () => {
    expect(skin).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(skin).not.toMatch(/rgba?\(/)
    expect(skin).not.toMatch(/box-shadow:(?!none)/)
    expect(skin).not.toMatch(/backdrop-filter:(?!none)/)
    expect(skin).not.toMatch(/(?<!repeating-)linear-gradient|radial-gradient/)
  })

  it('never rounds a button, card or frame', () => {
    expect(skin).not.toMatch(/border-radius:(?!0[;}]|2px|50%)/)
    expect(skin).toMatch(/\.hs-btn\{[^}]*border-radius:0/)
  })
})
