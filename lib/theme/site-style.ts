import { MENSWORK_PALETTE } from '@/lib/theme/menswork'
import { WILDHEART_PALETTE } from '@/lib/theme/wildheart'
import { NETWORK_SCHEMES } from '@/lib/theme/network'
import { NETWORK_KIT_ACCENT } from '@/lib/theme/network-kit-accent'
import { TEMPLE_ACCENT } from '@/lib/theme/temple'
import { MIDNIGHT_ACCENT } from '@/lib/theme/midnight'
import { TEMPLE_KIT_ACCENT } from '@/lib/theme/temple-kit'
import { DESIGNER_ACCENT } from '@/lib/theme/designer'
import { DEFAULT_SPACE_THEME, isSpaceThemeId, parseSpaceTheme, type SpaceThemeId } from '@/lib/theme/space-themes'
import type { SiteFacesId } from '@/lib/theme/site-faces'
import { readMegaTheme } from '@/lib/theme/mega-theme'

// THE SITE STYLE (owner ask 2026-10-11, ADR-1726). A Space and its website wear one of four THEMES:
//
//   · Frequency (the default): the house look danieltyack.com wears (components/sites/house-css.ts).
//   · Bold: the look Heart on Fire wears, until now called Menswork (components/sites/menswork-css.ts).
//   · Wildheart (2026-10-12): light, ancient and organic; parchment, violet, petal corners and the astrology
//     calendar (components/sites/wildheart-css.ts, lib/theme/wildheart.ts). A stock theme: nothing applies
//     it on its own; an owner picks it in Identity and branding or the website editor's Theme tab.
//   · Network (2026-10-13): coastal and warm for community and business groups; butter-cream grounds, deep
//     ink, one solid hero color in four schemes (Marigold, Ocean, Lagoon, Coral), pill buttons and soft
//     28px cards (components/sites/network-css.ts, lib/theme/network.ts). A stock theme, first worn by The Group.
//   · Network Theme Kit (2026-10-28, code id `network-kit`, shown as Network; the earlier `network` theme above is no longer offered):
//     the Network design system's paper, card tint and deep ink with one solid hero color in four schemes
//     (lib/theme/network-kit.ts). Published to a live site (WEBSITE_THEMES_LIVE).
//   · Temple Theme Kit (2026-10-28, code id `temple-kit`, shown as Temple; the earlier `temple` theme below is no longer offered):
//     the Temple design system's plaster, umber and one clay accent, thirteen profile accents (lib/theme/temple-kit.ts).
//     Not published to a live site until its render is finished.
//   · Temple (2026-10-22): a lime-washed Mediterranean house; plaster grounds, umber ink, one clay hero color,
//     arch-shaped photos and cards, Branch and Marcellus type (components/sites/temple-css.ts,
//     lib/theme/temple.ts). A stock theme, first worn by Royal Temple.
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

export type SiteThemeId = 'frequency' | 'bold' | 'wildheart' | 'network' | 'network-kit' | 'temple' | 'temple-kit' | 'midnight' | 'designer'

interface SiteThemeDef {
  id: SiteThemeId
  label: string
  description: string
  /** The font set a Space gets when it switches to this theme. */
  defaultFonts: SpaceThemeId
}

