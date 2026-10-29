import { describe, expect, it } from 'vitest'
import { MEGA_THEMES } from '@/lib/theme/mega-theme'
import { PREVIEW_KIT_ORDER, PREVIEW_TOKEN_KEYS, previewAccentVars, previewDefaultAccent, previewOnAccent, previewTokens } from '@/lib/theme/preview-tokens'

describe('preview tokens', () => {
  it.each(MEGA_THEMES.map((t) => t.id))('%s declares every --pv key', (id) => {
    const tokens = previewTokens(id)
    for (const key of PREVIEW_TOKEN_KEYS) expect(tokens[key], `${id} ${key}`).toBeTruthy()
  })

  it('offers every Mega Theme but the retired classic Network and Temple once, Designer first', () => {
    expect([...PREVIEW_KIT_ORDER].sort()).toEqual(MEGA_THEMES.map((t) => t.id).filter((i) => i !== 'network' && i !== 'temple').sort())
    expect(PREVIEW_KIT_ORDER[0]).toBe('designer')
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
