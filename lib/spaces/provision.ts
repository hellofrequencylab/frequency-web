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
// On slug collision it returns a friendly fail; on success it redirects the new owner into the
// Space's SETUP walk (/spaces/<slug>/setup, ADR-1733), whose finish lands on the Circles manager, so
// the first screen is seeding and the second is hosting, never the console's command center
// (LIVE-261 amended; ADR-552 Phase 4 still holds for the console itself, no double-hop through
// /settings). A non-console type skips the walk and lands on the Circles manager directly.
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
import { spaceBirthConfig, finishSpaceBirth } from '@/lib/spaces/provision-core'
import { isSafeSlug } from '@/lib/theme/validate'
import { type ActionResult, fail } from '@/lib/action-result'
import { proposeAndConfirmCreate } from '@/lib/ai/vera/create-entity'
import { featureGatesLive } from '@/lib/pricing/settings'
import { isPaidSpacePlan, spaceCreationBlockReason } from '@/lib/pricing/space-limits'
import { postCreateLanding } from '@/lib/spaces/setup'
import { startSpaceFromNiche } from '@/lib/spaces/niche-start'
import { resolvePicker } from '@/lib/spaces/space-picker'
import { withMegaTheme } from '@/lib/theme/mega-theme'
import { parseIntents, parsePlanHint, planWantsBilling } from '@/lib/spaces/create-wizard'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { sendOperatorEmailForSpace } from '@/lib/marketing/operator-lifecycle'

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
  /** "How did you hear about us?" (LIVE-808). Optional; stored on the Space's preferences as
   *  `heardAbout` and in the audit draft. First-party only, never sent to a pixel. */
  heardAbout?: string | null
  /** The plan the wizard was opened for (`?plan=` from /pricing). A HINT: the Space is always born
   *  free; a paid hint only sends the owner to billing when the setup walk ends. */
  plan?: string | null
  /** What the owner said they want to do here (WIZARD_INTENTS ids, a multi-select, never a niche). Kept on
   *  the Space and in the audit draft, and recorded FIRST-PARTY ONLY: never sent to an ad pixel. */
  intents?: string[]
  /** The niche door the owner came through (`coaches`, `studios`, ...). Kept on the Space as
   *  `preferences.megaTheme.niche` (ADR-1881); an unknown value stores nothing. First-party only. */
  niche?: string | null
  /** The picker's other answers (lib/spaces/space-picker.ts, ADR-1883): the one thing people should do, a
   *  feel id, and an optional existing site. Each is re-validated here and an invalid one stores nothing. */
  action?: string | null
  feel?: string | null
  site?: string | null
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
 * success this REDIRECTS to `postCreateLanding(type, slug)` (lib/spaces/setup.ts): the setup walk at
 * /spaces/<slug>/setup for a Business or Nonprofit Space, the Circles manager for any other type, so
 * it returns nothing on the happy path. Returns an ActionResult error on any guard failure so the
 * wizard can surface it inline.
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

  // THE SHARED BIRTH (lib/spaces/provision-core.ts), the same two steps the Business Seeder's
  // materializer runs: the validated Focus (an unknown or mismatched variant stores null, which
  // resolves to the type's default Focus in code; Mode is free framing and never touches
  // entitlements), the operator's per-type tool defaults, the directory KIND seed (ADR-887), and the
  // setup preset (owner ruling 1 of ADR-1294; an explicit Spark choice beats the one derived from the
  // Focus, and bundles are subtractive so this can hide a tool and never grant a paid one).
  const birth = await spaceBirthConfig(type, { modeVariant: input.modeVariant, preset: input.preset })
  const modeVariant = birth.modeVariant

  const entityId = await rootEntityId()
  if (!entityId) return fail('Spaces are not ready yet. Try again in a moment.')

  // The source answer (LIVE-808), clipped like the signup one (meta.beta.heard_about). Blank = skipped.
  const heardAbout = (input.heardAbout ?? '').trim().slice(0, 120)
  // The plan the wizard was opened for (a HINT, never a grant): kept on the Space so the setup walk
  // can end on its billing page. Free is the default and stores nothing.
  const planIntent = planWantsBilling(input.plan) ? parsePlanHint(input.plan) : null
  const intents = parseIntents(input.intents)
  const picked = resolvePicker({ niche: input.niche, action: input.action, feel: input.feel, site: input.site })
  const seedPreferences: Record<string, unknown> = {
    ...withMegaTheme({}, picked),
    ...(planIntent ? { planIntent } : {}),
    ...(intents.length ? { startingIntents: intents } : {}),
    ...birth.preferences,
    ...(heardAbout ? { heardAbout } : {}),
  }

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
      preset: birth.presetId ?? '',
      heardAbout,
      intents: intents.join(','),
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
            entitlements: birth.entitlements,
            feature_roles: birth.featureRoles,
            owner_profile_id: profileId,
            brand_name: brandName,
            mode_variant: modeVariant,
            // The ADR-887 KIND seed and the LIVE-808 source answer (see above); omitted entirely when
            // there is nothing to seed so an unseeded Space keeps a bare row exactly as today.
            ...(Object.keys(seedPreferences).length ? { preferences: seedPreferences } : {}),
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

  // THE PICKS, FIRST-PARTY ONLY. One ledger row per Space, straight to the engagement ledger and NOT through
  // track(), which mirrors to GA4: what a member wants to do is theirs, and no pixel gets it. Best-effort
  // (analytics must never break a create); the stored `startingIntents` above is the durable copy.
  if (intents.length) {
    void recordEngagementEvent({
      idempotencyKey: `space_create_intents:${spaceId}`,
      source: 'web',
      eventType: 'space_create_intents',
      actorProfileId: profileId,
      context: { spaceId, type, intents, plan: input.plan ?? 'free' },
    }).catch(() => {})
  }

  // THE FUNNEL'S "SPACE CREATED" STEP, FIRST-PARTY ONLY (LIVE-1132). One ledger row per Space with the setup
  // chosen, the plan hint and whether the owner picked Decide later (no goals). Never mirrored to GA4: the
  // door and the goals are the owner's own. Best-effort; the existing Funnels admin reads the ledger.
  void recordEngagementEvent({
    idempotencyKey: `space_created:${spaceId}`,
    source: 'web',
    eventType: 'space_created',
    actorProfileId: profileId,
    context: {
      spaceId,
      type,
      modeVariant: modeVariant ?? null,
      plan: input.plan ?? 'free',
      decideLater: intents.length === 0,
      heardAbout: heardAbout || null,
    },
  }).catch(() => {})

  // DAY 0 OF THE OPERATOR EMAILS (LIVE-1141): the welcome goes out the moment the Space opens. Best-effort; the daily
  // lifecycle run sends day 1, 3 and 7 from the same Space row, and the outbox key keeps this one to a single send.
  void sendOperatorEmailForSpace(
    createAdminClient(),
    { id: spaceId, name, slug, type, mode_variant: modeVariant ?? null, owner_profile_id: profileId, created_at: new Date().toISOString() },
    0,
  ).catch(() => {})

  // Seat the owner as a Space admin (an explicit membership row, alongside owner_profile_id).
  await addSpaceMember({ spaceId, profileId, role: 'admin', status: 'active' })

  // APPLY THE PRESET AND SEED THE STARTER PIPELINE, through the shared birth. The bundle writer stays the
  // one writer (it never touches `spaces.plan` or the reserved billing namespace) and nothing stores
  // the preset id: its effect is the switches it wrote, and the audit draft above is the provenance.
  // Best-effort and NOT silent: both a refusal and a throw are logged (AGENTS "every fail-safe needs a
  // gate that notices it fired"), and a stage-seed failure never blocks provisioning.
  await finishSpaceBirth(spaceId, type, birth)
  // The niche door starts the tools only when no explicit choice or Focus already picked a preset (ADR-1882).
  if (!birth.presetId) await startSpaceFromNiche(spaceId, picked.niche)

  // Success: hand the owner to SETUP, then to HOSTING (ADR-1733 amending LIVE-261). This landed
  // on `/manage` until 2026-09-09, the console's command center (revenue, pipeline, contacts), and
  // on `/manage/circles` until 2026-10-12, which the owner read as "it just created it and dumped
  // me in a circle". A person who has owned a Space for four seconds has no story, no logo, no
  // contact details and no offerings, so the first screen is the walk that asks for them
  // (/spaces/<slug>/setup; every step saves through the existing update actions), and its finish
  // is the Circles this Space runs, LIVE-261's end state. The rule lives in `postCreateLanding`:
  // a console type (business / nonprofit) walks setup, any other type lands straight on
  // /manage/circles exactly as before. Hosting is free; the money surfaces are one click away.
  // redirect() throws, so it must sit OUTSIDE any try/catch (Next docs: redirecting.md).
  redirect(postCreateLanding(type, slug))
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
