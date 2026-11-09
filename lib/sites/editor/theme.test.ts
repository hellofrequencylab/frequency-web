import { describe, expect, it } from 'vitest'
import contract from './theme-contract.json'
import { normalizeWebsiteFields } from '../website-fields'
import { websiteThemeVars, WEBSITE_THEME_FONT_VARS } from './theme'
import { WEBSITE_THEMES } from './state'

describe('website theme handoff', () => {
  it.each(WEBSITE_THEMES)('%s supplies its own complete token contract and lighter editor rails', (theme) => {
    const vars = websiteThemeVars(theme, null, new Date('2026-10-08T12:00:00Z')) as Record<string, string>
    for (const [key, value] of Object.entries(contract.themes[theme])) if (typeof value === 'string') expect(vars[key]).toBe(value)
    expect(vars['--ed-chrome']).toBe('color-mix(in oklch, var(--th-bg), white var(--ed-lift))')
    expect(vars['--ed-field']).toContain('var(--ed-lift2)')
    expect(vars['--th-display-render']).toBe(`var(--font-${WEBSITE_THEME_FONT_VARS[theme][0]}, ${vars['--th-display']})`)
    expect(vars['--th-body-render']).toBe(`var(--font-${WEBSITE_THEME_FONT_VARS[theme][1]}, ${vars['--th-body']})`)
  })
  it('gives Wildheart its own site-scoped faces, the season fill now and the violet accent', () => {
    expect(WEBSITE_THEME_FONT_VARS.Wildheart).toEqual(['wh-fell', 'wh-garamond', 'wh-hanken'])
    const vars = websiteThemeVars('Wildheart', null, new Date('2027-01-01T12:00:00Z')) as Record<string, string>
    expect(vars['--th-season']).toBe('#A3AEDC')
    expect(vars['--th-accent']).toBe('#6E4D96')
    expect(vars['--th-on-accent']).toBe('#FBF7EF')
    expect((websiteThemeVars('Wildheart', '#1D3557') as Record<string, string>)['--th-accent']).toBe('#1D3557')
  })
  it('uses the current Menswork season and the website owner accent with an optional custom brand accent', () => {
    const vars = websiteThemeVars('Menswork', '#ffcc44', new Date('2026-01-01T12:00:00Z')) as Record<string, string>
    expect(vars['--th-season']).toBe('#97A3D4')
    expect(vars['--th-accent']).toBe('#ffcc44')
    expect((websiteThemeVars('DAWN', '#ffcc44') as Record<string, string>)['--th-accent']).toBe('#ffcc44')
  })
})

describe('website theme field compatibility', () => {
  it.each([['Heading', 'title', 'text'], ['DisplayHeading', 'text', 'title'], ['Text', 'body', 'text'], ['Prose', 'text', 'body']])('preserves legacy %s copy without retaining a conflicting alias', (type, canonical, legacy) => {
    const block = { type, props: { id: 'copy', [legacy]: 'Actual authored copy' } }
    const original = structuredClone(block)
    const normalized = normalizeWebsiteFields(block)
    expect(normalized.props[canonical]).toBe('Actual authored copy')
    expect(normalized.props[legacy]).toBeUndefined()
    expect(block).toEqual(original)
  })
  it('preserves an intentionally empty canonical field over an old alias', () => {
    expect(normalizeWebsiteFields({ type: 'Text', props: { body: '', text: 'Old copy' } }).props.body).toBe('')
  })
})
