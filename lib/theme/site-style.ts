import { MENSWORK_PALETTE } from '@/lib/theme/menswork'
import { WILDHEART_PALETTE } from '@/lib/theme/wildheart'
import { DEFAULT_SPACE_THEME, isSpaceThemeId, parseSpaceTheme, type SpaceThemeId } from '@/lib/theme/space-themes'

// THE SITE STYLE (owner ask 2026-10-11, ADR-1726). A Space and its website wear one of three THEMES:
//
//   · Frequency (the default): the house look danieltyack.com wears (components/sites/house-css.ts).
//   · Bold: the look Heart on Fire wears, until now called Menswork (components/sites/menswork-css.ts).
//   · Wildheart (2026-10-12): light, ancient and organic; parchment, violet, petal corners and the astrology
//     calendar (components/sites/wildheart-css.ts, lib/theme/wildheart.ts). A stock theme: nothing applies
//     it on its own; an owner picks it in Identity and branding or the website editor's Theme tab.
//
// Inside a theme the owner picks a FONT SET (lib/theme/space-themes.ts: Frequency, Editorial, Classic,
// Playful, Accessible, Modern, Bold). The website's style leads: the Space page follows it unless the
// owner turns syncing off, and then the Space page keeps its own fonts.
//
// STORED: `preferences.theme` stays the website's font set (every existing value keeps working), and
// `preferences.siteStyle` holds the rest: `{ theme, synced, spaceFonts }`. A Space that never saved a
// style reads from its legacy font set: `menswork` meant the Bold theme, anything else Frequency.
//
// GLOBAL STYLES (ADR-1728): on top of the theme the owner can set CORNERS (soft, subtle, square), SPACING
// (airy, balanced, compact), the HEADER (a floating pill or a full-width bar) and the FOOTER (full or
// minimal). Each is stored only when the owner picked it (`null` means "the theme's own"), so switching
// themes keeps an explicit choice and otherwise brings the new theme's defaults.
//
// A THEME PER PAGE (LIVE-699): `preferences.siteStyle.pages` maps a page slug to its own theme. A page with
// no entry wears the site's theme ("same as site", the default); a page on the other theme wears that
// theme's own fonts and shapes, and the owner's explicit global style choices still hold. The site's theme
// stays the one source for every page that has not said otherwise.
//
// Pure and fail-safe: a malformed node reads as the defaults.

export type SiteThemeId = 'frequency' | 'bold' | 'wildheart'

interface SiteThemeDef {
  id: SiteThemeId
  label: string
  description: string
  /** The font set a Space gets when it switches to this theme. */
  defaultFonts: SpaceThemeId
}

export const SITE_THEMES: readonly SiteThemeDef[] = [
  {
    id: 'frequency',
    label: 'Frequency',
    description: 'Warm, bright and airy: soft cards, a frosted menu bar and generous space.',
    defaultFonts: 'frequency',
  },
  {
    id: 'bold',
    label: 'Bold',
    description: 'Dark, graphic and direct: charcoal, a bright accent and angled cuts.',
    defaultFonts: 'menswork',
  },
  {
    // The Space page stays typography-only (ADR-578): Wildheart's own faces load on the website alone, so
    // a synced Space page wears the Classic serif pairing, the nearest set the root layout already carries.
    id: 'wildheart',
    label: 'Wildheart',
    description: 'Light, ancient and organic: parchment, violet, soft petal corners and a turning sky.',
    defaultFonts: 'classic',
  },
]

const DEFAULT_SITE_THEME: SiteThemeId = 'frequency'

type SiteCorners = 'soft' | 'subtle' | 'square'
type SiteSpacing = 'airy' | 'balanced' | 'compact'
type SiteHeader = 'pill' | 'bar'
type SiteFooter = 'full' | 'minimal'

