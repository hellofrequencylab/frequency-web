import { describe, expect, it } from 'vitest'
import { SITE_THEMES, type SiteThemeId } from '@/lib/theme/site-style'
import { MEGA_SURFACES } from '@/lib/theme/mega-surfaces'
import { spaceLooksFor } from '@/lib/spotlight/layouts'
import { loadKit } from '@/lib/sites/kits/registry'
import { EDITOR_THEME_OF } from '@/lib/sites/site-render-style'
import { SAMPLE_SPECS } from '@/lib/email-samples/catalog'

// THE FOUR PARTS GUARD (Daniel 2026-11-18: "Survey EVERY theme and make sure they have their full design system and all 4
// parts, with all templates. Spotlight, Space, Website and Email templates."). Every theme a picker offers must carry all four:
// a Space surface, whole-page Spotlight layouts, a website starter kit in its own editor theme, and a kit email set in the
// stock catalog. A theme that loses one, or a new theme offered without one, fails here before it reaches an owner.

/** Each offered theme's kit email ids in lib/email-samples/catalog.ts (the catalog names some by their design name). */
const EMAIL_PREFIX: Partial<Record<SiteThemeId, string>> = {
  bold: 'bold-kit-',
  wildheart: 'wildheart-kit-',
  'network-kit': 'network-kit-',
  'temple-kit': 'temple-kit-',
  midnight: 'nocturne-kit-',
  designer: 'designer-kit-',
  'free-human': 'free-human-',
  services: 'services-',
  'new-world': 'new-world-',
  cyberwitch: 'cyberwitch-',
}

const offered = SITE_THEMES.map((t) => t.id)

describe('every offered theme has all four parts', () => {
  it('offers at least the launch set', () => {
    expect(offered.length).toBeGreaterThanOrEqual(10)
  })

  it.each(offered)('%s has a Space surface', (t) => {
    const s = MEGA_SURFACES[t]
    expect(s, t).toBeTruthy()
    expect(s!.canvas, t).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it.each(offered)('%s has whole-page Spotlight layouts', (t) => {
    expect(spaceLooksFor(t).length, t).toBeGreaterThanOrEqual(6)
  })

  it.each(offered)('%s has a website starter kit in its own editor theme', async (t) => {
    const kit = await loadKit(`${t}-general`)
    expect(kit, `${t}-general`).toBeTruthy()
    expect(kit!.theme, t).toBe(EDITOR_THEME_OF[t])
    expect(kit!.pages.length, t).toBeGreaterThan(0)
  })

  it.each(offered)('%s has a kit email set (note, welcome, dates, receipt at least)', (t) => {
    const prefix = EMAIL_PREFIX[t]
    expect(prefix, `${t} has no kit email set named here`).toBeTruthy()
    const ids = SAMPLE_SPECS.map((s) => s.id).filter((id) => id.startsWith(prefix!))
    expect(ids.length, t).toBeGreaterThanOrEqual(4)
  })
})
