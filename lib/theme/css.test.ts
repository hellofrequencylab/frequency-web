import { describe, it, expect } from 'vitest'
import { themeToCss } from './css'

const empty = { light: {}, dark: {}, feel: {} }

describe('themeToCss', () => {
  it('emits scoped, higher-specificity rules selected by the slug', () => {
    const css = themeToCss('data-skin', 'midnight', {
      light: { '--color-primary': '#E2912F' },
      dark: { '--color-primary': '#F2B14E' },
      feel: { '--radius-card': '1rem' },
    })
    // Base rule carries feel + light, on html[data-skin="…"] (more specific than the
    // code skins' bare [data-skin="…"]).
    expect(css).toContain('html[data-skin="midnight"]{')
    expect(css).toContain('--radius-card:1rem;')
    expect(css).toContain('--color-primary:#E2912F;')
    // Dark rule carries the dark block on html.dark[data-skin="…"].
    expect(css).toContain('html.dark[data-skin="midnight"]{')
    expect(css).toContain('--color-primary:#F2B14E;')
  })

  it('targets data-occasion for an occasion theme (base + .dark)', () => {
    const css = themeToCss('data-occasion', 'solstice', {
      light: { '--color-primary': '#E2912F' },
      dark: { '--color-primary': '#F2B14E' },
      feel: { '--radius-card': '1rem' },
    })
    // An occasion overlay must target the data-occasion attribute, not data-skin.
    expect(css).toContain('html[data-occasion="solstice"]{')
    expect(css).toContain('html.dark[data-occasion="solstice"]{')
    expect(css).not.toContain('data-skin')
    expect(css).toContain('--radius-card:1rem;')
    expect(css).toContain('--color-primary:#E2912F;')
    expect(css).toContain('--color-primary:#F2B14E;')
  })

  it('orders feel before light within the base rule', () => {
    const css = themeToCss('data-skin', 'x', {
      light: { '--color-canvas': '#fff' },
      dark: {},
      feel: { '--radius-card': '1rem' },
    })
    expect(css.indexOf('--radius-card')).toBeLessThan(css.indexOf('--color-canvas'))
  })

  it('omits an empty rule (no dark block → no .dark rule)', () => {
    const css = themeToCss('data-skin', 'x', { light: { '--color-canvas': '#fff' }, dark: {}, feel: {} })
    expect(css).toContain('html[data-skin="x"]{')
    expect(css).not.toContain('html.dark[data-skin="x"]')
  })

  it('returns "" for an unsafe slug', () => {
    expect(themeToCss('data-skin', 'a"]{}', { light: { '--color-canvas': '#fff' }, dark: {}, feel: {} })).toBe('')
    expect(themeToCss('data-skin', 'Has Space', { light: { '--color-canvas': '#fff' }, dark: {}, feel: {} })).toBe('')
    expect(themeToCss('data-skin', '', { light: { '--color-canvas': '#fff' }, dark: {}, feel: {} })).toBe('')
    // An unsafe slug yields '' regardless of the target attribute.
    expect(themeToCss('data-occasion', 'a"]{}', { light: { '--color-canvas': '#fff' }, dark: {}, feel: {} })).toBe('')
  })

  it('returns "" when there are no tokens to emit', () => {
    expect(themeToCss('data-skin', 'default', empty)).toBe('')
  })

  it('skips empty values', () => {
    const css = themeToCss('data-skin', 'x', { light: { '--color-canvas': '' }, dark: {}, feel: {} })
    expect(css).toBe('')
  })
})
