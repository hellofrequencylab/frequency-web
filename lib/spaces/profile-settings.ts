'use server'

// OWNER PROFILE SETTINGS write (ENTITY-SPACES-BUILD Wave B, Epic 1.7). The one server action the
// owner settings surface (app/(main)/spaces/[slug]/settings) calls to persist the editable Space
// profile fields. The server is the authority:
//   1. Resolve the Space (by id) and the caller (getMyProfileId).
//   2. Gate on getSpaceCapabilities(space, caller).canEditProfile (owner/admin/editor) — a denied
//      caller never touches the row.
//   3. Validate every field, then write through the untyped admin client (ADR-246: `spaces` and
//      its about/tagline columns aren't in the generated types yet).
// Returns ActionResult; the UI revalidates the profile + directory on success.
//
// brand_accent is a VALIDATED accent value: either a curated DAWN token NAME (TOKEN_ALLOWLIST) or a
// 6-digit hex the owner picked with the brand color picker (ADR-516 D2). A hex is safe here because
// brand_accent is never rendered into a server `<style>` tag (lib/theme/server/resolve.ts) — it only
// reaches a React inline `style` via AccentScope, and both this write and lib/spaces/accent.ts
// re-validate the strict `#rrggbb` shape. isValidAccent is the ONE rule both accent entry points share.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { isValidAccent } from '@/lib/spaces/accent'
import { isSpaceThemeId, DEFAULT_SPACE_THEME, type SpaceThemeId } from '@/lib/theme/space-themes'
import { type ActionResult, ok, fail } from '@/lib/action-result'

/** The editable profile fields. Every field is optional on the wire; an empty string clears the
 *  column (null), a present string is validated before it is written. */
export interface UpdateSpaceProfileInput {
  brandName?: string | null
  /** A DAWN token NAME from TOKEN_ALLOWLIST (e.g. '--color-primary') or a 6-digit hex ('#E2912F'),
   *  or '' / null to clear. */
  brandAccent?: string | null
  brandLogoUrl?: string | null
  about?: string | null
  tagline?: string | null
  visibility?: 'network' | 'private'
  /** The Space PAGE THEME (ADR-578): a typography + shape identity id, stored on preferences.theme (jsonb,
   *  no migration). A known id is kept; the default ('bold') or an unknown value clears the key. */
  theme?: SpaceThemeId | string | null
}

// `spaces` isn't in the generated DB types yet (ADR-246) — reach it through an untyped accessor.
type SpacesUpdateQuery = {
  update: (patch: Record<string, unknown>) => SpacesUpdateQuery
  eq: (col: string, val: string) => Promise<{ error: unknown }>
}

function spacesTable(): SpacesUpdateQuery {
  const db = createAdminClient() as unknown as { from: (table: string) => SpacesUpdateQuery }
  return db.from('spaces')
}

/** Is `url` a usable brand-logo URL: a same-origin (root-relative) path, or an https URL. Mirrors
 *  the admin branding action (kept local so nothing server-only leaks). */
