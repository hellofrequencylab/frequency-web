'use server'

// CREATE-A-SPACE provisioning (ENTITY-SPACES-BUILD Wave B, Epic 1.6). The one server action the
// create wizard (app/(main)/spaces/new) calls to stand up a brand-new entity Space and seat its
// owner as a Space admin. The server is the authority:
//   1. Gate on an authenticated caller (getMyProfileId).
//   2. Validate the type against the blueprint registry (a registered blueprint must exist), the
//      slug (isSafeSlug + uniqueness), and the name.
//   3. Resolve the ROOT space's entity_id at runtime (no hardcoded uuid) so the new Space shares
//      the platform money partition.
//   4. Insert the `spaces` row (status 'active', plan 'free', entitlements {}, the blueprint's
//      default skin, owner = caller, network_connected true), then seat the caller as an 'admin'
//      member (addSpaceMember).
// On slug collision it returns a friendly fail; on success it redirects to the owner settings
// surface. Returns ActionResult on any path that DOESN'T redirect.
//
// `spaces` is not in the generated DB types yet, so the insert/uniqueness read reach the table
// through the untyped admin client (ADR-246), exactly like lib/spaces/membership.ts.

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'
import { blueprintForType } from '@/lib/spaces/blueprints'
import { addSpaceMember } from '@/lib/spaces/membership'
import { isSpaceType, seedSpaceConfigFromDefaults } from '@/lib/spaces/functions'
import { listTypeDefaultsForType } from '@/lib/spaces/type-defaults'
import { isSafeSlug } from '@/lib/theme/validate'
import { type ActionResult, fail } from '@/lib/action-result'

/** The fields the create wizard collects. `visibility` defaults to 'network' (discoverable). */
export interface CreateSpaceInput {
  type: string
  name: string
  slug: string
  brandName?: string | null
  visibility?: 'network' | 'private'
}

// `spaces` isn't in the generated DB types yet (ADR-246) — reach it through an untyped `from`
// accessor and type the small builder surface these helpers use loosely here.
type SpacesQuery = {
  select: (cols: string) => SpacesQuery
  eq: (col: string, val: string) => SpacesQuery
  insert: (rows: Record<string, unknown>) => SpacesQuery
  maybeSingle: () => Promise<{
    data: { id?: string; entity_id?: string; type?: string; slug?: string; owner_profile_id?: string | null } | null
    error: unknown
  }>
}

function spacesTable(): SpacesQuery {
  const db = createAdminClient() as unknown as { from: (table: string) => SpacesQuery }
  return db.from('spaces')
}

/** Whether a slug is already taken by any Space (active or not — slugs are globally unique). */
async function slugTaken(slug: string): Promise<boolean> {
  try {
    const { data } = await spacesTable().select('id').eq('slug', slug).maybeSingle()
    return !!data
  } catch {
    // Fail-closed for safety: if we can't confirm the slug is free, don't claim it.
    return true
  }
}

/** The root Space's entity_id (the platform money partition), resolved at runtime. Null when the
 *  root row is missing (pre-migration) — provisioning fails cleanly rather than guessing a uuid. */
async function rootEntityId(): Promise<string | null> {
  try {
    const { data } = await spacesTable().select('entity_id').eq('type', 'root').maybeSingle()
    return data?.entity_id ?? null
  } catch {
    return null
  }
}

/**
 * Provision a new entity Space owned by the caller, then seat the caller as a Space admin. On
 * success this REDIRECTS to /spaces/<slug>/settings (so it returns nothing on the happy path).
 * Returns an ActionResult error on any guard failure so the wizard can surface it inline.
 */
