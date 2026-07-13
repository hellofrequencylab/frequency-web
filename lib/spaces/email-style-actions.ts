'use server'

// EMAIL STYLE PERSISTENCE (Email in the Business CRM, P1 · deliverable 3). The one write action behind the
// Email-style settings surface: it saves the operator's tuned email palette to spaces.preferences.emailStyle,
// the sparse per-field hex override the resolver (lib/spaces/email-colors.ts spaceEmailColors) layers OVER the
// brand-derived + default palette. No migration: it rides the existing spaces.preferences jsonb bag, a sibling
// of `hero` / `headerCta` / `moduleMenu`.
//
// AUTHZ (ADR-246/328/329): gated on canEditProfile (owner / admin / editor). Never trusts the wire — the bag is
// re-sanitized to strict 6-digit hex on known EmailColors keys (sanitizeSpaceEmailStyle) before it is written.
// The `preferences` write is non-destructive (nextEmailStylePreferences preserves every other node). Reached
// through the untyped admin client (ADR-246), like every other spaces.preferences writer (content-actions.ts).

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
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
    update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> }
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

  const { error } = await admin.from('spaces').update({ preferences: next }).eq('id', space.id)
  if (error) return fail('Could not save your email style. Try again.')

  // Refresh the Space surfaces that read the palette so a later render reflects the change.
  revalidatePath(`/spaces/${slug}/settings/email-style`)
  revalidatePath(`/spaces/${slug}/marketing`)
  return ok()
}
