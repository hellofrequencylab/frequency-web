import { describe, it, expect } from 'vitest'
import { parseStyle, isSafeLogoSrc, isPrivateIp, withMemberAvatar, DEFAULT_STYLE } from './style'
import { renderStyledQrSvg } from './render-styled'

describe('parseStyle', () => {
  it('fills defaults for empty/garbage input', () => {
    // parseStyle never auto-applies the creation-default LOGO (so existing logo-less codes stay
    // logo-less) and defaults logoShape to 'square' independently; every other field falls back to
    // DEFAULT_STYLE. The logo + its crop are a CREATION default (the generator), not a parse default.
    const parsedDefault = { ...DEFAULT_STYLE, logo: null, logoShape: 'square' as const }
    expect(parseStyle(null)).toEqual(parsedDefault)
    expect(parseStyle('nope')).toEqual(parsedDefault)
    expect(parseStyle({})).toEqual(parsedDefault)
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
    expect(parseStyle({ moduleShape: 'hexagon' }).moduleShape).toBe(DEFAULT_STYLE.moduleShape)
    expect(parseStyle({ gradient: { from: 'nope', to: '#000' } }).gradient).toBeNull()
  })

  it('accepts the connected module shape', () => {
    expect(parseStyle({ moduleShape: 'connected' }).moduleShape).toBe('connected')
  })

  it('defaults pupil shape to the eye frame shape, but honors an explicit pupil', () => {
    expect(parseStyle({ eyeShape: 'circle' }).pupilShape).toBe('circle')
    expect(parseStyle({ eyeShape: 'circle', pupilShape: 'square' }).pupilShape).toBe('square')
  })

  it('defaults and validates logo shape + tint', () => {
    expect(parseStyle({}).logoShape).toBe('square')
    expect(parseStyle({}).logoTint).toBe('none')
    expect(parseStyle({ logoShape: 'circle' }).logoShape).toBe('circle')
    expect(parseStyle({ logoTint: 'gradient' }).logoTint).toBe('gradient')
    expect(parseStyle({ logoTint: 'rainbow' }).logoTint).toBe('none')
  })

  it('only accepts https or data:image logos', () => {
    expect(isSafeLogoSrc('https://x.com/a.png')).toBe(true)
    expect(isSafeLogoSrc('data:image/png;base64,AAAA')).toBe(true)
    expect(isSafeLogoSrc('http://x.com/a.png')).toBe(false)
    expect(isSafeLogoSrc('javascript:alert(1)')).toBe(false)
    expect(parseStyle({ logo: 'http://x.com/a.png' }).logo).toBeNull()
  })

  it('isPrivateIp flags loopback / private / metadata / CGNAT (v4 + v6), allows public', () => {
    expect(isPrivateIp('169.254.169.254')).toBe(true) // cloud metadata
    expect(isPrivateIp('127.0.0.1')).toBe(true)
    expect(isPrivateIp('10.1.2.3')).toBe(true)
    expect(isPrivateIp('192.168.0.1')).toBe(true)
    expect(isPrivateIp('172.16.0.1')).toBe(true)
    expect(isPrivateIp('100.64.0.1')).toBe(true) // CGNAT
    expect(isPrivateIp('::1')).toBe(true)
    expect(isPrivateIp('fd00::1')).toBe(true)
    expect(isPrivateIp('8.8.8.8')).toBe(false)
    expect(isPrivateIp('172.32.0.1')).toBe(false) // just outside 172.16/12
  })

  it('blocks SSRF to internal / private / metadata hosts', () => {
    expect(isSafeLogoSrc('https://169.254.169.254/latest/meta-data/')).toBe(false)
    expect(isSafeLogoSrc('https://10.0.0.5/a.png')).toBe(false)
    expect(isSafeLogoSrc('https://192.168.1.1/a.png')).toBe(false)
    expect(isSafeLogoSrc('https://127.0.0.1/a.png')).toBe(false)
    expect(isSafeLogoSrc('https://localhost/a.png')).toBe(false)
    expect(parseStyle({ logo: 'https://169.254.169.254/x.png' }).logo).toBeNull()
  })

  it('trims and caps the frame label', () => {
    expect(parseStyle({ frameLabel: '  Scan me  ' }).frameLabel).toBe('Scan me')
    expect(parseStyle({ frameLabel: 'x'.repeat(50) }).frameLabel).toHaveLength(28)
    expect(parseStyle({ frameLabel: '   ' }).frameLabel).toBeNull()
  })
})

describe('withMemberAvatar', () => {
  const avatar = 'https://cdn.example.com/avatars/me.png'

  it("centers the member's avatar over the default Frequency mark, rounded", () => {
    const out = withMemberAvatar({ ...DEFAULT_STYLE, logo: DEFAULT_STYLE.logo }, avatar)
    expect(out.logo).toBe(avatar)
    expect(out.logoShape).toBe('circle')
  })

  it('fills an empty logo with the avatar too', () => {
    expect(withMemberAvatar({ ...DEFAULT_STYLE, logo: null }, avatar).logo).toBe(avatar)
  })

  it('respects a deliberately customized logo (does not override)', () => {
    const custom = { ...DEFAULT_STYLE, logo: 'https://x.com/custom.png' }
    expect(withMemberAvatar(custom, avatar).logo).toBe('https://x.com/custom.png')
  })

  it('keeps the stored mark when the member has no avatar', () => {
    expect(withMemberAvatar({ ...DEFAULT_STYLE }, null).logo).toBe(DEFAULT_STYLE.logo)
    expect(withMemberAvatar({ ...DEFAULT_STYLE }, undefined).logo).toBe(DEFAULT_STYLE.logo)
  })

  it('ignores an unsafe avatar URL (SSRF guard)', () => {
    expect(withMemberAvatar({ ...DEFAULT_STYLE }, 'https://169.254.169.254/x.png').logo).toBe(DEFAULT_STYLE.logo)
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

  it('crops the logo to a circle and tints it (mask + clip)', () => {
    const svg = renderStyledQrSvg(
      url,
      { ...DEFAULT_STYLE, logo: 'https://x.com/a.png', logoShape: 'circle', logoTint: 'solid' },
      300,
    )
    expect(svg).toContain('clipPath')
    expect(svg).toContain('<mask')
    expect(svg).toContain('<circle')
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
