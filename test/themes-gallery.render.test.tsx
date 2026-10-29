import { describe, expect, it } from 'vitest'
import { createSpaceHref } from '@/lib/create-space/href'
import { renderToStaticMarkup } from 'react-dom/server'
import { FrequencyThemes, THEME_GALLERY } from '@/components/frequency/site/pages/themes/frequency-themes'
import { SITE_THEMES } from '@/lib/theme/site-style'

describe('the theme gallery', () => {
  it('has one card per theme, in the editor order', () => {
    expect(THEME_GALLERY.map((t) => t.id)).toEqual(SITE_THEMES.map((t) => t.id))
  })

  it('links every Midnight kit to the Create a Space builder, and gives Midnight its page', () => {
    const midnight = THEME_GALLERY.find((t) => t.id === 'midnight')!
    expect(midnight.kits.map((k) => k.niche).sort()).toEqual(['coaches', 'hosts', 'networks', 'nonprofits', 'studios', 'venues'])
    expect(midnight.kits.every((k) => k.href === createSpaceHref('midnight'))).toBe(true)
    expect(midnight.href).toBe('/themes/nocturne')
  })

  it('draws every theme, without em dashes or inline colour', () => {
    const html = renderToStaticMarkup(<FrequencyThemes />)
    for (const t of SITE_THEMES) expect(html).toContain(`id="${t.id}"`)
    expect(html).not.toMatch(/—/)
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}/)
  })
})
