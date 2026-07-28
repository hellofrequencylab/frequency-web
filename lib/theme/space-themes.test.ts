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

// ═══ Block CONTENTS: the per-theme knob contract (ADR-893, extending ADR-578) ═══════════════
// Existence alone let "Playful renders as Bold" ship: a block can exist yet set only the font
// families, leaving Anton's caps treatment (weight/case/tracking/leading) on every face. These
// describes read the block BODIES and pin the full knob set — the font vars matching the typed
// registry, the per-theme `.font-display` treatment rule, the `--font-heading` / `.font-eyebrow`
// role hooks, and the shape tokens. Just as hard, they pin `bold`'s ABSENCE (the negative-
// assertion pattern from skins.test.ts): `bold` is the byte-identical no-op default, so a future
// edit that gives it a treatment rule, a heading var, or a radius fails HERE, not in production.

const globalsCss = readFileSync(
  fileURLToPath(new URL('../../app/globals.css', import.meta.url)),
  'utf8',
)
const layoutTsx = readFileSync(
  fileURLToPath(new URL('../../app/layout.tsx', import.meta.url)),
  'utf8',
)

/** The `[data-space-theme="<id>"] { … }` VAR block body. The treatment rules
 *  (`[data-space-theme="<id>"] .font-display { … }`) never match this regex — a descendant
 *  selector puts ` .font-…` between the attribute and the `{` — so the first (only) match is
 *  the var block. */
function themeBlock(id: string): string {
  const m = globalsCss.match(new RegExp(`\\[data-space-theme="${id}"\\]\\s*\\{([^}]*)\\}`))
  return m ? m[1] : ''
}

/** The `[data-space-theme="<id>"] .font-<role> { … }` treatment-rule body, or '' when the
 *  theme authors none (bold, deliberately). */
function roleRule(id: string, role: 'display' | 'section' | 'eyebrow'): string {
  const m = globalsCss.match(
    new RegExp(`\\[data-space-theme="${id}"\\]\\s+\\.font-${role}\\s*\\{([^}]*)\\}`),
  )
  return m ? m[1] : ''
}

// Registry face name → the `--font-*` var its next/font registration exposes (app/layout.tsx).
// Test-local on purpose: the registry stores human names for the picker, the CSS stores vars,
// and this map is the bridge that lets the test prove they agree. The totality `it()` below
// forces a new face to extend the map, so the bridge can never silently skip a face.
const FACE_VAR: Record<string, string> = {
  Anton: '--font-anton',
  Fraunces: '--font-fraunces',
  'Playfair Display': '--font-playfair',
  'PT Serif': '--font-pt-serif',
  Fredoka: '--font-fredoka',
  Lexend: '--font-lexend',
  'Atkinson Hyperlegible': '--font-atkinson',
  Nunito: '--font-nunito',
}

describe('space-theme block contents (fonts match the registry)', () => {
  it('every registry face has a FACE_VAR entry (map totality — a new face must extend the map)', () => {
    for (const t of SPACE_THEMES) {
      expect(FACE_VAR[t.displayFont], `displayFont "${t.displayFont}" (${t.id})`).toBeTruthy()
      expect(FACE_VAR[t.bodyFont], `bodyFont "${t.bodyFont}" (${t.id})`).toBeTruthy()
    }
  })

  for (const t of SPACE_THEMES) {
    it(`"${t.id}" sets --font-display and --font-body to the registry's faces`, () => {
      const block = themeBlock(t.id)
      expect(block).toMatch(new RegExp(`--font-display:\\s*var\\(${FACE_VAR[t.displayFont]}\\)`))
      expect(block).toMatch(new RegExp(`--font-body:\\s*var\\(${FACE_VAR[t.bodyFont]}\\)`))
    })
  }
})

