// The curated set of skins a member may pick for their Spotlight page. A SUBSET of
// the app SKINS (lib/theme/skins.ts) — "constrained but expressive": owners choose a
// look from a governed list, never raw colors/CSS. resolveProfileSkin is the single
// owner-aware choke point every Spotlight render site uses, so adding earned/cosmetic
// skins later (gated by `requiredItem`) is additive — no render site changes.

import { SKINS, resolveSkin, type SkinId } from './skins'

export interface ProfileSkin {
  id: SkinId
  label: string
  description: string
  /** Reserved for the cosmetics layer: the store item that unlocks this skin. Empty
   *  today (all listed skins are free) — when set, the picker will gate on ownership. */
  requiredItem?: string
}

/** Skins offered in the Spotlight theme picker, in display order. */
export const PROFILE_SKINS: readonly ProfileSkin[] = SKINS.map((s) => ({
  id: s.id,
  label: s.label,
  description: s.description,
  requiredItem: undefined,
}))

const ALLOWED = new Set<SkinId>(PROFILE_SKINS.map((s) => s.id))

/**
 * The single owner-aware choke point: map a stored `profile_theme` to a skin the
 * member is actually allowed to use, defaulting to 'default' for anything unknown or
 * not (yet) in the offered set. All Spotlight render sites call THIS, never
 * resolveSkin() inline, so cosmetic-gating can be added here once and apply everywhere.
 */
export function resolveProfileSkin(profileTheme: string | null | undefined): SkinId {
  const skin = resolveSkin(profileTheme)
  return ALLOWED.has(skin) ? skin : 'default'
}

/** Is this a skin the member may currently select? (Cosmetic gating hooks in here.) */
export function isSelectableProfileSkin(id: string): boolean {
  return ALLOWED.has(id as SkinId)
}
