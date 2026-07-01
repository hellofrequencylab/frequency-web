import { describe, it, expect } from 'vitest'
import {
  composeBadge,
  BADGE_TEMPLATES,
  BADGE_GLYPHS,
  BADGE_PALETTES,
  DEFAULT_BADGE_SPEC,
  type BadgeSpec,
} from './badge-composer'

describe('composeBadge', () => {
  it('produces a well-formed standalone SVG for the default spec', () => {
    const svg = composeBadge(DEFAULT_BADGE_SPEC)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('viewBox="0 0 400 440"')
  })

  it('renders every template × glyph combination without throwing or emitting empties', () => {
    for (const t of BADGE_TEMPLATES) {
      for (const g of BADGE_GLYPHS) {
        const svg = composeBadge({ ...DEFAULT_BADGE_SPEC, template: t.id, glyph: g.id })
        expect(svg.length).toBeGreaterThan(200)
        expect(svg).not.toContain('undefined')
        expect(svg).not.toContain('NaN')
      }
    }
  })

  it('uses the selected palette colors', () => {
    const sage = BADGE_PALETTES.find((p) => p.id === 'sage')!
    const svg = composeBadge({ ...DEFAULT_BADGE_SPEC, palette: 'sage' })
    expect(svg).toContain(sage.ring)
    expect(svg).toContain(sage.face)
  })

  it('embeds the labels, uppercased, and escapes angle brackets', () => {
    const svg = composeBadge({ ...DEFAULT_BADGE_SPEC, title: '100 days', subtitle: 'meditation' })
    expect(svg).toContain('100 DAYS')
    expect(svg).toContain('MEDITATION')
    const nasty: BadgeSpec = { ...DEFAULT_BADGE_SPEC, title: '<script>', subtitle: '' }
    const out = composeBadge(nasty)
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;SCRIPT&gt;')
  })

  it('omits a text node when a label is blank', () => {
    const svg = composeBadge({ ...DEFAULT_BADGE_SPEC, title: 'SOLO', subtitle: '' })
    // exactly one <text> (the title), none for the empty subtitle
    expect(svg.match(/<text/g)?.length).toBe(1)
  })
})