/** The global style choices, in the order the editors offer them, each option with its owner-facing label. */
export const SITE_LOOK_OPTIONS = {
  corners: [
    { id: 'soft', label: 'Soft' },
    { id: 'subtle', label: 'Subtle' },
    { id: 'square', label: 'Square' },
  ],
  spacing: [
    { id: 'airy', label: 'Airy' },
    { id: 'balanced', label: 'Balanced' },
    { id: 'compact', label: 'Compact' },
  ],
  header: [
    { id: 'pill', label: 'Floating pill' },
    { id: 'bar', label: 'Full-width bar' },
  ],
  footer: [
    { id: 'full', label: 'Full' },
    { id: 'minimal', label: 'Minimal' },
  ],
} as const satisfies Record<string, readonly { id: string; label: string }[]>

export type SiteLookKey = keyof typeof SITE_LOOK_OPTIONS

/** What each theme looks like before the owner changes anything (today's Frequency and Bold sites). */
export const THEME_LOOK: Record<SiteThemeId, SiteLook> = {
  frequency: { corners: 'soft', spacing: 'airy', header: 'pill', footer: 'minimal' },
  bold: { corners: 'square', spacing: 'balanced', header: 'bar', footer: 'full' },
  wildheart: { corners: 'soft', spacing: 'airy', header: 'bar', footer: 'full' },
}

export interface SiteLook {
  corners: SiteCorners
  spacing: SiteSpacing
  header: SiteHeader
  footer: SiteFooter
}

export interface SiteStyle {
  theme: SiteThemeId
  /** The website's font set. */
  fonts: SpaceThemeId
  /** The Space page follows the website's style. */
  synced: boolean
  /** The Space page's own font set, used only while `synced` is off. */
  spaceFonts: SpaceThemeId
  /** The owner's global style choices; `null` keeps the theme's own. */
  look: { [K in SiteLookKey]: SiteLook[K] | null }
  /** Pages that wear their own theme, by slug. A page not listed wears the site's (LIVE-699). */
  pages?: Record<string, SiteThemeId>
}

/** A page slug as the website stores it; the cap keeps a hostile node from growing without bound. */
const PAGE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_PAGE_THEMES = 30

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function isSiteThemeId(v: unknown): v is SiteThemeId {
  return v === 'frequency' || v === 'bold' || v === 'wildheart'
}

export function readSiteStyle(preferences: unknown): SiteStyle {
  const fonts = parseSpaceTheme(preferences)
  const node = record(preferences) && record(preferences.siteStyle) ? preferences.siteStyle : null
  const theme: SiteThemeId = isSiteThemeId(node?.theme) ? node.theme : fonts === 'menswork' ? 'bold' : DEFAULT_SITE_THEME
  const synced = node?.synced !== false
  const spaceFonts = typeof node?.spaceFonts === 'string' && isSpaceThemeId(node.spaceFonts) ? node.spaceFonts : fonts
  const pick = <K extends SiteLookKey>(key: K): SiteLook[K] | null => {
    const v = node?.[key]
    return SITE_LOOK_OPTIONS[key].some((o) => o.id === v) ? (v as SiteLook[K]) : null
  }
  return { theme, fonts, synced, spaceFonts, look: { corners: pick('corners'), spacing: pick('spacing'), header: pick('header'), footer: pick('footer') }, pages: readPageThemes(node?.pages) }
}

function readPageThemes(raw: unknown): Record<string, SiteThemeId> {
  if (!record(raw)) return {}
  const out: Record<string, SiteThemeId> = {}
  for (const [slug, theme] of Object.entries(raw).slice(0, MAX_PAGE_THEMES)) {
    if (slug.length <= 64 && PAGE_SLUG.test(slug) && isSiteThemeId(theme)) out[slug] = theme
  }
  return out
}

/** The style ONE PAGE wears: the site style, with the page's own theme when it has one. A page on the other
 *  theme takes that theme's own fonts; the owner's explicit corners, spacing, header and footer still hold,
 *  and anything left to "the theme's own" follows the page's theme (siteLook). */
