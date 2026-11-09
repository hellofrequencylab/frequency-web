import { describe, expect, it } from 'vitest'
import { config } from '@/lib/page-editor/config'
import { ROLES, ROLE_IDS } from '@/lib/blocks/roles/roles'
import { makeItem } from '@/components/page-editor/mobile/data-ops'
import { siteCanvasVars, siteRenderStyle } from '@/lib/sites/site-render-style'
import type { SiteStyle } from '@/lib/theme/site-style'
import type { Data } from '@/lib/page-editor/types'
import { profileFrame, spotlightDoors } from './surface-view'

const newWorld: SiteStyle = { theme: 'new-world', fonts: 'modern', synced: true, spaceFonts: 'modern', look: { corners: null, spacing: null, header: null, footer: null } } as unknown as SiteStyle

function page(): Data {
  const content = ROLE_IDS.map((id) => {
    const type = ROLES[id].type
    const item = makeItem(config, type) as Data['content'][number]
    return { ...item, props: { ...item.props, id: `s-${id}`, ...ROLES[id].sample } }
  })
  return { root: { props: {} }, content } as unknown as Data
}

describe('surface parity (BLD-215)', () => {
  it('profile: the Frequency frame wears the Space fonts and accent and no site theme', () => {
    const render = siteRenderStyle(newWorld, '#5B3FD0', null)
    expect(render.skinned).toBe(true)
    const skinned = siteCanvasVars(render)
    expect(skinned).toHaveProperty('--th-accent-hover')
    const frame = profileFrame(render, '#5B3FD0', new Date('2026-11-09T12:00:00Z'))
    expect(frame.theme).toBe('DAWN')
    expect(frame.fonts).toBe('modern')
    // The skin's own accent family never reaches the profile; the data-website-theme the canvas wears is Frequency's.
    expect(frame.vars).not.toHaveProperty('--th-accent-hover')
    expect(frame.vars).not.toEqual(skinned)
    // One resolver: the profile is the Space page's own unskinned render, byte for byte.
    expect(frame.vars).toEqual(siteCanvasVars({ ...render, skinned: false, editorTheme: 'DAWN' }, new Date('2026-11-09T12:00:00Z')))
    expect(frame.vars).toHaveProperty('--th-accent')
  })

  it('profile with no stored style: the house theme and the brand accent', () => {
    const frame = profileFrame(null, '#5B3FD0')
    expect(frame.theme).toBe('DAWN')
    expect(frame.fonts).toBeUndefined()
    expect(frame.vars).toHaveProperty('--th-accent')
  })

  it('profile with a font set the Space themes do not know: the house theme, never a throw', () => {
    const render = siteRenderStyle({ ...newWorld, fonts: 'new-world' as never }, '#5B3FD0', null)
    const frame = profileFrame(render, '#5B3FD0')
    expect(frame.theme).toBe('DAWN')
    expect(frame.fonts).toBeUndefined()
  })

  it('spotlight: one door per role section, in page order, with the role glyph and intent', () => {
    const doc = page()
    const doors = spotlightDoors(doc, config, '/spaces/demo/site', 'home')
    expect(doors.map((d) => d.role)).toEqual([...ROLE_IDS])
    for (const d of doors) {
      expect(ROLES[d.role].surfaces.spotlight).toBe('door')
      expect(d.icon).toBe(ROLES[d.role].icon)
      expect(d.title.length).toBeGreaterThan(0)
      expect(d.href).toBe(`/spaces/demo/site#${d.id}`)
    }
    const hero = doors.find((d) => d.role === 'hero')!
    expect(hero.title).toBe(String(ROLES.hero.sample.title).replace(/[*_]/g, ''))
    expect(hero.meta).toBe(ROLES.hero.intent)
  })

  it('spotlight: a section with no heading is named by its intent; a block with no role makes no door', () => {
    const doc = { root: { props: {} }, content: [
      { type: ROLES.cta.type, props: { id: 'bare' } },
      { type: 'Hero', props: { id: 'legacy', title: 'Old hero' } },
    ] } as unknown as Data
    const doors = spotlightDoors(doc, config, '', 'about')
    expect(doors).toHaveLength(1)
    expect(doors[0]).toMatchObject({ id: 'bare', title: ROLES.cta.intent, href: '/about#bare' })
    expect(spotlightDoors(doc, config, '', 'home')[0].href).toBe('/#bare')
  })
})
