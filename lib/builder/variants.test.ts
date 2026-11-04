import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { config } from '@/lib/page-editor/config'
import { ROLES, ROLE_IDS, roleVariant, type RoleId } from '@/lib/blocks/roles/roles'
import { presentationDefault } from '@/components/sites/presentation'
import { tuneProjection } from './tune'
import { layoutChips, needMet, pinLayout, unpinLayout } from './variants'

const THEMES = ['DAWN', 'Menswork', 'Midnight', 'Wildheart', 'Network', 'NetworkKit', 'Temple', 'TempleKit', 'Designer', 'FreeHuman', 'Services', 'NewWorld', 'CyberWitch'] as const
const sample = (role: RoleId) => { const s = { ...ROLES[role].sample } as Record<string, unknown>; delete s.sample; return s }

describe('layout chips (BLD-203)', () => {
  // A theme that draws some role in a layout other than the role's own default, so the three tiers can be told apart.
  const [theme, role] = THEMES.flatMap((t) => ROLE_IDS.map((r) => [t, r] as const)).find(([t, r]) => { const d = presentationDefault(t, r); return !!d && d !== ROLES[r].default })!
  const other = Object.keys(ROLES[role].variants).find((v) => v !== presentationDefault(theme, role) && v !== ROLES[role].default)!

  it('roleVariant priority holds: owner, then theme, then the role default', () => {
    expect(roleVariant(role, other, presentationDefault(theme, role))).toBe(other)
    expect(roleVariant(role, '', presentationDefault(theme, role))).toBe(presentationDefault(theme, role))
    expect(roleVariant(role, '', presentationDefault('DAWN', role))).toBe(ROLES[role].default)
    expect(roleVariant(role, 'not-a-layout', undefined)).toBe(ROLES[role].default)
  })

  it('picking a chip pins it through a theme switch; unpinning hands it back to the theme', () => {
    const type = ROLES[role].type
    const pinned = { ...sample(role), ...pinLayout(other) }
    expect(pinned).toMatchObject({ variant: other, variantSet: true })
    for (const t of THEMES) expect(layoutChips(type, pinned, t)).toMatchObject({ pinned: true, current: other })
    const loose = { ...pinned, ...unpinLayout() }
    expect(loose).toMatchObject({ variant: '', variantSet: false })
    expect(layoutChips(type, loose, theme)).toMatchObject({ pinned: false, current: presentationDefault(theme, role) })
    expect(layoutChips(type, loose, 'DAWN')).toMatchObject({ pinned: false, current: ROLES[role].default })
  })

  it('a chip whose needs are unmet says why and points at the field that fills it', () => {
    const hero = layoutChips(ROLES.hero.type, { ...sample('hero'), image: '' }, 'DAWN')!
    expect(hero.chips.find((c) => c.id === 'full')?.blocked).toEqual({ need: 'image', say: 'needs a photo', field: 'image' })
    expect(layoutChips(ROLES.hero.type, { ...sample('hero'), image: '/p.jpg' }, 'DAWN')!.chips.every((c) => !c.blocked)).toBe(true)
    const tiers = sample('membership').items as Record<string, unknown>[]
    expect(needMet({ items: tiers.map((t) => ({ ...t, featured: false })) }, 'featured')).toBe(false)
    expect(needMet({ items: tiers.map((t, i) => ({ ...t, featured: i === 0 })) }, 'featured')).toBe(true)
  })

  it('the Tune rail leaves a role\'s layout to the chips', () => {
    for (const r of ROLE_IDS) expect([...tuneProjection(ROLES[r].type, config).layer1, ...tuneProjection(ROLES[r].type, config).layer2].some((f) => f.key === 'variant')).toBe(false)
    expect(layoutChips('ServicesStory', {}, 'DAWN')).toBeNull()
  })
})

describe('every variant renders non-empty with sample content on every theme (BLD-203)', () => {
  const fill = (role: RoleId, variant: string) => {
    const props: Record<string, unknown> = { ...sample(role), variant }
    for (const need of ROLES[role].variants[variant].needs ?? []) {
      if (need === 'image') props.image = '/brand/frequency/photos/hero.jpg'
      else if (need === 'featured') props.items = (props.items as Record<string, unknown>[]).map((t, i) => ({ ...t, featured: i === 0 }))
      else if (!props[need]) props[need] = 'Sample'
    }
    return props
  }
  for (const role of ROLE_IDS) {
    it(role, () => {
      const render = config.components[ROLES[role].type].render as (p: unknown) => React.ReactElement
      for (const theme of THEMES) for (const variant of Object.keys(ROLES[role].variants)) {
        const html = renderToStaticMarkup(createElement(() => render({ ...fill(role, variant), puck: { metadata: { theme } } })))
        expect(html, `${role} ${variant} on ${theme}`).toContain(`data-variant="${variant}"`)
        expect(/>[^<]*\S[^<]*</.test(html), `${role} ${variant} on ${theme} draws words`).toBe(true)
      }
    })
  }
})
