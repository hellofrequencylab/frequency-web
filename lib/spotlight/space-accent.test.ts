import { describe, expect, it } from 'vitest'
import { pickThemeSpaceAccent } from './space-accent'

const cw = { theme: 'cyberwitch', siteStyle: { theme: 'cyberwitch' } }

describe('ONE ACCENT: a themed Spotlight reads its owner\'s Space accent', () => {
  it('takes the hex accent of the Space wearing the theme, and skips tokens, blanks and other themes', () => {
    expect(pickThemeSpaceAccent([{ brand_accent: '#19E3B1', preferences: cw }], 'cyberwitch')).toBe('#19e3b1')
    expect(pickThemeSpaceAccent([{ brand_accent: 'primary', preferences: cw }], 'cyberwitch')).toBeNull()
    expect(pickThemeSpaceAccent([{ brand_accent: null, preferences: cw }], 'cyberwitch')).toBeNull()
    expect(pickThemeSpaceAccent([{ brand_accent: '#19E3B1', preferences: { theme: 'services' } }, { brand_accent: '#F2184C', preferences: cw }], 'cyberwitch')).toBe('#f2184c')
  })
})
