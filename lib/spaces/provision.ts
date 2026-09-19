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
//   5. Apply the SETUP PRESET (owner ruling 1 of ADR-1294): a capability bundle, chosen in the Spark
//      or derived from the Mode, that leaves the Space's core tools on and the rest off but
//      switchable. Subtractive only, so it can never grant a paid tool. Best-effort and logged.
// On slug collision it returns a friendly fail; on success it redirects the new owner straight to the
// Space's Circles manager, so the first screen is hosting rather than the console's command center
// (LIVE-261; ADR-552 Phase 4 still holds for the console itself, no double-hop through /settings).
// Returns ActionResult on any path that DOESN'T redirect.
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
import { resolveMode, isModeVariant, kindForMode } from '@/lib/spaces/modes'
import { withProfileData } from '@/lib/spaces/profile-data'
import { ensureSpaceStages } from '@/lib/crm/pipeline'
import { isSafeSlug } from '@/lib/theme/validate'
import { type ActionResult, fail } from '@/lib/action-result'
import { proposeAndConfirmCreate } from '@/lib/ai/vera/create-entity'
import { featureGatesLive } from '@/lib/pricing/settings'
import { isPaidSpacePlan, spaceCreationBlockReason } from '@/lib/pricing/space-limits'
import { resolveSetupPreset, setupPresetForMode } from '@/lib/pricing/bundles'
import { setSpaceBundle } from '@/lib/pricing/space-bundle'

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
  /**
   * The STARTING SETUP: a capability-bundle id (`SETUP_PRESETS`, lib/pricing/bundles.ts) that shapes
   * which of the Space's tools open switched on. Null / absent / unregistered = derive one from the
   * Mode + Focus (`setupPresetForMode`), and apply none when that pair has no honest preset.
   */
  preset?: string | null
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

