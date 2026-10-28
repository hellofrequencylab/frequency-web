import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/spaces/accent'
import contract from '@/lib/sites/editor/theme-contract.json'
import { websiteThemeVars, WEBSITE_THEME_FONT_VARS } from '@/lib/sites/editor/theme'
import { initialWebsiteTheme } from '@/lib/sites/editor/seed'
import { THEME_PRESETS, validateSpotlightTheme } from '@/lib/spotlight/theme'
import { NETWORK_SCHEMES } from '@/lib/theme/network'
import { emailSurface, pageSurface } from '@/lib/theme/surface'
import { isMegaThemeId } from '@/lib/theme/mega-theme'
import { readSiteStyle, sitePageStyle, SITE_THEMES, siteLook, spacePageDefaultAccent, spacePageSiteFaces, THEME_LOOK } from '@/lib/theme/site-style'
import { THEME_LIBRARY, themeIdFromSlug, themePagePath, themeSlug } from '@/lib/themes/library'
import { THEME_KIT_PAGE_IDS } from '@/components/frequency/site/pages/themes/frequency-theme-kit'
import { WIZARD_THEMES } from '@/lib/spaces/create-wizard'
import {
  NETWORK_KIT_ACCENT,
  NETWORK_KIT_PROFILES,
  NETWORK_KIT_PROFILE_SCHEME,
  NETWORK_KIT_SCHEMES,
  NETWORK_KIT_SCHEME_ORDER,
  NETWORK_KIT_SEASONS,
  NETWORK_KIT_SURFACE,
  NETWORK_KIT_TOKENS_CSS,
  networkKitAccentFamily,
  networkKitAccentVars,
  networkKitLuma,
  networkKitProfileScheme,
  networkKitScheme,
} from './network-kit'

const nk = contract.themes.NetworkKit

