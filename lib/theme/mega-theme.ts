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
  /** The package version the Space started from, so an update can say what changed. */
  version: number | null
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function isMegaThemeId(v: unknown): v is MegaThemeId {
  return MEGA_THEMES.some((t) => t.id === v)
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
    version: typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : null,
  }
}

/** Save part of the choice, keeping every other preferences key. A value sets it, null clears it, and an
 *  unknown value is ignored rather than stored. The node is dropped once it is empty. */
export function withMegaTheme(
  preferences: unknown,
  patch: { theme?: string | null; niche?: string | null; version?: number | null },
): Record<string, unknown> {
  const next = { ...(record(preferences) ? preferences : {}) }
  const current = readMegaTheme(preferences)
  const merged: MegaThemeChoice = {
    theme: patch.theme === undefined ? current.theme : patch.theme === null ? null : isMegaThemeId(patch.theme) ? patch.theme : current.theme,
    niche: patch.niche === undefined ? current.niche : patch.niche === null ? null : isMegaNicheId(patch.niche) ? patch.niche : current.niche,
    version:
      patch.version === undefined
        ? current.version
        : patch.version === null
          ? null
          : Number.isInteger(patch.version) && patch.version > 0
            ? patch.version
            : current.version,
  }
  const node = {
    ...(merged.theme ? { theme: merged.theme } : {}),
    ...(merged.niche ? { niche: merged.niche } : {}),
    ...(merged.version ? { version: merged.version } : {}),
  }
  if (Object.keys(node).length) next.megaTheme = node
  else delete next.megaTheme
  return next
}
