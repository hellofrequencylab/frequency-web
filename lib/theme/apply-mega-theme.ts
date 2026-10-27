// APPLY A MEGA THEME (LIVE-SYS-7, ADR-1881): "design once". Choosing a Mega Theme sets every surface a Space
// owns from the ONE choice, in one place, so the editor's picker and the create Wizard never restate it.
//
//   · WEBSITE      the site style's theme, with that theme's font set (preferences.siteStyle, preferences.theme).
//   · EMAIL        nothing to write: lib/theme/surface.ts reads preferences.megaTheme, so a theme with an email
//                  surface registered wears it. The result says which themes have one yet.
//   · SPOTLIGHT    the owner's Spotlight preset of the same id, written only when the caller names the profile
//                  (an owner's explicit pick) and a preset exists. Themes without a preset leave it alone.
//   · SPACE PAGE   the theme's FONT SET and, when the Space has no brand color of its own, its accent. Nothing
//                  else: the Space page stays the Frequency member portal (ADR-578, ADR-1906).
//
// THE FENCE (LIVE-1509): this module WRITES choices. It never resolves a website theme into styles, and no
// member or admin route imports a site skin through it. The Space page reads the font set and brand color it
// writes through the member helpers (memberSpaceFonts, brandAccent), never through a site resolver.
//
// IDEMPOTENT: applying the theme a Space already wears writes the same values. A Space's niche, look choices
// (corners, spacing, header, footer), per-page themes and every other preferences key are kept.

import { mergeProfileMetaPath } from '@/lib/profiles/meta'
import { THEME_PRESETS } from '@/lib/spotlight/theme'
import { withMegaTheme, isMegaThemeId, MEGA_THEMES, type MegaThemeId } from '@/lib/theme/mega-theme'
import { SITE_THEMES, spacePageDefaultAccent, withSiteStyle, type SiteThemeId } from '@/lib/theme/site-style'
import { emailSurface } from '@/lib/theme/surface'
import type { SpaceThemeId } from '@/lib/theme/space-themes'

/** Where one Mega Theme reaches, surface by surface. Pure data, read by the editor, the Wizard and the library. */
export interface MegaThemeSurfaces {
  theme: MegaThemeId
  /** The website's theme. */
  website: SiteThemeId
  /** True once the theme has an email surface registered; false means emails keep the house palette. */
  email: boolean
  /** The Spotlight preset id of the same name, or null until the theme has one. */
  spotlightPreset: string | null
  /** What the Space page takes: a font set and an accent (null: the Space's own brand color stands). */
  spacePage: { fonts: SpaceThemeId; accent: string | null }
}

export function megaThemeSurfaces(theme: MegaThemeId): MegaThemeSurfaces {
  const site = SITE_THEMES.find((t) => t.id === MEGA_THEMES.find((m) => m.id === theme)?.site)
  const website = site?.id ?? 'frequency'
  const accent = spacePageDefaultAccent({ siteStyle: { theme: website, synced: true } }, '')
  return {
    theme,
    website,
    email: emailSurface({ megaTheme: { theme } }) !== null,
    spotlightPreset: THEME_PRESETS.some((p) => p.id === theme) ? theme : null,
    spacePage: { fonts: site?.defaultFonts ?? 'frequency', accent: accent || null },
  }
}

/** The preferences a Space holds once it wears `theme`: the choice record, the website style and its font set.
 *  Pure; every key the apply does not own is returned as stored. */
export function planMegaTheme(preferences: unknown, theme: MegaThemeId): Record<string, unknown> {
  const { website, spacePage } = megaThemeSurfaces(theme)
  // Synced on: the owner asked for ONE choice to reach the Space page; the sync switch stays theirs afterward.
  const styled = withSiteStyle(preferences, { theme: website, synced: true, fonts: spacePage.fonts, spaceFonts: spacePage.fonts })
  return withMegaTheme(styled, { theme })
}

export type ApplyMegaThemeResult =
  | { ok: true; surfaces: MegaThemeSurfaces; wrote: { website: true; spacePage: true; accent: boolean; spotlight: boolean } }
  | { ok: false; error: string }

/** Apply a Mega Theme to a Space. The caller has already checked the person may edit this Space.
 *  `spotlight` names the owner's profile and their own (session) client when they picked the theme themselves
 *  and want their Spotlight dressed too; leave it out and no profile is touched. */
export async function applyMegaTheme(
  spaceId: string,
  theme: string,
  opts: { spotlight?: { profileId: string; client: Parameters<typeof mergeProfileMetaPath>[0] } } = {},
): Promise<ApplyMegaThemeResult> {
  if (!spaceId || !isMegaThemeId(theme)) return { ok: false, error: 'Choose one of the themes.' }
  const [{ getSpaceById, patchSpacePreferences, fillSpaceBrandAccent }, { refreshSite }] = await Promise.all([
    import('@/lib/spaces/store'),
    import('@/lib/sites/site-cache'),
  ])
  const space = await getSpaceById(spaceId)
  if (!space) return { ok: false, error: 'Could not find that space.' }

  const surfaces = megaThemeSurfaces(theme)
  const next = planMegaTheme(space.preferences, theme)
  // KEY-SCOPED (SCAN-833): only the three keys this owns, so an editor autosave is never reverted.
  const landed = await patchSpacePreferences(spaceId, { megaTheme: next.megaTheme ?? null, theme: next.theme ?? null, siteStyle: next.siteStyle ?? null })
  if (!landed) return { ok: false, error: 'Could not save your theme. Try again.' }

  // The accent fills a blank only: a brand color the owner picked is never replaced by a theme.
  let accent = false
  if (surfaces.spacePage.accent && !space.brandAccent) accent = await fillSpaceBrandAccent(spaceId, surfaces.spacePage.accent)

  let spotlight = false
  const preset = THEME_PRESETS.find((p) => p.id === surfaces.spotlightPreset)
  if (opts.spotlight && preset) spotlight = !(await mergeProfileMetaPath(opts.spotlight.client, opts.spotlight.profileId, ['spotlight'], { theme: preset.theme })).error

  refreshSite(space.slug)
  return { ok: true, surfaces, wrote: { website: true, spacePage: true, accent, spotlight } }
}
