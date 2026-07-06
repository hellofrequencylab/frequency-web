'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { resolveMode, isModeVariant, type ModePreferences } from '@/lib/spaces/modes'
import { ensureSpaceStages } from '@/lib/crm/pipeline'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// SPACE MODE settings actions (Space Modes M3, ADR-461/464). The operator switches their Mode/Focus and
// overrides preset facets from /spaces/<slug>/manage/mode. EVERY action RE-RESOLVES the space from the
// slug and RE-GATES caps.canManageMembers (owner / admin) server-side, so a non-manager can never switch
// another space's Mode or write its preferences (the console gate is UX; this is the authority).
//
// NON-GATING + NON-DESTRUCTIVE (the HARD RULES):
//   • Mode/Focus NEVER touches spaces.entitlements or feature_roles: capability stays gated by the
//     entitlement engine + the role ladder. Switching only writes spaces.mode_variant (the Focus) and
//     re-seeds the SUGGESTED pipeline (idempotent, no-op when the space already has stages, so a
//     customized pipeline is never clobbered). No data is deleted, ever.
//   • Operator OVERRIDES win: a label / toggle / nav-order override is persisted to spaces.preferences.mode
//     and is preserved across future re-presets (a switch never rewrites preferences).
//
// Writes go through the service-role admin client SCOPED to the resolved space id (.eq('id', …)). No em
// dashes (owner copy, CONTENT-VOICE).

/** Authorize the caller as a manager (owner / admin) of `slug`'s space; returns the resolved space + its
 *  current preferences blob, or null on any miss. */
async function authorizeManager(slug: string): Promise<{
  spaceId: string
  type: string
  modeVariant: string | null
  preferences: Record<string, unknown>
} | null> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canManageMembers) return null // owner / admin only (not a mere editor)
  const asRecord = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  return {
    spaceId: space.id,
    type: space.type,
    modeVariant: space.modeVariant ?? null,
    preferences: asRecord(space.preferences),
  }
}

/** Untyped scoped update of one of the space's columns (ADR-246), bound to the resolved id. */
async function updateSpace(spaceId: string, patch: Record<string, unknown>): Promise<boolean> {
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  const { error } = await db.from('spaces').update(patch).eq('id', spaceId)
  return !error
}

/** Write back the `mode` node of spaces.preferences, preserving any other keys already in the blob. */
async function writeModePreferences(
  spaceId: string,
  current: Record<string, unknown>,
  next: ModePreferences,
): Promise<boolean> {
  const preferences = { ...current, mode: next }
  return updateSpace(spaceId, { preferences })
}

/**
 * Switch the Space's Focus (mode_variant). NON-DESTRUCTIVE: writes only the variant + re-seeds the
 * SUGGESTED CRM pipeline idempotently (a customized pipeline is never overwritten). Operator overrides in
 * spaces.preferences are untouched, so they survive the switch. Owner/admin-gated. Returns ActionResult.
 */
export async function switchSpaceFocus(slug: string, variant: string): Promise<ActionResult> {
  if (!isModeVariant(variant)) return fail('Pick a focus from the list.')

  const auth = await authorizeManager(slug)
  if (!auth) return fail('You do not have access to manage this space.')

  // The variant must be one this type actually offers (resolveMode falls back to the default for an
  // out-of-mode variant, so a mismatched variant would silently no-op; reject it explicitly instead).
  const target = resolveMode(auth.type as Parameters<typeof resolveMode>[0], variant)
  if (!target || target.variant !== variant) {
    return fail('That focus is not available for this space.')
  }

  if (!(await updateSpace(auth.spaceId, { mode_variant: variant }))) {
    return fail('Could not switch the focus. Try again.')
  }

  // Re-seed the suggested pipeline for the NEW Focus. Idempotent: ensureSpaceStages is a NO-OP when the
  // space already has any stage, so a hand-customized pipeline is never clobbered (the non-destructive
  // guarantee). Passing the just-switched `variant` keeps the seed matched to the Mode preview a fresh
  // space would show. Best-effort: a seed failure never fails the switch.
  await ensureSpaceStages(auth.spaceId, auth.type as Parameters<typeof ensureSpaceStages>[1], variant)

  revalidatePath(`/spaces/${slug}/manage/mode`)
  revalidatePath(`/spaces/${slug}/manage`)
  return ok()
}

/** Reset ALL operator overrides for this space (back to the pure Mode defaults). Owner/admin-gated. The
 *  Focus (mode_variant) is left as-is; this only clears the preferences.mode node. */
export async function resetModeOverrides(slug: string): Promise<ActionResult> {
  const auth = await authorizeManager(slug)
  if (!auth) return fail('You do not have access to manage this space.')

  if (!(await writeModePreferences(auth.spaceId, auth.preferences, {}))) {
    return fail('Could not reset the overrides. Try again.')
  }
  revalidatePath(`/spaces/${slug}/manage/mode`)
  revalidatePath(`/spaces/${slug}/manage`)
  return ok()
}
