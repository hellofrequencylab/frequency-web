import { describe, it, expect } from 'vitest'
import { accentVars, resolveAccentVars, SUPPORTED_ACCENT_TOKENS } from './accent'
import { TOKEN_ALLOWLIST } from '@/lib/theme/validate'

// PER-SPACE ACCENT SCOPING contract (ENTITY-SPACES-BUILD §A, D4/D6). The override must only ever
// emit `var(<allowlisted-token>)` strings — never a hex literal — and must remap the full
// `--color-primary*` family so the CTA, active tab, and type badge all carry the accent.

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
