import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FrequencyThemes, themeShowcaseLinks } from '@/components/frequency/site/pages/themes/frequency-themes'
import { THEMES } from '@/components/frequency/site/pages/themes/kit-showcase/data'

describe('the Theme Kits page', () => {
  it('has one section per kit, nine in all', () => {
    expect(THEMES.map((t: { id: string }) => t.id)).toEqual([
      'new-world', 'network', 'services', 'designer', 'bold', 'temple', 'cyberwitch', 'wildheart', 'nocturne',
    ])
  })

  it('sends every main button to the launch or the builder, and See the kit to the theme page', () => {
    const links = themeShowcaseLinks()
    expect(Object.keys(links.kits)).toHaveLength(9)
    // A kit the builder does not offer (CyberWitch, no theme yet) has no Use link; every other one carries its kit.
    for (const [id, k] of Object.entries(links.kits) as [string, { use: string | null; kit: string | null; page: string | null }][]) {
      if (id === 'cyberwitch') expect(k.use).toBeNull()
      else {
        expect(k.use).toMatch(/^\/(launch\/start|create-a-space)/)
        expect(k.use).toContain(`kit=${k.kit}`)
      }
    }
    expect(links.kits.nocturne.page).toBe('/themes/nocturne')
    expect(links.kits.cyberwitch.page).toBeNull()
    expect(links.plans).toBe('/pricing')
  })

  it('draws every kit, eight See the kit links, and no em dashes', () => {
    const html = renderToStaticMarkup(<FrequencyThemes />)
    expect((html.match(/class="ks-kit"/g) ?? []).length).toBe(9)
    expect((html.match(/See the kit/g) ?? []).length).toBe(8)
    expect(html).not.toMatch(/—/)
  })
})
