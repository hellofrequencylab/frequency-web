import { DEFAULT_SPACE_THEME, isSpaceThemeId, parseSpaceTheme, type SpaceThemeId } from '@/lib/theme/space-themes'

// THE SITE STYLE (owner ask 2026-10-11, ADR-1726). A Space and its website wear one of two THEMES:
//
//   · Frequency (the default): the house look danieltyack.com wears (components/sites/house-css.ts).
//   · Bold: the look Heart on Fire wears, until now called Menswork (components/sites/menswork-css.ts).
//
// Inside a theme the owner picks a FONT SET (lib/theme/space-themes.ts: Frequency, Editorial, Classic,
// Playful, Accessible, Modern, Bold). The website's style leads: the Space page follows it unless the
// owner turns syncing off, and then the Space page keeps its own fonts.
//
// STORED: `preferences.theme` stays the website's font set (every existing value keeps working), and
// `preferences.siteStyle` holds the rest: `{ theme, synced, spaceFonts }`. A Space that never saved a
// style reads from its legacy font set: `menswork` meant the Bold theme, anything else Frequency.
//
// Pure and fail-safe: a malformed node reads as the defaults.

export type SiteThemeId = 'frequency' | 'bold'

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
]

const DEFAULT_SITE_THEME: SiteThemeId = 'frequency'

export interface SiteStyle {
  theme: SiteThemeId
  /** The website's font set. */
  fonts: SpaceThemeId
  /** The Space page follows the website's style. */
  synced: boolean
  /** The Space page's own font set, used only while `synced` is off. */
  spaceFonts: SpaceThemeId
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function isSiteThemeId(v: unknown): v is SiteThemeId {
  return v === 'frequency' || v === 'bold'
}

export function readSiteStyle(preferences: unknown): SiteStyle {
  const fonts = parseSpaceTheme(preferences)
  const node = record(preferences) && record(preferences.siteStyle) ? preferences.siteStyle : null
  const theme: SiteThemeId = isSiteThemeId(node?.theme) ? node.theme : fonts === 'menswork' ? 'bold' : DEFAULT_SITE_THEME
  const synced = node?.synced !== false
  const spaceFonts = typeof node?.spaceFonts === 'string' && isSpaceThemeId(node.spaceFonts) ? node.spaceFonts : fonts
  return { theme, fonts, synced, spaceFonts }
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
  next.siteStyle = { theme: style.theme, synced: style.synced, spaceFonts: style.spaceFonts }
  return next
}