function isSafeLogoUrl(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Save the owner-editable profile fields of a Space. Gated server-side on canEditProfile. Validates
 * each field (brand name length, accent is an allowlisted token, logo URL same-origin/https,
 * visibility is a known value); an empty string clears its column. On success revalidates the
 * profile + the directory so the new copy shows immediately. Returns ActionResult.
 */
export async function updateSpaceProfile(
  spaceId: string,
  input: UpdateSpaceProfileInput,
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to edit this space.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile) return fail('You do not have permission to edit this space.')
  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2, defense in depth). The hub renders the profile form
  // read-only when the viewer cannot use the `profile` function (default editor = the canEditProfile
  // threshold); this re-check enforces a per-Space role/disable override on the WRITE too.
  if (!spaceFunctionAccess(space, 'profile', caps.role))
    return fail('Profile and brand is not turned on for this space, or your role cannot use it.')

  const patch: Record<string, unknown> = {}

  if (input.brandName !== undefined) {
    const name = (input.brandName ?? '').trim()
    patch.brand_name = name ? name.slice(0, 200) : null
  }

  if (input.brandAccent !== undefined) {
    const accent = (input.brandAccent ?? '').trim()
    if (accent) {
      // The accent must be a curated DAWN token NAME (the allowlist) or a 6-digit hex the owner
      // picked (ADR-516 D2). isValidAccent is the shared rule; anything else is rejected.
      if (!isValidAccent(accent)) {
        return fail('Pick a brand color, or enter a hex like #E2912F.')
      }
      patch.brand_accent = accent
    } else {
      patch.brand_accent = null
    }
  }

  if (input.brandLogoUrl !== undefined) {
    const logo = (input.brandLogoUrl ?? '').trim()
    if (logo) {
      if (!isSafeLogoUrl(logo)) {
        return fail('The logo URL must be an https link or a same-origin path (starting with “/”).')
      }
      patch.brand_logo_url = logo.slice(0, 1000)
    } else {
      patch.brand_logo_url = null
    }
  }

  if (input.about !== undefined) {
    const about = (input.about ?? '').trim()
    patch.about = about ? about.slice(0, 4000) : null
  }

  if (input.tagline !== undefined) {
    const tagline = (input.tagline ?? '').trim()
    patch.tagline = tagline ? tagline.slice(0, 200) : null
  }

  if (input.visibility !== undefined) {
    patch.visibility = input.visibility === 'private' ? 'private' : 'network'
  }

  // PREFERENCES read-modify-write (jsonb, no columns). One pass so every untouched key (profileLayout,
  // moduleMenu, isDemo, headerCta, ...) is preserved. Two things live here:
  //   • THEME (ADR-578) — a known non-default id is stored on preferences.theme; the default ('bold') or an
  //     unknown value clears it (kept sparse).
  //   • HERO OVERRIDE CLEARING — the hero renders `preferences.hero.{heading,tagline}` OVERRIDE its column
  //     when present (resolveHero: `config.tagline ?? tagline`). This Identity & Branding form is the
  //     canonical place to set the hero's name + tagline (it writes the brand_name / tagline COLUMNS), so a
  //     stale hero override would silently SHADOW the edit — the operator changes the tagline here and
  //     "nothing happens" because an old override keeps winning. When they edit the canonical field, drop the
  //     matching hero override so the new value actually shows.
  const touchesPrefs =
    input.theme !== undefined || input.tagline !== undefined || input.brandName !== undefined
  if (touchesPrefs) {
    const prefs =
      space.preferences && typeof space.preferences === 'object' && !Array.isArray(space.preferences)
        ? { ...(space.preferences as Record<string, unknown>) }
        : {}

    if (input.theme !== undefined) {
      const theme = (input.theme ?? '').trim()
      if (theme && isSpaceThemeId(theme) && theme !== DEFAULT_SPACE_THEME) prefs.theme = theme
      else delete prefs.theme
    }

    if (input.tagline !== undefined || input.brandName !== undefined) {
      const hero =
        prefs.hero && typeof prefs.hero === 'object' && !Array.isArray(prefs.hero)
          ? { ...(prefs.hero as Record<string, unknown>) }
          : null
      if (hero) {
        if (input.tagline !== undefined) delete hero.tagline
        if (input.brandName !== undefined) delete hero.heading
        // Keep the node sparse: drop it entirely once its last key is gone.
        if (Object.keys(hero).length) prefs.hero = hero
        else delete prefs.hero
      }
    }

    patch.preferences = prefs
  }

  // Nothing to change is a no-op success (the form posted no edits).
  if (Object.keys(patch).length === 0) return ok()

  try {
    const { error } = await spacesTable().update(patch).eq('id', spaceId)
    if (error) return fail('Could not save your changes. Try again.')
  } catch {
    return fail('Could not save your changes. Try again.')
  }

  // Refresh the profile (band subtitle + about module) and the directory (tagline card).
  revalidatePath(`/spaces/${space.slug}`, 'layout')
  revalidatePath('/spaces/directory')
  return ok()
}
