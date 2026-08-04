import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SKINS, DEFAULT_SKIN, isSkinId, resolveSkin, SELECTABLE_SKINS } from './skins'

describe('skin registry (ADR-249/250, docs/SPACES.md)', () => {
  it('lists default (DAWN) first and registers it', () => {
    expect(SKINS[0].id).toBe('default')
    expect(SKINS.some((s) => s.id === DEFAULT_SKIN)).toBe(true)
    expect(DEFAULT_SKIN).toBe('default')
  })

  it('has unique skin ids', () => {
    const ids = SKINS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('resolveSkin / isSkinId pass known ids through and fall back otherwise', () => {
    for (const s of SKINS) {
      expect(isSkinId(s.id)).toBe(true)
      expect(resolveSkin(s.id)).toBe(s.id)
    }
    expect(isSkinId('does-not-exist')).toBe(false)
    expect(resolveSkin('does-not-exist')).toBe(DEFAULT_SKIN)
    expect(resolveSkin(null)).toBe(DEFAULT_SKIN)
    expect(resolveSkin(undefined)).toBe(DEFAULT_SKIN)
  })
})

// The CSS ⇄ registry CONTRACT — the guardrail enforced in CI via the test suite. Every
// non-`default` skin id MUST have both its light `[data-skin="<id>"]` block and its dark
// `.dark [data-skin="<id>"]` block authored in app/globals.css. `default` inherits :root /
// .dark and needs no overrides, so it is exempt. A skin added to the registry without its
// CSS (or vice-versa) fails the build, so the two can never quietly drift apart.
describe('skin CSS contract (every skin id has its [data-skin] blocks)', () => {
  const globalsCss = readFileSync(
    fileURLToPath(new URL('../../app/globals.css', import.meta.url)),
    'utf8',
  )

  for (const skin of SKINS) {
    if (skin.id === DEFAULT_SKIN) continue
    describe(`skin: ${skin.id}`, () => {
      it('has a light-mode [data-skin] block', () => {
        // `[data-skin="<id>"] {` but NOT preceded by `.dark ` — the light-mode selector.
        const lightRe = new RegExp(`(?<!\\.dark\\s)\\[data-skin="${skin.id}"\\]\\s*\\{`)
        expect(globalsCss).toMatch(lightRe)
      })

      it('has a dark-mode .dark [data-skin] block', () => {
        const darkRe = new RegExp(`\\.dark\\s+\\[data-skin="${skin.id}"\\]\\s*\\{`)
        expect(globalsCss).toMatch(darkRe)
      })
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Registered is not the same as offered.
//
// Midnight was taken out of members' hands on 2026-08-04 (owner call) WITHOUT being
// deleted, because deleting it would strip CSS the four-render-state e2e matrix depends
// on and orphan any `spaces.skin = 'midnight'` row already stored. These assertions pin
// that separation, so a later cleanup cannot quietly turn "not offered" into "not there".
// ─────────────────────────────────────────────────────────────────────────────
describe('skin selectability is separate from skin existence', () => {
  it('keeps midnight registered and resolvable while not offering it', () => {
    expect(SKINS.some((s) => s.id === 'midnight')).toBe(true)
    expect(resolveSkin('midnight')).toBe('midnight') // a stored value still resolves
    expect(SELECTABLE_SKINS.some((s) => s.id === 'midnight')).toBe(false)
  })

  it('always offers at least one skin, and the default is always offered', () => {
    expect(SELECTABLE_SKINS.length).toBeGreaterThan(0)
    expect(SELECTABLE_SKINS.some((s) => s.id === DEFAULT_SKIN)).toBe(true)
  })

  it('offers only skins that are actually registered', () => {
    for (const s of SELECTABLE_SKINS) expect(SKINS).toContain(s)
  })
})