/** The active spaces a profile OWNS (plan only), for the creation-cap gate (ADR-810). Fail-safe to []. */
async function listOwnedSpacePlans(profileId: string): Promise<{ plan: string | null }[]> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ data: { plan: string | null }[] | null }> }
        }
      }
    }
    const { data } = await db.from('spaces').select('plan').eq('owner_profile_id', profileId).eq('status', 'active')
    return (data ?? []) as { plan: string | null }[]
  } catch {
    return []
  }
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

  // FUNNEL GATE (ADR-810): cap how many spaces a member may create — Crew unlocks the first space, and
  // owning a paid Business/Non Profit space unlocks unlimited. Gated on featureGatesLive() so while the
  // gates are not live anyone can still create (today's behavior); the cap bites when the beta grace
  // window ends (ADR-874), not the moment checkout opens. FAIL-SAFE: any read error inside
  // listOwnedSpacePlans degrades to an empty list, never a false lockout of a paid member.
  if (await featureGatesLive()) {
    const caller = await getCallerProfile()
    const owned = await listOwnedSpacePlans(profileId)
    const blocked = spaceCreationBlockReason({
      tier: caller?.realMembershipTier ?? 'free',
      ownedSpaceCount: owned.length,
      ownsPaidSpace: owned.some((r) => isPaidSpacePlan(r.plan)),
    })
    if (blocked) return fail(blocked)
  }

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

  // Directory KIND seed (ADR-887): the "what do you run?" choice IS the member saying what shape of
  // thing they are, so seed `preferences.profileData.kind` from the chosen Focus (kindForMode) and the
  // new Space lands in the right directory bucket instead of reading "Business" by default. Written
  // through withProfileData (the ONE profileData write seam) so the stored blob is the normalized
  // shape every reader expects. Sparse by design: no chosen Focus (or a nonprofit one) seeds nothing,
  // and existing rows are never backfilled — kind is the owner's data after provision.
  const seededKind = isSpaceType(type) ? kindForMode(type, modeVariant) : null

  // THE SETUP SHAPE (owner ruling 1 of ADR-1294; LIVE-249 + LIVE-149). A new Space opens with its
  // CORE tools on and the rest off but switchable, which is what a capability bundle does and the
  // only thing it does: bundles are SUBTRACTIVE, so this can hide a tool and can never grant a paid
  // one (lib/pricing/bundles.ts). An explicit choice from the Spark wins; otherwise the preset is
  // DERIVED from the "what do you run?" answer, because that answer already says which one it is.
  // Null on both paths (an unmapped Focus, no Focus at all) applies no bundle, so such a Space
  // stands up with every tool on exactly as it did before this existed.
  const setupPreset =
    resolveSetupPreset(input.preset) ?? (isSpaceType(type) ? setupPresetForMode(type, modeVariant) : null)

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
  //
  // THE GOVERNED WRITE (ADR-988, ADR-1249). The member named the Space and tapped Create, so the
  // insert runs as the commit of a proposal this call records, claims and closes out, and the
  // highest-value create on the platform lands in the audit log. The plan-limit gate above is the
  // scoped authority ADR-988 §4 names: the layer records it and does not re-check it. The payload
  // is untouched, and a failed write keeps the line this action always returned.
  const governed = await proposeAndConfirmCreate<string>({
    entity: 'space',
    // The preset rides in the draft so the audit log records the SHAPE the Space was born in, which
    // is the only durable trace of it: a preset is applied and not stored (see below).
    draft: {
      type,
      name,
      slug,
      brandName,
      visibility,
      modeVariant: modeVariant ?? '',
      preset: setupPreset?.id ?? '',
    },
    rationale: 'Space builder: the member named the Space and tapped Create.',
    commit: async () => {
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
            // The ADR-887 KIND seed (see above); omitted entirely when there is nothing to seed so an
            // unseeded Space keeps a bare row exactly as today.
            ...(seededKind ? { preferences: withProfileData(null, { kind: seededKind }) } : {}),
          })
          .select('id')
          .maybeSingle()
        if (error || !data?.id) throw new Error('Could not create the space. Try again.')
        return data.id
      } catch {
        throw new Error('Could not create the space. Try again.')
      }
    },
  })
  if ('error' in governed) return fail(governed.error)
  const spaceId = governed.data

  // Seat the owner as a Space admin (an explicit membership row, alongside owner_profile_id).
  await addSpaceMember({ spaceId, profileId, role: 'admin', status: 'active' })

  // APPLY THE SETUP PRESET. `setSpaceBundle` is the one writer for this (lib/pricing/space-bundle.ts)
  // and it stays the one writer: it reads the two jsonb columns this insert just seeded, hands them
  // to the pure resolver, and writes back the result, so the off-switches land over the operator's
  // per-type defaults rather than instead of them. It never touches `spaces.plan` or the reserved
  // `entitlements.billing` namespace, so no plan grant can be disturbed here.
  //
  // NOTHING STORES THE PRESET ID, on purpose. The preset's whole effect is the switches it wrote,
  // and those ARE the state every surface reads; a column holding the name of a shape the operator
  // has since edited would be a second, quietly wrong answer to "what is on". The audit draft above
  // is the provenance.
  //
  // Best-effort, like `ensureSpaceStages` below: a Space that exists with every tool on is a working
  // Space, and failing the provision here would be strictly worse. It is NOT silent, though (AGENTS
  // "every fail-safe needs a gate that notices it fired"): both the refusal and the throw are logged
  // with the space and the bundle, because a preset that stopped applying would otherwise look
  // exactly like a preset nobody chose.
  if (setupPreset) {
    try {
      const applied = await setSpaceBundle(spaceId, setupPreset.id)
      if (!applied.ok) {
        console.error(
          `[spaces/provision] setup preset "${setupPreset.id}" not applied to ${spaceId}: ${applied.reason}`,
        )
      }
    } catch (err) {
      console.error(`[spaces/provision] setup preset "${setupPreset.id}" threw for ${spaceId}:`, err)
    }
  }

  // ONBOARDING preset (Space Modes M4): seed the Mode's starter CRM pipeline. Reuses the existing
  // ensureSpaceStages plumbing (lib/crm/pipeline.ts) keyed on the Space type, so onboarding does not
  // fork a parallel seed path. Idempotent + fail-safe (a no-op when the space already has stages, and it
  // never throws), so a seed failure never blocks provisioning. Best-effort: the redirect proceeds.
  if (isSpaceType(type)) {
    await ensureSpaceStages(spaceId, type, modeVariant)
  }

  // Success: hand the owner straight to HOSTING (LIVE-261). This landed on `/manage` until
  // 2026-09-09, which is the console's command center: revenue, pipeline, contacts. A person who
  // has owned a Space for four seconds has no revenue and no contacts, so the first thing the
  // product said to them was "here is your CRM" — a tool for a business they have not started
  // running here yet. The Space is worth having because it hosts things, so the first screen is
  // the Circles this Space runs, with its own "start one" affordance and a link back to the rest
  // of the console. Hosting is free; the money surfaces are one click away when there is money.
  // redirect() throws, so it must sit OUTSIDE any try/catch (Next docs: redirecting.md).
  redirect(`/spaces/${slug}/manage/circles`)
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
