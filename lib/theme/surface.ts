// THE THEME SURFACE (LIVE-1306 follow-up). A Mega Theme that owns a real ground, not only an accent, hands the
// pages it dresses ONE flat set of literal values: canvas, raised, elevated, border, text ramp, the solid
// (bone) button, the accent family and the semantic notes. Email reads the literals (a mail client cannot
// resolve a CSS variable); the Space page and the event page read them as scoped --color-* overrides. A theme
// with no entry here (Commons, Bold, Wildheart, Network, Temple) keeps the app's own surfaces and its accent
// only, exactly as before. PURE: no React, no Supabase.

import type { ThemeSurface } from '@/lib/theme/surface-vars'
import { readMegaTheme, type MegaThemeId } from '@/lib/theme/mega-theme'
import { MEGA_SURFACES } from '@/lib/theme/mega-surfaces'
import { MIDNIGHT_SURFACE } from '@/lib/theme/midnight'
import { readSiteStyle } from '@/lib/theme/site-style'

const SURFACES: Partial<Record<MegaThemeId, ThemeSurface>> = {
  midnight: MIDNIGHT_SURFACE,
}

/** The surface a Space's member-facing pages (Space page, event page) wear. The Space's saved Mega Theme
 *  choice wins; else the website theme it is synced to. Null: the app's own surfaces stand. */
export function pageSurface(preferences: unknown): ThemeSurface | null {
  const mega = readMegaTheme(preferences).theme
  if (mega) return SURFACES[mega] ?? null
  const style = readSiteStyle(preferences)
  return style.synced ? (SURFACES[style.theme as MegaThemeId] ?? null) : null
}

/** The surface a Space's emails wear. Email has no "synced" switch: the Space's theme is its brand, and every Mega
 *  Theme with a flat token set dresses it (lib/theme/mega-surfaces.ts, LIVE-1521). The page surface above stays
 *  Midnight's alone. */
export function emailSurface(preferences: unknown): ThemeSurface | null {
  const mega = readMegaTheme(preferences).theme
  const id = (mega ?? readSiteStyle(preferences).theme) as MegaThemeId
  return MEGA_SURFACES[id] ?? null
}
