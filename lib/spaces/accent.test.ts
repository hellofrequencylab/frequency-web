import { describe, it, expect } from 'vitest'
import { accentVars, resolveAccentVars, isValidAccent, SUPPORTED_ACCENT_TOKENS } from './accent'
import { TOKEN_ALLOWLIST } from '@/lib/theme/validate'

// PER-SPACE ACCENT SCOPING contract (ENTITY-SPACES-BUILD §A, D4). A TOKEN accent must emit only
// `var(<allowlisted-token>)` strings and remap the full `--color-primary*` family; a HEX accent
// (ADR-516 D2) derives that family from the one hex (color-mix shades + a luminance-picked text).

describe('accentVars', () => {
  it('returns null for an unset / unknown / non-allowlisted token (keep the host accent)', () => {
    expect(accentVars(null)).toBeNull()
    expect(accentVars(undefined)).toBeNull()
    expect(accentVars('')).toBeNull()
    expect(accentVars('--color-canvas')).toBeNull() // allowlisted but not an accent family
    expect(accentVars('--not-a-token')).toBeNull()
    expect(accentVars('red; } body {')).toBeNull() // an injection attempt is dropped
  })

  it('remaps the full --color-primary* family for a complete accent family (broadcast)', () => {
    const vars = accentVars('--color-broadcast')
    expect(vars).not.toBeNull()
    expect(vars).toEqual({
      '--color-primary': 'var(--color-broadcast)',
      '--color-primary-hover': 'var(--color-broadcast-strong)',
      '--color-primary-strong': 'var(--color-broadcast-strong)',
      '--color-primary-bg': 'var(--color-broadcast-bg)',
      '--color-text-on-primary': 'var(--color-text-on-broadcast)',
    })
  })

  it('falls back safely for a base-only family (info: no -hover/-strong/text-on)', () => {
    const vars = accentVars('--color-info')!
    expect(vars['--color-primary']).toBe('var(--color-info)')
    expect(vars['--color-primary-bg']).toBe('var(--color-info-bg)')
    // No darker shade → fall back to the base; no text-on → keep the default readable text token.
    expect(vars['--color-primary-strong']).toBe('var(--color-info)')
    expect(vars['--color-primary-hover']).toBe('var(--color-info)')
    expect(vars['--color-text-on-primary']).toBe('var(--color-text-on-primary)')
  })

  it('emits ONLY var() references to allowlisted tokens — never a hex / raw color (D6)', () => {
    for (const token of SUPPORTED_ACCENT_TOKENS) {
      const vars = accentVars(token)!
      for (const value of Object.values(vars)) {
        const m = /^var\((--[a-z0-9-]+)\)$/.exec(value)
        expect(m, `${value} must be a var() reference`).not.toBeNull()
        expect(TOKEN_ALLOWLIST.has(m![1]!), `${m![1]} must be allowlisted`).toBe(true)
        expect(value).not.toMatch(/#/) // no hex ever
      }
    }
  })

  it('every supported accent token is itself in the theme allowlist', () => {
    for (const token of SUPPORTED_ACCENT_TOKENS) {
      expect(TOKEN_ALLOWLIST.has(token)).toBe(true)
    }
  })
})

describe('accentVars — hex accent (ADR-516 D2, the owner brand color picker)', () => {
  it('derives the full --color-primary* family from a 6-digit hex', () => {
    const vars = accentVars('#E2912F')!
    expect(vars['--color-primary']).toBe('#E2912F')
    expect(vars['--color-primary-hover']).toBe('color-mix(in srgb, #E2912F 88%, black)')
    expect(vars['--color-primary-strong']).toBe('color-mix(in srgb, #E2912F 72%, black)')
    // The -bg is a translucent tint, so it sits legibly on any surface (light or dark).
    expect(vars['--color-primary-bg']).toBe('color-mix(in srgb, #E2912F 14%, transparent)')
    // Amber is a light accent → dark ink reads on it (WCAG crossover).
    expect(vars['--color-text-on-primary']).toBe('#141414')
  })

  it('picks white text on a dark accent and dark ink on a light one', () => {
    expect(accentVars('#0A0A0A')!['--color-text-on-primary']).toBe('#ffffff')
    expect(accentVars('#F5F5F5')!['--color-text-on-primary']).toBe('#141414')
  })

  it('rejects a malformed hex (keeps the host accent)', () => {
    expect(accentVars('#12')).toBeNull() // too short
    expect(accentVars('#GGGGGG')).toBeNull() // non-hex digits
    expect(accentVars('E2912F')).toBeNull() // no leading #
    expect(accentVars('#E2912F; }')).toBeNull() // an injection attempt is dropped
  })
})

describe('isValidAccent — the shared write-gate rule', () => {
  it('accepts an allowlisted token (any member) and a 6-digit hex', () => {
    expect(isValidAccent('--color-primary')).toBe(true)
    expect(isValidAccent('--color-canvas')).toBe(true) // allowlisted, even if not an accent FAMILY
    expect(isValidAccent('#E2912F')).toBe(true)
    expect(isValidAccent('#abcdef')).toBe(true)
  })

  it('rejects a non-allowlisted token, a malformed hex, or a bare color name', () => {
    expect(isValidAccent('--not-a-token')).toBe(false)
    expect(isValidAccent('#12')).toBe(false)
    expect(isValidAccent('periwinkle')).toBe(false)
    expect(isValidAccent('#E2912F; } body {')).toBe(false)
  })
})

describe('resolveAccentVars', () => {
  it('prefers the Space brand_accent over the role default', () => {
    expect(resolveAccentVars('--color-signal', '--color-primary')).toEqual(accentVars('--color-signal'))
  })

  it('falls back to the role default when the Space has no (or an unsupported) accent', () => {
    expect(resolveAccentVars(null, '--color-info')).toEqual(accentVars('--color-info'))
    expect(resolveAccentVars('--color-canvas', '--color-info')).toEqual(accentVars('--color-info'))
  })

  it('returns null when neither is supported (the host amber stands)', () => {
    expect(resolveAccentVars(null, null)).toBeNull()
    expect(resolveAccentVars('--color-canvas', '--color-text')).toBeNull()
  })
})
