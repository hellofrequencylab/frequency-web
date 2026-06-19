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
// brand_accent is a VALIDATED DAWN TOKEN NAME (from lib/theme/validate.ts TOKEN_ALLOWLIST), never
// a raw hex — the accent is the curated token a future override path will read (resolve.ts §35),
// so storing a free hex here would be unsafe and off-system (D4/D6, tokens only).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { TOKEN_ALLOWLIST } from '@/lib/theme/validate'
import { type ActionResult, ok, fail } from '@/lib/action-result'

/** The editable profile fields. Every field is optional on the wire; an empty string clears the
 *  column (null), a present string is validated before it is written. */
export interface UpdateSpaceProfileInput {
  brandName?: string | null
  /** A DAWN token NAME from TOKEN_ALLOWLIST (e.g. '--color-primary'), or '' / null to clear. */
  brandAccent?: string | null
  brandLogoUrl?: string | null
  about?: string | null
  tagline?: string | null
  visibility?: 'network' | 'private'
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

  const patch: Record<string, unknown> = {}

  if (input.brandName !== undefined) {
    const name = (input.brandName ?? '').trim()
    patch.brand_name = name ? name.slice(0, 200) : null
  }

  if (input.brandAccent !== undefined) {
    const accent = (input.brandAccent ?? '').trim()
    if (accent) {
      // The accent must be a curated DAWN token NAME, never a raw color — the allowlist is the
      // exact set a theme may set (lib/theme/validate.ts).
      if (!TOKEN_ALLOWLIST.has(accent)) {
        return fail('Pick an accent from the list.')
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
  revalidatePath('/spaces')
  return ok()
}
