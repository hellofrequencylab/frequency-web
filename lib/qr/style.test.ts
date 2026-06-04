import { describe, it, expect } from 'vitest'
import { parseStyle, isSafeLogoSrc, DEFAULT_STYLE } from './style'
import { renderStyledQrSvg } from './render-styled'

describe('parseStyle', () => {
  it('fills defaults for empty/garbage input', () => {
    expect(parseStyle(null)).toEqual(DEFAULT_STYLE)
    expect(parseStyle('nope')).toEqual(DEFAULT_STYLE)
    expect(parseStyle({})).toEqual(DEFAULT_STYLE)
  })

  it('keeps valid hex colors and rejects bad ones', () => {
    expect(parseStyle({ fg: '#abc' }).fg).toBe('#abc')
    expect(parseStyle({ fg: 'red' }).fg).toBe(DEFAULT_STYLE.fg)
    expect(parseStyle({ bg: '#ABCDEF' }).bg).toBe('#ABCDEF')
  })

  it('clamps margin and normalizes gradient angle', () => {
    expect(parseStyle({ margin: 99 }).margin).toBe(8)
    expect(parseStyle({ margin: -3 }).margin).toBe(0)
    const g = parseStyle({ gradient: { from: '#fff', to: '#000', angle: 405 } }).gradient
    expect(g).toEqual({ from: '#fff', to: '#000', angle: 45 })
  })

  it('drops invalid module/eye shapes and gradients', () => {
    expect(parseStyle({ moduleShape: 'hexagon' }).moduleShape).toBe('square')
    expect(parseStyle({ gradient: { from: 'nope', to: '#000' } }).gradient).toBeNull()
  })

  it('accepts the connected module shape', () => {
    expect(parseStyle({ moduleShape: 'connected' }).moduleShape).toBe('connected')
  })

  it('defaults pupil shape to the eye frame shape, but honors an explicit pupil', () => {
    expect(parseStyle({ eyeShape: 'circle' }).pupilShape).toBe('circle')
    expect(parseStyle({ eyeShape: 'circle', pupilShape: 'square' }).pupilShape).toBe('square')
  })

  it('only accepts https or data:image logos', () => {
    expect(isSafeLogoSrc('https://x.com/a.png')).toBe(true)
    expect(isSafeLogoSrc('data:image/png;base64,AAAA')).toBe(true)
    expect(isSafeLogoSrc('http://x.com/a.png')).toBe(false)
    expect(isSafeLogoSrc('javascript:alert(1)')).toBe(false)
    expect(parseStyle({ logo: 'http://x.com/a.png' }).logo).toBeNull()
  })

  it('trims and caps the frame label', () => {
    expect(parseStyle({ frameLabel: '  Scan me  ' }).frameLabel).toBe('Scan me')
    expect(parseStyle({ frameLabel: 'x'.repeat(50) }).frameLabel).toHaveLength(28)
    expect(parseStyle({ frameLabel: '   ' }).frameLabel).toBeNull()
  })
})

describe('renderStyledQrSvg', () => {
  const url = 'https://frequencylocal.com/q/abc1234'

  it('renders a valid svg with square modules by default', () => {
    const svg = renderStyledQrSvg(url, DEFAULT_STYLE, 256)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(svg).toContain('<rect')
  })

  it('uses circles for dot modules', () => {
    const svg = renderStyledQrSvg(url, { ...DEFAULT_STYLE, moduleShape: 'dots' }, 256)
    expect(svg).toContain('<circle')
  })

  it('draws rounded-end bars for connected modules', () => {
    const svg = renderStyledQrSvg(url, { ...DEFAULT_STYLE, moduleShape: 'connected' }, 256)
    expect(svg).toContain('rx="0.5"') // rounded-cap run bars
    expect(svg.startsWith('<svg')).toBe(true)
  })

  it('emits a gradient def when a gradient is set', () => {
    const svg = renderStyledQrSvg(url, { ...DEFAULT_STYLE, gradient: { from: '#f97316', to: '#db2777', angle: 45 } }, 256)
    expect(svg).toContain('linearGradient')
    expect(svg).toContain('url(#qrgrad)')
  })

  it('adds an image for a logo and a label for a frame', () => {
    const svg = renderStyledQrSvg(url, { ...DEFAULT_STYLE, logo: 'https://x.com/a.png', frameLabel: 'Scan me' }, 300)
    expect(svg).toContain('<image')
    expect(svg).toContain('Scan me')
  })

  it('escapes the frame label', () => {
    const svg = renderStyledQrSvg(url, { ...DEFAULT_STYLE, frameLabel: '<b>&' }, 300)
    expect(svg).toContain('&lt;b&gt;&amp;')
    expect(svg).not.toContain('<b>&<')
  })
})