export async function createSpace(input: CreateSpaceInput): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to create a space.')

  // Type: only a registered blueprint may be provisioned (auto-includes every wired role; an
  // unknown/unblueprinted type is rejected). The blueprint also supplies the default skin.
  const type = (input.type ?? '').trim()
  const blueprint = blueprintForType(type)
  if (!blueprint) return fail('Pick a space type from the list.')

  const name = (input.name ?? '').trim()
  if (!name) return fail('Give your space a name.')
  if (name.length > 200) return fail('That name is too long. Keep it under 200 characters.')

  // Slug: lowercase, validated, unique. isSafeSlug also caps length + character set.
  const slug = (input.slug ?? '').trim().toLowerCase()
  if (!isSafeSlug(slug)) {
    return fail('Use a short handle with lowercase letters, numbers, and hyphens only.')
  }
  if (await slugTaken(slug)) {
    return fail('That handle is already taken. Try another.')
  }

  const brandName = (input.brandName ?? '').trim() || name
  const visibility = input.visibility === 'private' ? 'private' : 'network'

  const entityId = await rootEntityId()
  if (!entityId) return fail('Spaces are not ready yet. Try again in a moment.')

  // Seed the new Space's tools (entitlements on/off + feature_roles min-role) from the operator's
  // per-type defaults merged over the CODE defaults (per-space-roles Phase 2). FAIL-SAFE: the read is
  // fail-safe to [] and the pure seed returns empty blobs with no defaults, so a Space stands up with
  // exactly today's behavior (every universal tool on at its code default role) when no defaults exist.
  // Plan-gated tools (CRM, email) are never seeded on here: a new Space starts on the free plan and a
  // paid tool is granted later through billing or the operator's absolute override. `isSpaceType`
  // guards the union (the wizard already restricts `type` to a blueprint, this keeps the seed pure).
  const seedType = isSpaceType(type) ? type : null
  const typeDefaults = seedType ? await listTypeDefaultsForType(seedType) : []
  const { entitlements: seedEntitlements, featureRoles: seedFeatureRoles } =
    seedSpaceConfigFromDefaults(seedType, typeDefaults)

  // Insert the Space. status active, plan free, the seeded tool config, the blueprint's default skin,
  // owner = caller, ported into the network. brand_name seeds from the chosen brand/name.
  let spaceId: string
  try {
    const { data, error } = await spacesTable()
      .insert({
        slug,
        name,
        type,
        status: 'active',
        entity_id: entityId,
        skin: blueprint.defaultSkin,
        network_connected: true,
        visibility,
        plan: 'free',
        entitlements: seedEntitlements,
        feature_roles: seedFeatureRoles,
        owner_profile_id: profileId,
        brand_name: brandName,
      })
      .select('id')
      .maybeSingle()
    if (error || !data?.id) return fail('Could not create the space. Try again.')
    spaceId = data.id
  } catch {
    return fail('Could not create the space. Try again.')
  }

  // Seat the owner as a Space admin (an explicit membership row, alongside owner_profile_id).
  await addSpaceMember({ spaceId, profileId, role: 'admin', status: 'active' })

  // Success: hand the owner straight to the settings surface to finish the profile. redirect()
  // throws, so it must sit OUTSIDE any try/catch (Next docs: redirecting.md).
  redirect(`/spaces/${slug}/settings`)
}

/**
 * Permanently delete a Space AND everything it owns. The server is the authority on BOTH the gate
 * and the cascade:
 *   1. Only the Space OWNER (spaces.owner_profile_id) or platform STAFF (web_role) may delete — a
 *      destructive, owner-grade action, never an editor/admin member one.
 *   2. The ROOT space is never deletable (it holds the platform money partition + every public
 *      community event), so a stray call can't nuke the network.
 *   3. The single `spaces` row delete fans out through ON DELETE CASCADE: every event the space owns
 *      (events.space_id → spaces, CASCADE) goes with it, and each event cascades to its RSVPs,
 *      posts, cohosts, tickets, and media — so "the space and all its events" is one atomic delete.
 *      The space's circles, pages, CRM, members, and email config cascade the same way.
 *
 * Returns `{ error }` so the settings UI (DangerDelete) can surface a failure inline; on success it
 * returns `{}` and the caller redirects to /spaces (the deleted slug no longer resolves).
 */
export async function deleteSpace(spaceId: string): Promise<{ error?: string }> {
  const id = (spaceId ?? '').trim()
  if (!id) return { error: 'Missing the space to delete.' }

  const caller = await getCallerProfile()
  if (!caller?.id) return { error: 'Sign in to delete a space.' }

  // Load the space's owner + type for the gate (untyped table, ADR-246).
  let space: { id?: string; type?: string; slug?: string; owner_profile_id?: string | null } | null
  try {
    const { data } = await spacesTable()
      .select('id, type, slug, owner_profile_id')
      .eq('id', id)
      .maybeSingle()
    space = data
  } catch {
    return { error: 'Could not load that space. Try again.' }
  }
  if (!space?.id) return { error: 'That space no longer exists.' }

  // The root space is the platform partition — never deletable.
  if (space.type === 'root') return { error: 'The root space cannot be deleted.' }

  // Owner OR platform staff only. An editor/admin member of the space cannot delete it.
  const isOwner = !!space.owner_profile_id && space.owner_profile_id === caller.id
  if (!isOwner && !isStaff(caller.webRole)) {
    return { error: 'Only the space owner can delete it.' }
  }

  // One atomic delete; ON DELETE CASCADE removes the events, members, circles, pages, and CRM the
  // space owns. The untyped builder has no typed `delete`, so reach it through a narrow cast.
  try {
    const db = createAdminClient() as unknown as {
      from: (table: string) => {
        delete: () => { eq: (col: string, val: string) => Promise<{ error: unknown }> }
      }
    }
    const { error } = await db.from('spaces').delete().eq('id', id)
    if (error) return { error: 'Could not delete the space. Try again.' }
  } catch {
    return { error: 'Could not delete the space. Try again.' }
  }

  // Drop cached views that listed the space or its events.
  revalidatePath('/spaces')
  revalidatePath('/events')
  return {}
}
