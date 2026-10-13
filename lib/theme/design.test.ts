import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DESIGN, DESIGNS, isDesignId, resolveDesign } from './design'

// THE DESIGN SWITCH CONTRACT (ADR-1737). A design other than DAWN is one CSS file that redefines
// DAWN's own token names under `[data-design="<id>"]`. These assertions hold the three ways that can
// drift: a registered design with no sheet, a sheet the root layout never loads, and a sheet that
// declares a name DAWN does not have (a typo, or a token nothing reads).

const globals = readFileSync('app/globals.css', 'utf8')
const layout = readFileSync('app/layout.tsx', 'utf8')

/** Every custom property DAWN declares anywhere in globals.css. */
const dawnNames = new Set([...globals.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]))

describe('the design registry', () => {
  it('reads an unset or unknown switch as DAWN, so a missing variable never ships a half-built system', () => {
    expect(DEFAULT_DESIGN).toBe('dawn')
    expect(resolveDesign(undefined)).toBe('dawn')
    expect(resolveDesign('')).toBe('dawn')
    expect(resolveDesign('midnight')).toBe('dawn')
    expect(resolveDesign('frequency')).toBe('frequency')
    expect(isDesignId('dawn')).toBe(true)
  })

  it('gives every design browser-chrome colours as hex', () => {
    for (const d of DESIGNS) {
      expect(d.chrome.light).toMatch(/^#[0-9a-f]{6}$/i)
      expect(d.chrome.dark).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe.each(DESIGNS.filter((d) => d.id !== 'dawn'))('the $id sheet', ({ id }) => {
  const path = `app/themes/${id}.css`

  it('exists and is loaded by the root layout', () => {
    expect(existsSync(path)).toBe(true)
    expect(layout).toContain(`import "./themes/${id}.css"`)
  })

  const sheet = existsSync(path) ? readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') : ''

  it('scopes every rule to its own data-design attribute', () => {
    const selectors = [...sheet.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter(Boolean)
    for (const sel of selectors) expect(sel, sel).toContain(`[data-design="${id}"]`)
  })

  it('redefines only names DAWN defines', () => {
    const declared = [...sheet.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1])
    const unknown = declared.filter((n) => !dawnNames.has(n))
    expect(unknown, `not a DAWN token: ${unknown.join(', ')}`).toEqual([])
  })
})
