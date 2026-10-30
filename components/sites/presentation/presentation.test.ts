import { describe, expect, it } from 'vitest'
import { ROLES, ROLE_IDS, roleVariant } from '@/lib/blocks/roles/roles'
import { presentationDefault } from './index'

const THEMES = ['DAWN', 'Menswork', 'Midnight', 'Wildheart', 'Network', 'NetworkKit', 'Temple', 'TempleKit', 'Designer', 'FreeHuman']

describe('presentation layer (LIVE-1861)', () => {
  it('every default is a layout its role really has', () => {
    for (const theme of THEMES) for (const role of ROLE_IDS) {
      const v = presentationDefault(theme, role)
      if (v !== undefined) expect(v in ROLES[role].variants, `${theme} ${role} ${v}`).toBe(true)
    }
  })

  it('a theme gives a role its own layout, and themes differ', () => {
    expect(roleVariant('hero', '', presentationDefault('Midnight', 'hero'))).toBe('full')
    expect(roleVariant('hero', undefined, presentationDefault('Network', 'hero'))).toBe('split')
    expect(new Set(THEMES.map((t) => presentationDefault(t, 'hero') ?? ROLES.hero.default)).size).toBeGreaterThan(2)
  })

  it('the owner\'s pick wins, and DAWN or an unknown theme draws the role\'s own default', () => {
    expect(roleVariant('hero', 'center', presentationDefault('Midnight', 'hero'))).toBe('center')
    expect(roleVariant('hero', '', presentationDefault('DAWN', 'hero'))).toBe(ROLES.hero.default)
    expect(roleVariant('hero', '', presentationDefault('nope', 'hero'))).toBe(ROLES.hero.default)
  })
})
