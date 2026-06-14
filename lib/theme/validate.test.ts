import { describe, it, expect } from 'vitest'
import { TOKEN_ALLOWLIST, validateThemeTokens, isSafeSlug } from './validate'

describe('TOKEN_ALLOWLIST', () => {
  it('includes the core palette + feel + generation tokens, excludes others', () => {
    expect(TOKEN_ALLOWLIST.has('--color-primary')).toBe(true)
    expect(TOKEN_ALLOWLIST.has('--radius-card')).toBe(true)
    expect(TOKEN_ALLOWLIST.has('--motion-base')).toBe(true)
    expect(TOKEN_ALLOWLIST.has('--density-root')).toBe(true)
    expect(TOKEN_ALLOWLIST.has('--type-scale')).toBe(true)
    expect(TOKEN_ALLOWLIST.has('--ornament')).toBe(true)
    expect(TOKEN_ALLOWLIST.has('--tap-min')).toBe(true)
    // Not a semantic theme token — the rank primitives / brand mark are off-limits.
    expect(TOKEN_ALLOWLIST.has('--rank-jade')).toBe(false)
    expect(TOKEN_ALLOWLIST.has('--brand-mark')).toBe(false)
    expect(TOKEN_ALLOWLIST.has('--font-sans')).toBe(false)
  })
})

describe('validateThemeTokens — allowlist enforcement', () => {
  it('keeps allowlisted names with valid values, drops unknown names', () => {
    const out = validateThemeTokens({
      light: {
        '--color-primary': '#E2912F',
        '--color-canvas': '#FBF8F1',
        '--not-a-token': '#000000', // dropped: not allowlisted
        '--position': 'fixed', // dropped: not allowlisted
      },
      dark: { '--color-primary': '#F2B14E' },
      feel: { '--radius-card': '1rem', '--type-scale': '1.15' },
    })
    expect(out.light).toEqual({ '--color-primary': '#E2912F', '--color-canvas': '#FBF8F1' })
    expect(out.dark).toEqual({ '--color-primary': '#F2B14E' })
    expect(out.feel).toEqual({ '--radius-card': '1rem', '--type-scale': '1.15' })
  })

  it('accepts valid colors: hex (3/6/8), rgb/rgba/hsl/hsla, keywords', () => {
    const out = validateThemeTokens({
      light: {
        '--color-primary': '#abc',
        '--color-canvas': '#aabbcc',
        '--color-surface': '#aabbccdd',
        '--color-border': 'rgb(10, 20, 30)',
        '--color-text': 'rgba(10, 20, 30, 0.5)',
        '--color-info': 'hsl(200, 50%, 40%)',
        '--color-success': 'hsla(200, 50%, 40%, 0.8)',
        '--color-danger': 'transparent',
        '--color-warning': 'currentColor',
      },
    })
    expect(Object.keys(out.light)).toHaveLength(9)
  })

  it('accepts valid lengths/scales for feel tokens', () => {
    const out = validateThemeTokens({
      feel: {
        '--radius-control': '0.5rem',
        '--tap-min': '48px',
        '--density-root': '112.5%',
        '--type-scale': '1.15',
      },
    })
    expect(out.feel['--radius-control']).toBe('0.5rem')
    expect(out.feel['--tap-min']).toBe('48px')
    expect(out.feel['--density-root']).toBe('112.5%')
    expect(out.feel['--type-scale']).toBe('1.15')
  })

  it('accepts ms/s durations for motion tokens, rejects bad ones', () => {
    const out = validateThemeTokens({
      feel: {
        '--motion-base': '260ms',
        '--motion-slow': '0.7s',
        '--motion-fast': '130', // no unit → dropped (durations require ms/s)
      },
    })
    expect(out.feel['--motion-base']).toBe('260ms')
    expect(out.feel['--motion-slow']).toBe('0.7s')
    expect(out.feel['--motion-fast']).toBeUndefined()
  })

  it('strips CSS injection attempts in values', () => {
    const out = validateThemeTokens({
      light: {
        // classic break-out: close the declaration + open a new rule
        '--color-primary': 'red; } body{display:none}',
        // remote fetch
        '--color-canvas': 'url(https://evil.test/x.png)',
        // bare close brace
        '--color-surface': '}',
        // comment open
        '--color-border': 'red /* x',
        // angle brackets (HTML break-out)
        '--color-text': '<script>',
        // IE expression
        '--color-info': 'expression(alert(1))',
        // backslash escape
        '--color-success': '\\31 ',
        // newline
        '--color-danger': 'red\n}',
      },
    })
    expect(out.light).toEqual({})
  })

  it('never throws on garbage input; returns empty blocks', () => {
    expect(validateThemeTokens(null)).toEqual({ light: {}, dark: {}, feel: {} })
    expect(validateThemeTokens(undefined)).toEqual({ light: {}, dark: {}, feel: {} })
    expect(validateThemeTokens('not an object')).toEqual({ light: {}, dark: {}, feel: {} })
    expect(validateThemeTokens(42)).toEqual({ light: {}, dark: {}, feel: {} })
    expect(validateThemeTokens({ light: 'nope', dark: 5 })).toEqual({
      light: {},
      dark: {},
      feel: {},
    })
    // numeric values inside a block are skipped, not thrown on
    expect(
      validateThemeTokens({ light: { '--color-primary': 123 } }).light,
    ).toEqual({})
  })
})

describe('isSafeSlug', () => {
  it('accepts lowercase alphanumerics + hyphens, 1–40 chars', () => {
    expect(isSafeSlug('default')).toBe(true)
    expect(isSafeSlug('midnight')).toBe(true)
    expect(isSafeSlug('summer-2026')).toBe(true)
    expect(isSafeSlug('a')).toBe(true)
  })

  it('rejects uppercase, spaces, quotes, selectors, over-length, empty', () => {
    expect(isSafeSlug('Default')).toBe(false)
    expect(isSafeSlug('has space')).toBe(false)
    expect(isSafeSlug('"]{}')).toBe(false)
    expect(isSafeSlug('a"]body{display:none}')).toBe(false)
    expect(isSafeSlug('under_score')).toBe(false)
    expect(isSafeSlug('')).toBe(false)
    expect(isSafeSlug('x'.repeat(41))).toBe(false)
  })
})
