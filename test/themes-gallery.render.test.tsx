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

  it('sends every main button to the launch or the builder, and See the full kit to the theme page', () => {
    const links = themeShowcaseLinks()
    expect(Object.keys(links.kits)).toHaveLength(9)
    // Every kit is offered in the builder now, so every Use link carries its kit (a kit the builder drops gets use: null).
    for (const k of Object.values(links.kits) as { use: string | null; kit: string | null; page: string | null }[]) {
      expect(k.kit).toBeTruthy()
      expect(k.use).toMatch(/^\/(launch\/start|create-a-space)/)
      expect(k.use).toContain(`kit=${k.kit}`)
    }
    expect(links.kits.nocturne.page).toBe('/themes/nocturne')
    expect(links.kits.cyberwitch.page).toBe('/themes/cyberwitch')
    expect(links.kits.cyberwitch.use).toContain('kit=cyberwitch')
    expect(links.plans).toBe('/pricing')
  })

  it('draws every kit, nine See the full kit links, and no em dashes', () => {
    const html = renderToStaticMarkup(<FrequencyThemes />)
    expect((html.match(/class="ks-kit"/g) ?? []).length).toBe(9)
    expect((html.match(/See the full kit/g) ?? []).length).toBe(9)
    expect(html).not.toMatch(/—/)
  })
})
