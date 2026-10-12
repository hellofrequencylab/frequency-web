import { describe, expect, it } from 'vitest'
import { SITE_LOOK_CSS } from './site-look-css'
import { HOUSE_CSS } from './house-css'
import { MENSWORK_CSS } from './menswork-css'
import { FREQUENCY_PAGE_CSS } from './frequency-page-css'
import { MENSWORK_PAGE_CSS } from './menswork-page-css'
import { SITE_LOOK_OPTIONS, THEME_LOOK } from '@/lib/theme/site-style'

// ADR-1728: the owner's corners, spacing and header choices restyle either theme. The sheet only meets a
// site whose root names a choice that differs from its theme's own.

const THEMES = HOUSE_CSS + MENSWORK_CSS + FREQUENCY_PAGE_CSS + MENSWORK_PAGE_CSS

describe('the global styles sheet', () => {
  it('answers every choice that can differ from a theme default', () => {
    for (const key of ['corners', 'spacing', 'header'] as const) {
      for (const { id } of SITE_LOOK_OPTIONS[key]) {
        const isEveryDefault = THEME_LOOK.frequency[key] === id && THEME_LOOK.bold[key] === id
        if (!isEveryDefault) expect(SITE_LOOK_CSS, `${key}=${id}`).toContain(`[data-site-${key}="${id}"]`)
      }
    }
  })

  it('only restyles classes the two themes actually draw', () => {
    const own = new Set(THEMES.match(/\.(?:hs|mw)-[a-z0-9-]+/g))
    const used = [...new Set(SITE_LOOK_CSS.match(/\.(?:hs|mw)-[a-z0-9-]+/g))]
    expect(used.filter((c) => !own.has(c))).toEqual([])
  })

  it('scopes every rule to a site root carrying a choice, and reads tokens only', () => {
    const selectors = SITE_LOOK_CSS.replace(/:is\([^)]*\)/g, ':is()').replace(/\{[^}]*\}/g, '\n')
      .split(/[\n,]/)
      .map((s) => s.replace(/^[\s}]+/, '').trim())
      .filter((s) => s && !s.startsWith('@media'))
    for (const sel of selectors) expect(sel, sel).toMatch(/^\[data-house-site\]\[data-site-(corners|spacing|header)="[a-z]+"\]/)
    expect(SITE_LOOK_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(SITE_LOOK_CSS).not.toMatch(/rgba?\(/)
  })
})