describe('space-theme knob totality (every non-bold theme is a full treatment, not a family swap)', () => {
  const styled = SPACE_THEMES.filter((t) => t.id !== DEFAULT_SPACE_THEME)

  it('covers the five styled themes (a seventh theme automatically joins this contract)', () => {
    expect(styled.length).toBe(SPACE_THEMES.length - 1)
  })

  for (const t of styled) {
    describe(`theme: ${t.id}`, () => {
      it('has a .font-display treatment rule tuning weight, tracking, and leading', () => {
        const rule = roleRule(t.id, 'display')
        expect(rule, `[data-space-theme="${t.id}"] .font-display rule missing`).not.toBe('')
        expect(rule).toMatch(/font-weight:/)
        expect(rule).toMatch(/letter-spacing:/)
        expect(rule).toMatch(/line-height:/)
      })

      it('sets --font-heading (the .font-section hook for the cover title + section headers)', () => {
        expect(themeBlock(t.id)).toMatch(/--font-heading:\s*var\(--font-/)
      })

      it('has a .font-eyebrow treatment rule (the kicker joins the theme)', () => {
        expect(roleRule(t.id, 'eyebrow')).not.toBe('')
      })

      it('sets all three shape tokens (--radius-card / --radius-control / --radius-cover)', () => {
        const block = themeBlock(t.id)
        expect(block).toMatch(/--radius-card:/)
        expect(block).toMatch(/--radius-control:/)
        expect(block).toMatch(/--radius-cover:/)
      })
    })
  }
})

describe('bold byte-identity pins (the default authors NOTHING beyond its font anchor)', () => {
  it('bold\'s block sets no radius and no --font-heading', () => {
    const block = themeBlock(DEFAULT_SPACE_THEME)
    expect(block).not.toBe('')
    expect(block).not.toMatch(/--radius-/)
    expect(block).not.toMatch(/--font-heading/)
  })

  it('no bold-scoped treatment rule exists for any text role', () => {
    // Anything matching `[data-space-theme="bold"] .font-…` would restyle the default look.
    expect(globalsCss).not.toMatch(/\[data-space-theme="bold"\]\s+\.font-(display|section|eyebrow)/)
  })

  it('the shared [data-space-theme] rule applies the body face and pins the radius baseline', () => {
    // The pin is what keeps a bold Space at today's literals under every skin + generation
    // (those axes retune --radius-card/--radius-control on app-shell ancestors).
    const m = globalsCss.match(/\[data-space-theme\]\s*\{([^}]*)\}/)
    expect(m, 'shared [data-space-theme] { … } rule missing').toBeTruthy()
    const shared = m ? m[1] : ''
    expect(shared).toMatch(/font-family:\s*var\(--font-body/)
    expect(shared).toMatch(/--radius-card:\s*1rem/)
    expect(shared).toMatch(/--radius-control:\s*0\.5rem/)
  })
})

describe('font registrations back the theme CSS (app/layout.tsx)', () => {
  // Scope the var scan to the space-theme section so we assert exactly what the AXIS references,
  // not every font var in the file. The two markers are the section's banner comment and the
  // block that follows it; if either moves, the assertions below fail loudly instead of
  // silently scanning nothing.
  const start = globalsCss.indexOf('SPACE PAGE THEME axis')
  const end = globalsCss.indexOf('Tailwind wiring')
  const themeSection = start >= 0 && end > start ? globalsCss.slice(start, end) : ''
  // The axis's own indirection vars are defined by the blocks themselves, not by next/font.
  const AXIS_VARS = new Set(['--font-display', '--font-body', '--font-heading'])

  it('locates the space-theme section of globals.css', () => {
    expect(themeSection).not.toBe('')
  })

  it('every --font-* var the theme blocks reference is registered on <html>', () => {
    const referenced = new Set(
      [...themeSection.matchAll(/var\((--font-[a-z-]+)/g)]
        .map((m) => m[1])
        .filter((v) => !AXIS_VARS.has(v)),
    )
    expect(referenced.size).toBeGreaterThan(0)
    for (const v of referenced) {
      expect(layoutTsx, `${v} referenced by a theme block but not registered in app/layout.tsx`)
        .toContain(`variable: "${v}"`)
    }
  })

  it('Fraunces loads its opsz + SOFT axes (editorial\'s light treatment depends on them)', () => {
    // next/font ships only `wght` by default; without these axes the CSS's
    // `font-variation-settings: 'SOFT' 40` and optical sizing silently do nothing.
    expect(layoutTsx).toMatch(/Fraunces\(\{[^}]*axes:\s*\[\s*["']opsz["']\s*,\s*["']SOFT["']\s*\]/)
  })
})
