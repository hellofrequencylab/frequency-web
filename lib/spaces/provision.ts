'use server'

// CREATE-A-SPACE provisioning (ENTITY-SPACES-BUILD Wave B, Epic 1.6). The one server action the
// create wizard (app/(main)/spaces/new) calls to stand up a brand-new entity Space and seat its
// owner as a Space admin. The server is the authority:
//   1. Gate on an authenticated caller (getMyProfileId).
//   2. Validate the type against the provisionable-types list (isProvisionableType), the slug
//      (isSafeSlug + uniqueness), and the name.
//   3. Resolve the ROOT space's entity_id at runtime (no hardcoded uuid) so the new Space shares
//      the platform money partition.
//   4. Insert the `spaces` row (status 'active', plan 'free', entitlements {}, the default DAWN
//      skin, owner = caller, network_connected true), then seat the caller as an 'admin' member
//      (addSpaceMember).
// On slug collision it returns a friendly fail; on success it redirects the new owner straight to their
// `/manage` console (ADR-552 Phase 4, no double-hop through /settings). Returns ActionResult on any path
// that DOESN'T redirect.
//
// `spaces` is not in the generated DB types yet, so the insert/uniqueness read reach the table
// through the untyped admin client (ADR-246), exactly like lib/spaces/membership.ts.

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'
import { isProvisionableType, DEFAULT_SPACE_SKIN } from '@/lib/spaces/profile-config'
import { addSpaceMember } from '@/lib/spaces/membership'
import { isSpaceType, seedSpaceConfigFromDefaults } from '@/lib/spaces/functions'
import { listTypeDefaultsForType } from '@/lib/spaces/type-defaults'
import { resolveMode, isModeVariant } from '@/lib/spaces/modes'
import { ensureSpaceStages } from '@/lib/crm/pipeline'
import { isSafeSlug } from '@/lib/theme/validate'
import { slugify } from '@/lib/utils'
import { buildBusinessStarter, type BusinessIntake } from '@/lib/spaces/business-starter'
import { type ActionResult, fail } from '@/lib/action-result'

/** The fields the create wizard collects. `visibility` defaults to 'network' (discoverable). The
 *  `modeVariant` (the Focus, Space Modes M3) is optional: null resolves to the type's default Focus. */
export interface CreateSpaceInput {
  type: string
  name: string
  slug: string
  brandName?: string | null
  visibility?: 'network' | 'private'
  /** The Focus sub-mode chosen in the "what do you run?" step. Null = the type's default Focus. */
  modeVariant?: string | null
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
 * success this REDIRECTS to /spaces/<slug>/manage (so it returns nothing on the happy path).
 * Returns an ActionResult error on any guard failure so the wizard can surface it inline.
 */
export async function createSpace(input: CreateSpaceInput): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to create a space.')

  // Type: only a provisionable type may be provisioned (the canonical list; an unknown / non-
  // provisionable type like `root` is rejected).
  const type = (input.type ?? '').trim()
  if (!isProvisionableType(type)) return fail('Pick a space type from the list.')

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

  // Brand name is no longer collected at create (ADR-552 Phase 4): it defaults to the name and is
  // editable later in Basics. A legacy caller may still pass one, so honor it when present.
  const brandName = (input.brandName ?? '').trim() || name
  const visibility = input.visibility === 'private' ? 'private' : 'network'

  // Focus (Space Modes M3): the sub-mode chosen in "what do you run?". Validate against the registry +
  // confirm it belongs to THIS type (resolveMode falls back to the default for an out-of-mode variant,
  // so a mismatched value resolves but does not belong here). An unknown / mismatched / absent variant
  // is stored as null, which resolves to the type's DEFAULT Focus in code. Mode is FREE framing, so this
  // never affects entitlements.
  const requested = (input.modeVariant ?? '').trim()
  const resolvedMode = requested && isSpaceType(type) ? resolveMode(type, requested) : null
  const modeVariant =
    requested && isModeVariant(requested) && resolvedMode?.variant === requested ? requested : null

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

