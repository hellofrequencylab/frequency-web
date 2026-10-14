import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DESIGNS, SITE_DESIGN, designDef } from './design'
import { PALETTES, type Palette } from './palette'

// THE OFF-CSS PALETTE CONTRACT (ADR-1737). OG cards, email HTML and the wallet pass cannot read a
// CSS variable, so they read lib/theme/palette.ts. These assertions hold the ways it can drift: a
// design missing a key, a value that is not hex, and DAWN's entry wandering away from the token it
// claims to mirror in app/globals.css.

const globals = readFileSync('app/globals.css', 'utf8')

/** The FIRST `:root { … }` block of globals.css: DAWN's light tokens. */
function firstRootBlock(css: string): Map<string, string> {
  const start = css.search(/^:root\s*\{/m)
  if (start < 0) throw new Error('no :root block in app/globals.css')
  const end = css.indexOf('\n}', start)
  const block = css.slice(start, end)
  const out = new Map<string, string>()
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out.set(m[1], m[2].trim())
  return out
}

/** Palette keys that mirror a CSS token, and the token they mirror. Keys absent here have no token. */
const MIRRORS: Partial<Record<keyof Palette, string>> = {
  canvas: '--color-canvas',
  surface: '--color-surface',
  border: '--color-border',
  text: '--color-text',
  textMuted: '--color-text-muted',
  ink: '--color-ink',
  inkElevated: '--color-ink-elevated',
  onInk: '--color-on-ink',
  primary: '--color-primary',
  primaryBg: '--color-primary-bg',
  onPrimary: '--color-text-on-primary',
  signal: '--color-signal',
  broadcast: '--color-broadcast',
  danger: '--color-danger',
}

const HEX = /^#(?:[0-9a-f]{6}|[0-9a-f]{3})$/i

describe('the off-CSS palette', () => {
  it('has an entry for every registered design', () => {
    for (const d of DESIGNS) expect(PALETTES[d.id], d.id).toBeDefined()
  })

  it('gives every design every key, as hex', () => {
    const keys = Object.keys(PALETTES.dawn).sort()
    for (const d of DESIGNS) {
      const p = PALETTES[d.id]
      expect(Object.keys(p).sort(), d.id).toEqual(keys)
      for (const [k, v] of Object.entries(p)) expect(v, `${d.id}.${k}`).toMatch(HEX)
    }
  })

  it("holds DAWN's entry to the :root token each key mirrors, so the two cannot drift", () => {
    const root = firstRootBlock(globals)
    for (const [key, token] of Object.entries(MIRRORS) as [keyof Palette, string][]) {
      const css = root.get(token)
      expect(css, `${token} missing from the first :root block`).toBeDefined()
      expect(PALETTES.dawn[key].toLowerCase(), `palette.${key} vs ${token}`).toBe(css!.toLowerCase())
    }
  })

  it('names every mirrored token that exists, so a new key is not silently untested', () => {
    // A key outside MIRRORS must be one of the medium-only families (email / og / wallet).
    for (const key of Object.keys(PALETTES.dawn)) {
      if (key in MIRRORS) continue
      expect(key, `palette.${key} mirrors no token; prefix it email/og/wallet or add it to MIRRORS`).toMatch(
        /^(email|og|wallet)[A-Z]/,
      )
    }
  })
})

describe('the PWA manifest', () => {
  // public/manifest.json is a static file the browser fetches before any CSS applies, so
  // scripts/write-design-assets.mjs (prebuild + predev) writes these two values from SITE_DESIGN.
  // The committed copy is DAWN's, and an unset variable reads as DAWN.
  it("carries this build's design's light browser-chrome colour", () => {
    const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8')) as {
      theme_color: string
      background_color: string
    }
    expect(manifest.theme_color).toBe(designDef(SITE_DESIGN).chrome.light)
    expect(manifest.background_color).toBe(designDef(SITE_DESIGN).chrome.light)
  })
})
