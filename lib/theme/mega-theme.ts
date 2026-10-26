// THE MEGA THEME CHOICE (ADR-1881). A Mega Theme dresses every surface of a Space (website, Space page,
// emails, Spotlight, event pages) from one package, and a NICHE picks which variant of it the Space starts
// from. This file is the ONE place those two choices are named and stored.
//
// ONE ID MODEL. Three lists used to name the same themes: `SiteThemeId` (lib/theme/site-style.ts, the
// stored website theme), `WebsiteTheme` (lib/sites/editor/state.ts, the editor's document theme) and
// `SpaceThemeId` (lib/theme/space-themes.ts, which is a FONT SET, not a theme). A Mega Theme id is the
// lowercase theme name; MEGA_THEMES maps it to the other two, and mega-theme.test.ts pins the older
// restated tables (WORN_EDITOR_THEME, EDITOR_THEME_OF) to it. A font set stays a font set.
//
// STORED: `spaces.preferences.megaTheme = { theme?, niche?, version? }`. No new table, and nothing here
// rewrites a Space's content. A Space that never chose reads its theme from the site style it already
// wears, and has no niche (`null`). Pure and fail-safe: a malformed node reads as unset.
//
// Types only from the site editor and the kit engine, so this file adds nothing to any bundle.

import type { WebsiteTheme } from '@/lib/sites/editor/state'
import type { SiteThemeId } from '@/lib/theme/site-style'

/** The six core niches, one per /for door. The same ids the funnel sequences and the site kits use. */
export const MEGA_NICHES = ['coaches', 'studios', 'hosts', 'venues', 'nonprofits', 'networks'] as const
export type MegaNicheId = (typeof MEGA_NICHES)[number]

export type MegaThemeId = SiteThemeId | 'midnight'

/** The one thing an owner wants people to do, from the picker's second question (ADR-1883). */
export const MEGA_ACTIONS = ['book', 'try', 'tickets', 'tour', 'donate', 'chapter', 'join', 'list', 'ask'] as const
export type MegaActionId = (typeof MEGA_ACTIONS)[number]

interface MegaThemeDef {
  id: MegaThemeId
  /** The editor's document theme. */
  editor: WebsiteTheme
  /** The stored website theme this wears today; null until the theme is installed as a site theme. */
  site: SiteThemeId | null
}

export const MEGA_THEMES: readonly MegaThemeDef[] = [
  { id: 'frequency', editor: 'DAWN', site: 'frequency' },
  { id: 'bold', editor: 'Menswork', site: 'bold' },
  { id: 'wildheart', editor: 'Wildheart', site: 'wildheart' },
  { id: 'network', editor: 'Network', site: 'network' },
  { id: 'temple', editor: 'Temple', site: 'temple' },
  { id: 'midnight', editor: 'Midnight', site: null },
]

export interface MegaThemeChoice {
  /** The theme the owner picked, or null when they never did. */
  theme: MegaThemeId | null
  niche: MegaNicheId | null
  /** The one thing the owner wants people to do, or null. */
  action: MegaActionId | null
  /** An existing site the owner offered to borrow from (https only), kept for the importer. Null when none. */
  sourceUrl: string | null
  /** The package version the Space started from, so an update can say what changed. */
  version: number | null
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function isMegaThemeId(v: unknown): v is MegaThemeId {
  return MEGA_THEMES.some((t) => t.id === v)
}

export function isMegaActionId(v: unknown): v is MegaActionId {
  return (MEGA_ACTIONS as readonly unknown[]).includes(v)
}

const MAX_SOURCE_URL = 300

/** An https URL with no credentials, trimmed, or null. The picker's optional "existing site" answer. */
export function cleanSourceUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const text = v.trim()
  if (!text || text.length > MAX_SOURCE_URL) return null
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) return null
    return url.toString()
  } catch {
    return null
  }
}

export function isMegaNicheId(v: unknown): v is MegaNicheId {
  return (MEGA_NICHES as readonly unknown[]).includes(v)
}

/** The stored choice, exactly as saved. */
export function readMegaTheme(preferences: unknown): MegaThemeChoice {
  const node = record(preferences) && record(preferences.megaTheme) ? preferences.megaTheme : null
  const version = node?.version
  return {
    theme: isMegaThemeId(node?.theme) ? node.theme : null,
    niche: isMegaNicheId(node?.niche) ? node.niche : null,
    action: isMegaActionId(node?.action) ? node.action : null,
    sourceUrl: cleanSourceUrl(node?.sourceUrl),
    version: typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : null,
  }
}

/** A patch value: undefined keeps the stored one, null clears it, a valid value sets it, an invalid one is ignored. */
function pick<T>(patch: unknown, current: T | null, valid: (v: unknown) => T | null): T | null {
  if (patch === undefined) return current
  if (patch === null) return null
  return valid(patch) ?? current
}

/** Save part of the choice, keeping every other preferences key. A value sets it, null clears it, and an
 *  unknown value is ignored rather than stored. The node is dropped once it is empty. */
export function withMegaTheme(
  preferences: unknown,
  patch: { theme?: string | null; niche?: string | null; action?: string | null; sourceUrl?: string | null; version?: number | null },
): Record<string, unknown> {
  const next = { ...(record(preferences) ? preferences : {}) }
  const current = readMegaTheme(preferences)
  const merged: MegaThemeChoice = {
    theme: pick(patch.theme, current.theme, (v) => (isMegaThemeId(v) ? v : null)),
    niche: pick(patch.niche, current.niche, (v) => (isMegaNicheId(v) ? v : null)),
    action: pick(patch.action, current.action, (v) => (isMegaActionId(v) ? v : null)),
    sourceUrl: pick(patch.sourceUrl, current.sourceUrl, cleanSourceUrl),
    version: pick(patch.version, current.version, (v) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null)),
  }
  const node = {
    ...(merged.theme ? { theme: merged.theme } : {}),
    ...(merged.niche ? { niche: merged.niche } : {}),
    ...(merged.action ? { action: merged.action } : {}),
    ...(merged.sourceUrl ? { sourceUrl: merged.sourceUrl } : {}),
    ...(merged.version ? { version: merged.version } : {}),
  }
  if (Object.keys(node).length) next.megaTheme = node
  else delete next.megaTheme
  return next
}
