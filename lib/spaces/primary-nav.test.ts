import { describe, expect, it } from 'vitest'
import { primarySpaceTabs, spaceContextLinks, spacePrimarySection, spaceProgramHref } from './primary-nav'

describe('Space primary and contextual navigation', () => {
  it('uses fixed page destinations and preserves the existing custom Program address', () => {
    expect(primarySpaceTabs('example').map(tab => tab.label)).toEqual(['Home', 'Community', 'Calendar', 'Program'])
    expect(primarySpaceTabs('example').every(tab => !tab.href.includes('#'))).toBe(true)
    expect(spaceProgramHref('example')).toBe('/spaces/example/-/program')
    expect(spacePrimarySection('/spaces/example/program', '/spaces/example')).toBe('home')
    expect(primarySpaceTabs('example', true).some(tab => tab.label === 'Community')).toBe(false)
  })
  it('keeps one section active and refuses owner routes as public tabs', () => {
    const base = '/spaces/example'
    expect(spacePrimarySection(`${base}/circles`, base)).toBe('feature:community')
    expect(spacePrimarySection(`${base}/-/program`, base)).toBe('feature:program')
    expect(spacePrimarySection(`${base}/manage`, base)).toBeNull()
    expect(spacePrimarySection(`${base}/settings/members`, base)).toBeNull()
    expect(spacePrimarySection('/spaces/other', base)).toBeNull()
  })
  it('drops only local Home section shortcuts and duplicate primary doors, preserving external fragments', () => {
    const base = '/spaces/example'
    const links = spaceContextLinks([
      { key: 'home', href: base, label: 'Home' },
      { key: 'anchor:faq', href: `${base}#faq`, label: 'FAQ' },
      { key: 'feature:community', href: `${base}/community`, label: 'Community' },
      { key: 'saved:1', href: 'https://support.example/#schedule', label: 'Support', external: true },
      { key: 'page:program', href: `${base}/program`, label: 'Custom Program' },
      { key: 'duplicate', href: `${base}/program`, label: 'Duplicate' },
    ])
    expect(links.map(link => link.href)).toEqual(['https://support.example/#schedule', `${base}/program`])
  })
})