describe('the Network Theme Kit schemes', () => {
  it.each(NETWORK_KIT_SCHEME_ORDER)('%s reads at AA wherever text meets a ground', (id) => {
    const s = NETWORK_KIT_SCHEMES[id]
    // Text steps on paper, the card surface, the card tint and its pressed step (the design's subtle text missed AA on the tint).
    for (const fg of [s.ink, s.ink2, s.muted, s.subtle]) {
      for (const bg of [s.paper, s.white, s.card, s.card2]) expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
    // The accent's text shade on paper, surface, tint and its own wash.
    for (const bg of [s.paper, s.white, s.card, s.accentBg]) expect(contrastRatio(s.accentText, bg), `${s.accentText} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    // The label on the fill and on its hover.
    expect(contrastRatio(s.onAccent, s.accent), 'label on accent').toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(s.onAccent, s.accentHover), 'label on hover').toBeGreaterThanOrEqual(4.5)
    // The ink band.
    for (const fg of [s.onInkMuted, s.onInkSubtle]) expect(contrastRatio(fg, s.ink), `${fg} on ink`).toBeGreaterThanOrEqual(4.5)
  })

  it('draws the edge of a light accent in ink, so a switch or meter holds 3:1 against paper', () => {
    for (const id of NETWORK_KIT_SCHEME_ORDER) {
      const s = NETWORK_KIT_SCHEMES[id]
      const edge = contrastRatio(s.accent, s.paper) >= 3 ? s.accent : s.ink
      expect(contrastRatio(edge, s.paper), id).toBeGreaterThanOrEqual(3)
      expect(NETWORK_KIT_TOKENS_CSS).toContain(`--nk-accent-edge:${edge}`)
    }
    expect(networkKitAccentFamily('#E9B949').edge).toBe(NETWORK_KIT_SCHEMES.marigold.ink)
    expect(networkKitAccentFamily('#1F6FA8', NETWORK_KIT_SCHEMES.ocean).edge).toBe('#1F6FA8')
  })

  it('keeps the design values apart from the two measured deviations', () => {
    // The design's own hero colours, in the design's order.
    expect(NETWORK_KIT_SCHEME_ORDER.map((id) => NETWORK_KIT_SCHEMES[id].accent)).toEqual(['#E9B949', '#EE7655', '#1F6FA8', '#22796E'])
    // The same hero colours the earlier Network theme wears: one palette, two themes.
    for (const id of ['marigold', 'ocean', 'lagoon', 'coral'] as const) expect(NETWORK_KIT_SCHEMES[id].accent).toBe(NETWORK_SCHEMES[id].accent)
    // Only the subtle text and Coral's label differ from the design.
    expect(NETWORK_KIT_SCHEMES.marigold.subtle).not.toBe('#676E73')
    expect(NETWORK_KIT_SCHEMES.coral.onAccent).toBe('#0E1D25')
  })

  it('maps the thirteen profiles onto four schemes', () => {
    expect(NETWORK_KIT_PROFILES).toHaveLength(13)
    expect(Object.keys(NETWORK_KIT_PROFILE_SCHEME).sort()).toEqual([...NETWORK_KIT_PROFILES].sort())
    for (const [scheme, profiles] of Object.entries({
      marigold: ['general', 'networks', 'clubs', 'markets'],
      coral: ['hosts', 'creators', 'wellness'],
      ocean: ['studios', 'nonprofits', 'schools'],
      lagoon: ['coaches', 'venues', 'faith'],
    })) for (const p of profiles) expect(networkKitProfileScheme(p), p).toBe(scheme)
    expect(networkKitProfileScheme('nope')).toBe('marigold')
    // The editor contract agrees profile by profile.
    for (const p of NETWORK_KIT_PROFILES) expect(nk.profiles[p].scheme, p).toBe(NETWORK_KIT_PROFILE_SCHEME[p])
  })

  it('reads a scheme from the owner accent', () => {
    expect(networkKitScheme(null)).toBe('marigold')
    expect(networkKitScheme('#1f6fa8')).toBe('ocean')
    expect(networkKitScheme('#123456')).toBe('marigold')
  })
})

describe('deriving a family from an owner accent', () => {
  it('uses the design rules: 86% hover, 34% soft, 10% bg, ink on a light accent, white on a dark one', () => {
    const f = networkKitAccentFamily('#EE7655', NETWORK_KIT_SCHEMES.coral)
    expect(f.hover).toBe('color-mix(in srgb, #EE7655 86%, black)')
    expect(f.soft).toBe('color-mix(in srgb, #EE7655 34%, #FBF7F3)')
    expect(f.bg).toBe('color-mix(in srgb, #EE7655 10%, #FBF7F3)')
    expect(networkKitLuma('#E9B949')).toBeGreaterThan(0.55)
    expect(networkKitLuma('#1F6FA8')).toBeLessThan(0.55)
    expect(networkKitAccentFamily('#E9B949').onAccent).toBe(NETWORK_KIT_SCHEMES.marigold.ink)
    expect(networkKitAccentFamily('#1F6FA8', NETWORK_KIT_SCHEMES.ocean).onAccent).toBe('#FFFFFF')
  })

  it('measures every label and text shade it hands out', () => {
    for (const hex of ['#E9B949', '#EE7655', '#1F6FA8', '#22796E', '#7BC47F', '#C0392B', '#F4D35E', '#3D348B', '#00A6A6']) {
      const f = networkKitAccentFamily(hex)
      expect(contrastRatio(f.onAccent, hex), `label on ${hex}`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(f.text, NETWORK_KIT_SCHEMES.marigold.paper), `text for ${hex}`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(f.text, NETWORK_KIT_SCHEMES.marigold.card), `text for ${hex} on tint`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('takes the better label when neither reaches AA (a mid grey)', () => {
    const f = networkKitAccentFamily('#888888')
    const other = f.onAccent === '#FFFFFF' ? NETWORK_KIT_SCHEMES.marigold.ink : '#FFFFFF'
    expect(contrastRatio(f.onAccent, '#888888')).toBeGreaterThanOrEqual(contrastRatio(other, '#888888'))
  })

  it('sets the Space primary family and the design brand hooks together', () => {
    const own = networkKitAccentVars(null)
    expect(own['--color-primary']).toBe('#E9B949')
    expect(own['--color-text-on-primary']).toBe('#1F3440')
    expect(own['--brand-accent']).toBe('#E9B949')
    expect(networkKitAccentVars('#1F6FA8')['--color-primary-hover']).toBe('#1B5F90')
    const custom = networkKitAccentVars('#7BC47F')
    expect(custom['--color-primary']).toBe('#7BC47F')
    expect(custom['--brand-accent-soft']).toContain('7BC47F 34%')
    expect(NETWORK_KIT_ACCENT).toEqual({ accent: NETWORK_KIT_SCHEMES.marigold.accent, text: NETWORK_KIT_SCHEMES.marigold.accentText, on: NETWORK_KIT_SCHEMES.marigold.onAccent, bg: NETWORK_KIT_SCHEMES.marigold.accentBg })
    expect(NETWORK_KIT_ACCENT.accent).toBe('#E9B949')
  })
})

describe('the Network Theme Kit token block', () => {
  it('is scoped to the kit root and the schemes come before the base, so the base is what a flat reader sees', () => {
    expect(NETWORK_KIT_TOKENS_CSS).toContain('[data-house-theme="network-kit"]{color-scheme:light;')
    expect(NETWORK_KIT_TOKENS_CSS.indexOf('[data-scheme="coral"]')).toBeLessThan(NETWORK_KIT_TOKENS_CSS.indexOf('[data-house-theme="network-kit"]{color-scheme'))
    for (const id of NETWORK_KIT_SCHEME_ORDER) expect(NETWORK_KIT_TOKENS_CSS).toContain(`[data-scheme="${id}"]`)
  })

  it('reads the faces from the next/font variables, one type system for every profile', () => { // each carries its named face as the var() fallback, so a render with no next/font (the editor canvas, a harness) still reads the faces
    for (const v of ['--font-nk-bricolage', '--font-nk-outfit', '--font-nk-instrument', '--font-nk-caveat']) expect(NETWORK_KIT_TOKENS_CSS).toContain(`var(${v},`)
    expect(NETWORK_KIT_TOKENS_CSS).not.toMatch(/Literata|Cormorant|Syne|Unbounded|Playfair/)
  })

  it('reads the owner accent through the design brand hooks and keeps the earlier Network vocabulary out', () => {
    // AccentScope wraps the kit root, so the kit root must not hold a literal primary: its primary is the design's chain
    // (--color-primary -> --color-accent -> --brand-accent, which networkKitAccentVars sets on the wrapper).
    expect(NETWORK_KIT_TOKENS_CSS).not.toMatch(/--color-primary[a-z-]*:#/)
    expect(NETWORK_KIT_TOKENS_CSS).toContain('--color-primary:var(--color-accent)')
    expect(NETWORK_KIT_TOKENS_CSS).not.toContain('--nw-')
    expect(NETWORK_KIT_TOKENS_CSS).toContain('var(--brand-accent,var(--nk-acc))')
  })

  it('stops motion for people who ask, and keeps every band out of the violet hues', () => {
    expect(NETWORK_KIT_TOKENS_CSS).toMatch(/prefers-reduced-motion:reduce\)\{\[data-house-theme="network-kit"\]\[data-house-theme\]\{--nk-motion-fast:0ms/)
    for (const s of Object.values(NETWORK_KIT_SCHEMES)) for (const hex of [s.accent, s.accentText, s.accentDeep, s.ink, s.paper]) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      const max = Math.max(r!, g!, b!), min = Math.min(r!, g!, b!)
      if (max === min) continue
      const d = max - min
      const h = (max === r ? ((g! - b!) / d) % 6 : max === g ? (b! - r!) / d + 2 : (r! - g!) / d + 4) * 60
      const hue = (h + 360) % 360
      expect(hue < 250 || hue > 290, `${hex} hue ${hue}`).toBe(true)
    }
  })
})

describe('the editor contract', () => {
  it('matches the canvas, the fonts and the scheme values', () => {
    const vars = websiteThemeVars('NetworkKit', null) as Record<string, string>
    for (const [key, value] of Object.entries(nk)) if (typeof value === 'string') expect(vars[key], key).toBe(value)
    expect(WEBSITE_THEME_FONT_VARS.NetworkKit).toEqual(['nk-bricolage', 'nk-outfit', 'nk-outfit'])
    expect(nk['--th-accent']).toBe(NETWORK_KIT_ACCENT.accent)
    expect(nk['--th-muted']).toBe(NETWORK_KIT_SCHEMES.marigold.subtle)
    expect(NETWORK_KIT_SEASONS).toEqual({ winter: '#1F6FA8', spring: '#22796E', summer: '#E9B949', fall: '#EE7655' })
    for (const p of NETWORK_KIT_PROFILES) {
      const scheme = NETWORK_KIT_SCHEMES[NETWORK_KIT_PROFILE_SCHEME[p]]
      expect([nk.profiles[p].accent, nk.profiles[p].muted, nk.profiles[p].onAccent, nk.profiles[p].bg], p).toEqual([scheme.accent, scheme.subtle, scheme.onAccent, scheme.paper])
    }
  })

  it('leaves the earlier Network entry as it was', () => {
    expect(contract.themes.Network['--th-muted']).toBe('#666D72')
    expect(contract.themes.Network['--th-season']).toBe('#22303A')
    expect(Object.keys(contract.themes.Network)).not.toContain('profiles')
    expect((websiteThemeVars('Network', '#1F6FA8') as Record<string, string>)['--th-accent']).toBe('#1F6FA8')
  })
})

describe('registered as a site theme, with the earlier network theme still rendering but offered nowhere', () => {
  it('resolves from a saved site style and keeps the earlier theme', () => {
    expect(readSiteStyle({ siteStyle: { theme: 'network-kit' } }).theme).toBe('network-kit')
    expect(readSiteStyle({ siteStyle: { theme: 'network' } }).theme).toBe('network')
    expect(siteLook(readSiteStyle({ siteStyle: { theme: 'network-kit' } }))).toEqual(THEME_LOOK['network-kit'])
    expect(THEME_LOOK['network-kit']).toEqual({ corners: 'soft', spacing: 'airy', header: 'bar', footer: 'full' })
    expect(isMegaThemeId('network-kit')).toBe(true)
    expect(initialWebsiteTheme({ siteStyle: { theme: 'network-kit' } })).toBe('NetworkKit')
    expect(initialWebsiteTheme({ siteStyle: { theme: 'network' } })).toBe('Network')
  })

  it('still resolves and renders a saved network site, and offers it in no picker', () => {
    const saved = { siteStyle: { theme: 'network', synced: true } }
    expect(readSiteStyle(saved).theme).toBe('network')
    expect(readSiteStyle(saved).fonts).toBe('frequency')
    expect(sitePageStyle(readSiteStyle({ siteStyle: { theme: 'bold', pages: { about: 'network' } } }), 'about')).toMatchObject({ theme: 'network', fonts: 'modern' })
    expect(spacePageDefaultAccent(saved, '#000000')).toBe('#E9B949')
    expect(spacePageSiteFaces(saved)).toBe('network')
    expect(isMegaThemeId('network')).toBe(true)
    // Pickers: site themes, library and its pages, wizard, Spotlight presets, editor rail, drafts.
    expect(SITE_THEMES.map((t) => t.id)).not.toContain('network')
    expect(THEME_LIBRARY.map((t) => t.id)).not.toContain('network')
    expect(THEME_KIT_PAGE_IDS).not.toContain('network')
    expect(WIZARD_THEMES.map((t) => t.id)).not.toContain('network')
    expect(THEME_PRESETS.map((p) => p.id)).not.toContain('network')
    expect(themeIdFromSlug('network-classic')).not.toBe('network')
  })

  it('gives the Space page the kit faces and accent only, never a ground', () => {
    expect(spacePageSiteFaces({ siteStyle: { theme: 'network-kit', synced: true } })).toBe('network-kit')
    expect(spacePageSiteFaces({ siteStyle: { theme: 'network-kit', synced: false } })).toBeNull()
    expect(spacePageDefaultAccent({ siteStyle: { theme: 'network-kit' } }, '#000000')).toBe('#E9B949')
    expect(pageSurface({ megaTheme: { theme: 'network-kit' } })).toBeNull()
    expect(emailSurface({ megaTheme: { theme: 'network-kit' } })).toBe(NETWORK_KIT_SURFACE)
  })

  it('dresses Spotlight and email from one flat token set that reads', () => {
    expect(contrastRatio(NETWORK_KIT_SURFACE.text, NETWORK_KIT_SURFACE.canvas)).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(NETWORK_KIT_SURFACE.onSolid, NETWORK_KIT_SURFACE.solid)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(NETWORK_KIT_SURFACE.subtle, NETWORK_KIT_SURFACE.elevated)).toBeGreaterThanOrEqual(4.5)
    const preset = THEME_PRESETS.find((p) => p.id === 'network-kit')!
    expect(preset.label).toBe('Network')
    expect(preset.theme.accent).toBe('#e9b949')
    expect(validateSpotlightTheme(preset.theme)).toBeTruthy()
  })

  it('lives at /themes/network, and the earlier theme has no page', () => {
    expect(themePagePath('network-kit')).toBe('/themes/network')
    expect(themePagePath('midnight')).toBe('/themes/nocturne')
    expect(themePagePath('temple')).toBe('/themes/temple')
    expect(themeSlug('network-kit')).toBe('network')
    expect(themeIdFromSlug('network')).toBe('network-kit')
    expect(themeIdFromSlug('network-classic')).toBe('network-classic')
    expect(themeIdFromSlug('network-kit')).toBeNull()
    expect(themeIdFromSlug('temple')).toBe('temple')
  })
})
