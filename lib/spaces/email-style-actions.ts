'use server'

// EMAIL STYLE PERSISTENCE (Email in the Business CRM, P1 · deliverable 3). The one write action behind the
// Email-style settings surface: it saves the operator's tuned email palette to spaces.preferences.emailStyle,
// the sparse per-field hex override the resolver (lib/spaces/email-colors.ts spaceEmailColors) layers OVER the
// brand-derived + default palette. No migration: it rides the existing spaces.preferences jsonb bag, a sibling
// of `hero` / `headerCta` / `moduleMenu`.
//
// AUTHZ (ADR-246/328/329): gated on canEditProfile (owner / admin / editor). Never trusts the wire — the bag is
// re-sanitized to strict 6-digit hex on known EmailColors keys (sanitizeSpaceEmailStyle) before it is written.
// The `preferences` write is non-destructive and KEY-SCOPED (LIVE-2350): nextEmailStylePreferences builds the
// next bag from a fresh read, preferencesPatch reduces it to the one key it changes (emailStyle, null to clear),
// and patchSpacePreferences (set_space_preferences, SCAN-833) sets just that key, so a save here can never turn
// back a key another console saved after the read (a Spotlight publish, a website editor stub, a menu save).

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug, patchSpacePreferences } from '@/lib/spaces/store'
import { preferencesPatch } from '@/lib/spaces/preferences-patch'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  sanitizeSpaceEmailStyle,
  nextEmailStylePreferences,
  type SpaceEmailStyle,
} from '@/lib/spaces/email-colors'

type SpacesPrefsClient = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { preferences?: unknown } | null }> }
    }
  }
}

/**
 * Save (or clear) a Space's email-style override. Gated on canEditProfile. The raw bag is sanitized to a safe,
 * sparse per-field hex override; an empty result CLEARS the node back to the brand-derived / default palette.
 * Returns `ok` on success, a fail-closed ActionResult otherwise.
 */
export async function setSpaceEmailStyle(slug: string, raw: unknown): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to edit your email style.')

  const space = await getVisibleSpaceBySlug(slug, profileId)
  if (!space) return fail('Space not found.')

  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile) return fail('You do not have permission to edit this space.')

  const style: SpaceEmailStyle = sanitizeSpaceEmailStyle(raw)

  const admin = createAdminClient() as unknown as SpacesPrefsClient
  const { data } = await admin.from('spaces').select('preferences').eq('id', space.id).maybeSingle()
  const current =
    data?.preferences && typeof data.preferences === 'object' && !Array.isArray(data.preferences)
      ? { ...(data.preferences as Record<string, unknown>) }
      : {}
  const next = nextEmailStylePreferences(current, style)

  const patch = preferencesPatch(current, next)
  if (Object.keys(patch).length > 0 && !(await patchSpacePreferences(space.id, patch))) {
    return fail('Could not save your email style. Try again.')
  }

  // Refresh the Space surfaces that read the palette so a later render reflects the change.
  revalidatePath(`/spaces/${slug}/settings/email-style`)
  revalidatePath(`/spaces/${slug}/marketing`)
  return ok()
}
