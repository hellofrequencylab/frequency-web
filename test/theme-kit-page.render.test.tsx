import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FrequencyThemeKit, THEME_KIT_PAGE_IDS } from '@/components/frequency/site/pages/themes/frequency-theme-kit'
import { THEME_TOOLS } from '@/lib/themes/library'

describe('the theme kit page', () => {
  it('covers every theme except Midnight, which keeps its own page', () => {
    expect(THEME_KIT_PAGE_IDS).toEqual(['frequency', 'bold', 'wildheart', 'network', 'network-kit', 'temple', 'designer'])
  })

  it.each(THEME_KIT_PAGE_IDS)('draws %s with every tool, thirteen kits, no em dash and no inline colour', (id) => {
    const html = renderToStaticMarkup(<FrequencyThemeKit theme={id} />)
    for (const t of THEME_TOOLS) expect(html).toContain(t.name.replace(/&/g, '&amp;'))
    // The Network Theme Kit's thirteen starter kits arrive with the kit registry pass; until then it lists none.
    const kits = id === 'network-kit' ? 0 : 13
    expect(html.match(/Start with this kit/g)?.length ?? 0).toBe(kits)
    // Every way in starts a Space wearing this theme (Space creation reads ?theme=).
    expect(html).toContain(`/spaces/new?theme=${id}`)
    expect(html.match(new RegExp(`/spaces/new\\?theme=${id}&amp;niche=`, 'g'))?.length ?? 0).toBe(kits)
    expect(html).not.toMatch(/—/)
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}/)
  })

  it('says the Space page keeps the Frequency frame', () => {
    expect(renderToStaticMarkup(<FrequencyThemeKit theme="temple" />)).toContain('Frequency page people know')
  })
})
