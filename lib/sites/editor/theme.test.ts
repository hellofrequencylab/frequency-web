import { describe, expect, it } from 'vitest'
import contract from './theme-contract.json'
import { websiteThemeVars } from './theme'
import { WEBSITE_THEMES } from './state'

describe('website theme handoff', () => {
  it.each(WEBSITE_THEMES)('%s supplies its own complete token contract and lighter editor rails', (theme) => {
    const vars = websiteThemeVars(theme, null, new Date('2026-10-08T12:00:00Z')) as Record<string, string>
    for (const [key, value] of Object.entries(contract.themes[theme])) if (typeof value === 'string') expect(vars[key]).toBe(value)
    expect(vars['--ed-chrome']).toBe('color-mix(in oklch, var(--th-bg), white var(--ed-lift))')
    expect(vars['--ed-field']).toContain('var(--ed-lift2)')
    expect(vars['--th-display-render']).toBe(`var(--font-${theme === 'Menswork' ? 'sofia-xc' : 'anton'}, ${vars['--th-display']})`)
    expect(vars['--th-body-render']).toBe(`var(--font-${theme === 'Menswork' ? 'barlow' : 'nunito'}, ${vars['--th-body']})`)
  })
  it('uses the current Menswork season and the website owner accent with an optional custom brand accent', () => {
    const vars = websiteThemeVars('Menswork', '#ffcc44', new Date('2026-01-01T12:00:00Z')) as Record<string, string>
    expect(vars['--th-season']).toBe('#97A3D4')
    expect(vars['--th-accent']).toBe('#ffcc44')
    expect((websiteThemeVars('DAWN', '#ffcc44') as Record<string, string>)['--th-accent']).toBe('#ffcc44')
  })
})