/** Every theme a site can wear, offered or not: the validator, the render maps and the defaults read this. */
export const SITE_THEME_DEFS: readonly SiteThemeDef[] = [
  {
    // Labelled Default since ADR-1748 (2026-10-13): "Frequency" now names the platform's design system.
    // The id stays `frequency`, because it is the value every saved site style holds.
    id: 'frequency',
    label: 'Default',
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
  {
    // Typography-only on the Space page too (ADR-578): Bricolage Grotesque and Outfit load on the website
    // alone, so a synced Space page wears Modern (a crisp geometric headline over friendly body text).
    id: 'network',
    // Not offered in any picker since 2026-10-28 (SITE_THEMES below leaves it out): the new Network Theme Kit took the
    // name. The id, label and every render map stay, because The Group's live site and any saved site style wear it.
    label: 'Network',
    description: 'Coastal and warm: butter-cream grounds, one bold color, pill buttons and real photos up front.',
    defaultFonts: 'modern',
  },
  {
    // Typography-only on the Space page too (ADR-578): the Network Theme Kit's faces load on the website alone, so
    // a synced Space page wears Modern, as the earlier Network does. Published to a live site since 2026-10-29
    // (WEBSITE_THEMES_LIVE), once its pages and thirteen profile kits shipped.
    id: 'network-kit',
    label: 'Network',
    description: 'The new Network Theme Kit: paper, card tint and deep ink with one solid hero color in four schemes, pill buttons and real photos up front.',
    defaultFonts: 'modern',
  },
  {
    // Typography-only on the Space page too (ADR-578): Branch and Marcellus load on the website alone, so a
    // synced Space page wears Classic (a serif headline over a quiet body).
    // Not offered in any picker since 2026-10-28 (SITE_THEMES below leaves it out): the Temple Theme Kit took the name.
    // The id, label and every render map stay, because Royal Temple's live site and any saved site style wear it.
    id: 'temple',
    label: 'Temple',
    description: 'A lime-washed house: plaster and umber, one clay color, arched photos and cards, warm and unhurried.',
    defaultFonts: 'classic',
  },
  {
    // THE TEMPLE THEME KIT (id `temple-kit`, shown as Temple): the Temple owners pick and the /themes page shows. The
    // older `temple` entry above (Royal Temple) leaves the pickers. On the Space page a synced Temple website wears the
    // kit's DISPLAY face only (Marcellus, spacePageSiteFaces; ADR-1728, ADR-1906): the body, the UI and every size stay
    // Frequency's, and Branch, Jost and Cormorant load on the website alone. Not published to a
    // live site until its render is finished (WEBSITE_THEMES_LIVE).
    id: 'temple-kit',
    label: 'Temple',
    description: 'Warm plaster and umber with one clay color, arches and soft corners, for every kind of gathering.',
    defaultFonts: 'classic',
  },
  {
    // Typography-only on the Space page too (ADR-578): Bodoni Moda, Marcellus and Geist load on the website
    // alone, so a synced Space page wears Classic (a serif headline over a quiet body).
    id: 'midnight',
    // Shown as Nocturne since 2026-10-27. The id stays `midnight`: it is the value every saved site style holds.
    label: 'Nocturne',
    description: 'After dark: deep night grounds, bone type, one violet accent, square frames and monochrome photos.',
    defaultFonts: 'classic',
  },
  {
    // Typography-only on the Space page too (ADR-578): Cormorant and Jost load on the website alone, so a
    // synced Space page wears Classic (a serif headline over a quiet body).
    id: 'designer',
    label: 'Designer',
    description: 'Limewash and daylight: plaster grounds, charcoal type, one ochre accent, arched photos and a quiet serif.',
    defaultFonts: 'classic',
  },
]

/** Themes a person can pick (gallery, editor, wizard). The earlier `network` and `temple` themes are worn by live sites and no longer offered. */
const RETIRED_FROM_PICKERS: ReadonlySet<SiteThemeId> = new Set(['network', 'temple'])
export const SITE_THEMES: readonly SiteThemeDef[] = SITE_THEME_DEFS.filter((t) => !RETIRED_FROM_PICKERS.has(t.id))

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
  network: { corners: 'soft', spacing: 'airy', header: 'bar', footer: 'full' },
  'network-kit': { corners: 'soft', spacing: 'airy', header: 'bar', footer: 'full' },
  temple: { corners: 'soft', spacing: 'airy', header: 'bar', footer: 'full' },
  'temple-kit': { corners: 'soft', spacing: 'airy', header: 'bar', footer: 'full' },
  midnight: { corners: 'square', spacing: 'airy', header: 'bar', footer: 'full' },
  designer: { corners: 'soft', spacing: 'airy', header: 'bar', footer: 'full' },
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
  return v === 'frequency' || v === 'bold' || v === 'wildheart' || v === 'network' || v === 'network-kit' || v === 'temple' || v === 'temple-kit' || v === 'midnight' || v === 'designer'
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
  return sitePageStyle(readSiteStyle(preferences), pageSlug)
}

/** readSitePageStyle over a style already in hand: the website editor resolves its canvas through this with
 *  its live (unsaved) style, so the preview and the published page pick the same theme and fonts. */
export function sitePageStyle(style: SiteStyle, pageSlug: string): SiteStyle {
  const theme = style.pages?.[pageSlug]
  if (!theme || theme === style.theme) return style
  return { ...style, theme, fonts: SITE_THEME_DEFS.find((t) => t.id === theme)!.defaultFonts }
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

/** The website faces a Space page wears: its website's, when the page is synced to a theme with its own. */
export function spacePageSiteFaces(preferences: unknown): SiteFacesId | null {
  // A Space that chose the Midnight Mega Theme wears its faces whatever the sync switch says, as its ground does.
  if (readMegaTheme(preferences).theme === 'midnight') return 'midnight'
  const style = readSiteStyle(preferences)
  if (!style.synced) return null
  return style.theme === 'network' || style.theme === 'network-kit' || style.theme === 'designer' || style.theme === 'temple-kit' || style.theme === 'wildheart' || style.theme === 'midnight' ? style.theme : null
}

/** The font set a Space wears INSIDE Frequency (member and admin routes): its own, never the website's.
 *  A white-label website theme never styles a Frequency member or admin area (Daniel, 2026-10-27). */
export function memberSpaceFonts(preferences: unknown): SpaceThemeId {
  return readSiteStyle(preferences).spaceFonts
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
 *  website wears Bold's fonts and Bold's teal, on a Wildheart website Wildheart's violet, on a Network
 *  website Network's marigold, on a Temple website Temple's clay, but keeps the
 *  app's own surfaces and layout so member pages stay readable (ADR-1728); any other Space page keeps its
 *  type's default. */
export function spacePageDefaultAccent(preferences: unknown, typeDefault: string): string {
  const style = readSiteStyle(preferences)
  if (!style.synced) return typeDefault
  if (style.theme === 'network') return NETWORK_SCHEMES.marigold.accent
  if (style.theme === 'network-kit') return NETWORK_KIT_ACCENT.accent
  if (style.theme === 'temple') return TEMPLE_ACCENT.accent
  if (style.theme === 'temple-kit') return TEMPLE_KIT_ACCENT.accent
  if (style.theme === 'midnight') return MIDNIGHT_ACCENT.accent
  if (style.theme === 'designer') return DESIGNER_ACCENT.accent
  return style.theme === 'bold' ? MENSWORK_PALETTE.teal : style.theme === 'wildheart' ? WILDHEART_PALETTE.violet : typeDefault
}