export function readSitePageStyle(preferences: unknown, pageSlug: string): SiteStyle {
  const style = readSiteStyle(preferences)
  const theme = style.pages?.[pageSlug]
  if (!theme || theme === style.theme) return style
  return { ...style, theme, fonts: SITE_THEMES.find((t) => t.id === theme)!.defaultFonts }
}

/** Give a page its own theme, or clear it (null) so it wears the site's again. An invalid slug is ignored. */
export function withSitePageTheme(preferences: unknown, pageSlug: string, theme: SiteThemeId | null): Record<string, unknown> {
  const current = readSiteStyle(preferences)
  if (!PAGE_SLUG.test(pageSlug) || pageSlug.length > 64) return withSiteStyle(preferences, {})
  const pages = { ...current.pages }
  if (theme === null) delete pages[pageSlug]
  else pages[pageSlug] = theme
  return withSiteStyle(preferences, { pages })
}

/** Whether a value is one of a global style's options. */
export function isSiteLookValue<K extends SiteLookKey>(key: K, v: unknown): v is SiteLook[K] {
  return SITE_LOOK_OPTIONS[key].some((o) => o.id === v)
}

/** The global styles a site wears: each owner choice, else its theme's own. */
export function siteLook(style: SiteStyle): SiteLook {
  const base = THEME_LOOK[style.theme]
  return {
    corners: style.look.corners ?? base.corners,
    spacing: style.look.spacing ?? base.spacing,
    header: style.look.header ?? base.header,
    footer: style.look.footer ?? base.footer,
  }
}

/** The global styles that differ from the theme's own: the only ones the website has to restyle. */
export function siteLookOverrides(style: SiteStyle): Partial<SiteLook> {
  const look = siteLook(style)
  const base = THEME_LOOK[style.theme]
  return Object.fromEntries((Object.keys(look) as SiteLookKey[]).filter((k) => look[k] !== base[k]).map((k) => [k, look[k]]))
}

/** The theme the website wears. */
export function siteTheme(preferences: unknown): SiteThemeId {
  return readSiteStyle(preferences).theme
}

/** The font set the SPACE PAGE renders in: the website's while synced, else the Space page's own. */
export function spacePageFonts(preferences: unknown): SpaceThemeId {
  const style = readSiteStyle(preferences)
  return style.synced ? style.fonts : style.spaceFonts
}

/** Write a style change, keeping every other preferences key. The website font set stays on
 *  `preferences.theme` (sparse: the default clears it); the rest lives on `preferences.siteStyle`. */
export function withSiteStyle(preferences: unknown, patch: Partial<SiteStyle>): Record<string, unknown> {
  const next = { ...(record(preferences) ? preferences : {}) }
  const current = readSiteStyle(preferences)
  const style: SiteStyle = { ...current, ...patch }
  if (style.fonts === DEFAULT_SPACE_THEME) delete next.theme
  else next.theme = style.fonts
  const look = Object.fromEntries(Object.entries(style.look).filter(([, v]) => v !== null))
  const pages = readPageThemes(style.pages)
  next.siteStyle = { theme: style.theme, synced: style.synced, spaceFonts: style.spaceFonts, ...look, ...(Object.keys(pages).length ? { pages } : {}) }
  return next
}

/** The accent a Space page falls back to when the owner picked none. A synced Space page on a Bold
 *  website wears Bold's fonts and Bold's teal, on a Wildheart website Wildheart's violet, but keeps the
 *  app's own surfaces and layout so member pages stay readable (ADR-1728); any other Space page keeps its
 *  type's default. */
export function spacePageDefaultAccent(preferences: unknown, typeDefault: string): string {
  const style = readSiteStyle(preferences)
  if (!style.synced) return typeDefault
  return style.theme === 'bold' ? MENSWORK_PALETTE.teal : style.theme === 'wildheart' ? WILDHEART_PALETTE.violet : typeDefault
}