  // Insert the Space. status active, plan free, the seeded tool config, the default DAWN skin,
  // owner = caller, ported into the network. brand_name seeds from the chosen brand/name. mode_variant
  // seeds the chosen Focus (null = the type's default Focus, resolved in code); Space Modes M3.
  let spaceId: string
  try {
    const { data, error } = await spacesTable()
      .insert({
        slug,
        name,
        type,
        status: 'active',
        entity_id: entityId,
        skin: DEFAULT_SPACE_SKIN,
        network_connected: true,
        visibility,
        plan: 'free',
        entitlements: seedEntitlements,
        feature_roles: seedFeatureRoles,
        owner_profile_id: profileId,
        brand_name: brandName,
        mode_variant: modeVariant,
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

  // ONBOARDING preset (Space Modes M4): seed the Mode's starter CRM pipeline. Reuses the existing
  // ensureSpaceStages plumbing (lib/crm/pipeline.ts) keyed on the Space type, so onboarding does not
  // fork a parallel seed path. Idempotent + fail-safe (a no-op when the space already has stages, and it
  // never throws), so a seed failure never blocks provisioning. Best-effort: the redirect proceeds.
  if (isSpaceType(type)) {
    await ensureSpaceStages(spaceId, type, modeVariant)
  }

  // Success: hand the owner straight to their /manage console (ADR-552 Phase 4 — no double-hop through
  // /settings, which now just redirects here anyway). redirect() throws, so it must sit OUTSIDE any
  // try/catch (Next docs: redirecting.md).
  redirect(`/spaces/${slug}/manage`)
}

/** Find a free slug from a name: slugify it, then append -2, -3 ... until one is untaken (bounded). */
async function uniqueSlugFrom(name: string): Promise<string | null> {
  const base = slugify(name).slice(0, 40).replace(/^-+|-+$/g, '') || 'space'
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`
    if (isSafeSlug(candidate) && !(await slugTaken(candidate))) return candidate
  }
  return null
}

/**
 * BUSINESS QUICK-START provisioning. The simple, self-serve path a business owner takes: they drop a
 * name, a one-line "what you do", and their website / Instagram / Facebook, and this stands up a business
 * Space that already FEELS like theirs — a warm Frequency Loom cover, their real links, and a page whose
 * every content block is a PROMPT written to them (buildBusinessStarter). It writes NO finished copy for
 * them. The Space is created PRIVATE so the prompts are for the owner's eyes until they publish. On
 * success it REDIRECTS to the live Space page so they see it immediately (not the /manage console).
 */
export async function createBusinessSpace(input: BusinessIntake): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to create a space.')

  const name = (input.name ?? '').trim()
  if (!name) return fail('Give your business a name.')
  if (name.length > 200) return fail('That name is too long. Keep it under 200 characters.')

  const slug = await uniqueSlugFrom(name)
  if (!slug) return fail('We could not make a web address from that name. Try a different name.')

  const entityId = await rootEntityId()
  if (!entityId) return fail('Spaces are not ready yet. Try again in a moment.')

  // Seed the business type's tool config from the operator's per-type defaults over the code defaults.
  const typeDefaults = await listTypeDefaultsForType('business')
  const { entitlements: seedEntitlements, featureRoles: seedFeatureRoles } = seedSpaceConfigFromDefaults(
    'business',
    typeDefaults,
  )

  const starter = buildBusinessStarter({
    name,
    whatYouDo: (input.whatYouDo ?? '').trim(),
    website: input.website,
    instagram: input.instagram,
    facebook: input.facebook,
  })

  let created: string
  try {
    const { data, error } = await spacesTable()
      .insert({
        slug,
        name,
        type: 'business',
        status: 'active',
        entity_id: entityId,
        skin: DEFAULT_SPACE_SKIN,
        network_connected: true,
        // Private until they publish: the seeded prompts are owner-facing guidance, never public copy.
        visibility: 'private',
        plan: 'free',
        entitlements: seedEntitlements,
        feature_roles: seedFeatureRoles,
        owner_profile_id: profileId,
        brand_name: name,
        mode_variant: null,
        // Starter identity so the page is never blank: a warm cover, a tagline prompt, a short-about
        // prompt, and the owner's real links + a story prompt in preferences.profileData.
        cover_image_url: starter.coverImageUrl,
        tagline: starter.tagline,
        about: starter.aboutShort,
        preferences: { profileData: starter.profileData },
      })
      .select('id')
      .maybeSingle()
    if (error || !data?.id) return fail('Could not create your space. Try again.')
    created = data.id
  } catch {
    return fail('Could not create your space. Try again.')
  }

  await addSpaceMember({ spaceId: created, profileId, role: 'admin', status: 'active' })
  await ensureSpaceStages(created, 'business', null)

  // Land them ON their new page so they see it right away. redirect() throws, so it sits outside try.
  redirect(`/spaces/${slug}`)
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
