import { describe, it, expect } from 'vitest'
import { themeToCss } from './css'

const empty = { light: {}, dark: {}, feel: {} }

describe('themeToCss', () => {
  it('emits scoped, higher-specificity rules selected by the slug', () => {
    const css = themeToCss('midnight', {
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

  it('orders feel before light within the base rule', () => {
    const css = themeToCss('x', {
      light: { '--color-canvas': '#fff' },
      dark: {},
      feel: { '--radius-card': '1rem' },
    })
    expect(css.indexOf('--radius-card')).toBeLessThan(css.indexOf('--color-canvas'))
  })

  it('omits an empty rule (no dark block → no .dark rule)', () => {
    const css = themeToCss('x', { light: { '--color-canvas': '#fff' }, dark: {}, feel: {} })
    expect(css).toContain('html[data-skin="x"]{')
    expect(css).not.toContain('html.dark[data-skin="x"]')
  })

  it('returns "" for an unsafe slug', () => {
    expect(themeToCss('a"]{}', { light: { '--color-canvas': '#fff' }, dark: {}, feel: {} })).toBe('')
    expect(themeToCss('Has Space', { light: { '--color-canvas': '#fff' }, dark: {}, feel: {} })).toBe('')
    expect(themeToCss('', { light: { '--color-canvas': '#fff' }, dark: {}, feel: {} })).toBe('')
  })

  it('returns "" when there are no tokens to emit', () => {
    expect(themeToCss('default', empty)).toBe('')
  })

  it('skips empty values', () => {
    const css = themeToCss('x', { light: { '--color-canvas': '' }, dark: {}, feel: {} })
    expect(css).toBe('')
  })
})
