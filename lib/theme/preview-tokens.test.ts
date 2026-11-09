import { describe, expect, it } from 'vitest'
import { SITE_THEMES } from '@/lib/theme/site-style'
import { MEGA_THEMES } from '@/lib/theme/mega-theme'
import { PREVIEW_FONT_SHEET, PREVIEW_KIT_ORDER, PREVIEW_TOKEN_KEYS, previewAccentVars, previewDefaultAccent, previewOnAccent, previewTokens } from '@/lib/theme/preview-tokens'

describe('preview tokens', () => {
  it.each(MEGA_THEMES.map((t) => t.id))('%s declares every --pv key', (id) => {
    const tokens = previewTokens(id)
    for (const key of PREVIEW_TOKEN_KEYS) expect(tokens[key], `${id} ${key}`).toBeTruthy()
  })

  it('offers every Mega Theme but the retired classic Network and Temple once, New World first once it is offered', () => {
    expect([...PREVIEW_KIT_ORDER].sort()).toEqual(MEGA_THEMES.map((t) => t.id).filter((i) => SITE_THEMES.some((t) => t.id === i)).sort())
    expect(PREVIEW_KIT_ORDER[0]).toBe(SITE_THEMES.some((t) => t.id === 'new-world') ? 'new-world' : 'designer')
  })

  it('Free Human and Services wear shapes of their own, never Temple\'s (LIVE-2102)', () => {
    const fh = previewTokens('free-human')
    expect(fh['--pv-font-display']).toMatch(/^'Cormorant Garamond'/)
    expect(fh['--pv-radius-card']).toBe('40px')
    expect(fh['--pv-radius-photo']).toBe('999px 999px 120px 120px')
    expect(fh['--pv-em-ink']).toBe('#B3361F')
    expect(fh['--pv-font-display']).not.toBe(previewTokens('temple')['--pv-font-display'])
    const sv = previewTokens('services')
    expect(sv['--pv-font-display']).toMatch(/^'Bricolage Grotesque'/)
    expect(sv['--pv-font-em']).toMatch(/^'Lora'/)
    expect(sv['--pv-radius-card']).toBe('20px')
  })

  it('Bold and Wildheart wear their revised design systems\' faces and corners, and the sheet loads them (LIVE-2173)', () => {
    const b = previewTokens('bold')
    expect(b['--pv-font-display']).toMatch(/^'Sofia Sans Extra Condensed'/)
    expect(b['--pv-font-body']).toMatch(/^'Barlow'/)
    expect(b['--pv-display-weight']).toBe('800')
    const w = previewTokens('wildheart')
    expect(w['--pv-font-display']).toMatch(/^'IM Fell English'/)
    expect(w['--pv-font-body']).toMatch(/^'EB Garamond'/)
    expect(w['--pv-radius-photo']).toBe('999px 999px 24px 24px')
    for (const family of ['Sofia+Sans+Extra+Condensed', 'Barlow', 'IM+Fell+English', 'EB+Garamond']) expect(PREVIEW_FONT_SHEET).toContain(`family=${family}`)
    expect(PREVIEW_FONT_SHEET).not.toContain('family=Anton')
  })

  it('Designer reads its own palette, with a charcoal primary', () => {
    const t = previewTokens('designer')
    expect(t['--pv-bg']).toBe('#F7F3EC')
    expect(t['--pv-btn-bg']).toBe('#343736')
  })

  it('labels flip on the .42 luminance line', () => {
    expect(previewOnAccent('#F2DCB8')).toBe('#111111')
    expect(previewOnAccent('#2B3A8C')).toBe('#FFFFFF')
    expect(previewAccentVars('#B094FF', null, true)['--pv-accent-ink']).toBe('#B094FF')
    expect(previewDefaultAccent('midnight').dark).toBe(true)
  })
})
