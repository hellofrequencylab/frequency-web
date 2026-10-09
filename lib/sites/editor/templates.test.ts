import { describe, expect, it } from 'vitest'
import { WEBSITE_PAGE_TEMPLATES, websiteTemplateSections } from './templates'

describe('website page layouts', () => {
  it('offers the six handoff layouts and retains live Space bindings', () => {
    expect(WEBSITE_PAGE_TEMPLATES.map((template) => template.name)).toEqual(['Program', 'Season', 'Circle finder', 'Event', 'About', 'Blank'])
    expect(websiteTemplateSections('Menswork', 'Program')).toContainEqual({ type: 'FeatureGrid', props: { source: 'offerings', title: 'Offerings' } })
    expect(websiteTemplateSections('DAWN', 'Circle finder').map((section) => section.type)).toContain('SpaceCommunity')
    expect(websiteTemplateSections('Midnight', 'Blank')).toEqual([])
  })
  it('uses each theme’s hero and story presets rather than a shared fixed layout', () => {
    expect(websiteTemplateSections('Menswork', 'Program')[0]).toEqual({ type: 'PhotoHero', props: { content: 'below' } })
    expect(websiteTemplateSections('DAWN', 'Program')[0]).toEqual({ type: 'Hero', props: { variant: 'split' } })
    expect(websiteTemplateSections('Midnight', 'Program')[0]).toEqual({ type: 'Hero', props: { variant: 'image' } })
    expect(websiteTemplateSections('DAWN', 'About')[0].props).toEqual({ side: 'left' })
    expect(websiteTemplateSections('Midnight', 'About')[0].props).toEqual({ side: 'right' })
  })
})
