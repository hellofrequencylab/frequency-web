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
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { blueprintForType } from '@/lib/spaces/blueprints'
import { addSpaceMember } from '@/lib/spaces/membership'
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
  maybeSingle: () => Promise<{ data: { id?: string; entity_id?: string } | null; error: unknown }>
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

  // Insert the Space. status active, plan free, no entitlements, the blueprint's default skin,
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
        entitlements: {},
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
