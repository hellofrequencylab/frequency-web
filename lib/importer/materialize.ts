// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the MATERIALIZER (P0, docs/BUSINESS-IMPORTER.md §5).
//
// Given a hand-authored BusinessProfile draft and a target (create a NEW business Space,
// or update an EXISTING one by id), idempotently seed a complete "living business":
//   • the Space row (type business/nonprofit, unlisted/draft demo posture) + owner seat,
//   • brand accent + logo/hero (a ready public URL is stored as-is; P1 uploads bytes),
//   • the entity-blocks LAYOUT (spaces.preferences.profileLayout jsonb) + content bags (the
//     Space-profile surface) AND the Site (website) Home Puck doc (preferences.pageDocs.home,
//     the /sites/[slug] surface) — the two layout systems the three business surfaces render from,
//   • the central profileData (contact / hours / socials / about / offerings / rating),
//   • the function RECORDS (availability windows, FAQ rows, event rows) via admin inserts
//     bound to the target space_id,
//   • an OPTIONAL Spotlight dressing of a demo owner's profile (member grid + enable).
//
// ZERO AI, ZERO network. SERVER-SIDE, service-role admin client. EVERY write is BOUND to
// the target space_id (tenancy), so this passes the lib-side authz-guard scan (a lib file
// that mutates through the admin client must bind its write to a scope column).
//
// IDEMPOTENT + re-runnable, keyed by the target space_id: a re-run OVERWRITES the seeded
// surfaces rather than duplicating them (availability / faqs are delete-then-insert; events
// are matched by (space_id, slug); preferences are read-modify-write). For P0, overwrite
// semantics are acceptable.
//
// TODO(P5 — edit-wins): preserve operator edits on re-apply. The spec (§5) calls for an
// `edited_fields` marker on the Space so a re-harvest never clobbers a human edit. P0
// overwrites; P5 diffs the draft against the live Space and only writes un-edited fields.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { insertSpaceLibraryImage } from '@/lib/library/store'
import { withImageOrder } from './media-order'
import { addSpaceMember } from '@/lib/spaces/membership'
import { normalizeWindow } from '@/lib/spaces/booking'
import { withProfileData } from '@/lib/spaces/profile-data'
import { sanitizeEntityLayout } from '@/lib/entity-blocks/layout'
import { withMemberGridLayout } from '@/lib/entity-blocks/member-grid-meta'
import { withSpotlightEnabled } from '@/lib/profile/spotlight-flags'
import { isSafeSlug } from '@/lib/theme/validate'
import { withPageDoc, HOME_SLUG } from '@/lib/spaces/profile-pages'
import type { EntityLayout } from '@/lib/entity-blocks/layout'
import type { BusinessProfile, ProvenanceLedger } from './schema'
import { buildPlan, type MaterializationPlan, type CommercialPolicy } from './map'
import { composeSiteHomeDoc } from './site-compose'

// ── Target + result ─────────────────────────────────────────────────────────────

/** Where to materialize: create a NEW Space (the operator seeder default), or update an
 *  EXISTING Space by id (a re-run / an operator-picked target). */
export type MaterializeTarget =
  | { kind: 'create'; ownerProfileId: string }
  | { kind: 'update'; spaceId: string }

/**
 * Optional knobs. `demoOwnerProfileId` dresses that member's Spotlight (member grid + enable) as
 * demo-dressing (§5 note).
 *
 * The commercial-fact gate (docs §4.3) is an INDEPENDENT second gate the materializer enforces,
 * distinct from the verifier's splitVerified. Choose ONE of:
 *   • `verificationPolicy: 'allow'` — trust every commercial fact (P0 hand-authored draft; the caller
 *     opts IN explicitly). FAIL-CLOSED default: when NEITHER `verificationPolicy` NOR `ledger` is
 *     given, the policy is 'withhold', so a direct call that forgets the flag cannot leak.
 *   • `ledger` — the provenance ledger; the map re-derives PER FIELD whether each commercial fact is a
 *     verified fact (kind:'fact' && verifiedBy) and publishes only those. This is the P1 path: it
 *     REVIVES the verified path (verified facts publish) while withholding uncleared/generated ones,
 *     and re-checks independently of splitVerified.
 * If both are given, `ledger` wins (the per-field re-derivation is stronger than the coarse flag).
 */
export interface MaterializeOptions {
  demoOwnerProfileId?: string
  verificationPolicy?: 'allow' | 'withhold'
  /** The provenance ledger for a per-field commercial-fact gate (P1). Overrides verificationPolicy. */
  ledger?: ProvenanceLedger
  /** Mark the seeded Space as a demo (unlisted/draft; stored on preferences.isDemo — there is no
   *  spaces.is_demo column yet, see the report). Default true for a create. */
  isDemo?: boolean
}

/** What the materializer seeded (or would have). */
export interface MaterializeResult {
  ok: boolean
  spaceId?: string
  slug?: string
  /** A short reason when ok is false. */
  error?: string
  /** What was written, for the test + the review board. */
  seeded?: {
    createdSpace: boolean
    profileData: boolean
    /** The Space-profile block-picker grid (preferences.profileLayout). */
    layout: boolean
    /** The Site (website) Home Puck doc (preferences.pageDocs.home). */
    siteDoc: boolean
    availabilityWindows: number
    faqs: number
    events: number
    spotlightDressed: boolean
  }
}

// ── Untyped admin handles (spaces / space_availability / space_faqs / events are not in the
//    generated DB types yet — ADR-246 — so reach them through narrow untyped casts). ──────

type UpdateChain = { eq: (c: string, v: string) => Promise<{ error: unknown }> }
type InsertResult = Promise<{ error: unknown; data?: unknown }>
type DeleteChain = { eq: (c: string, v: string) => Promise<{ error: unknown }> }

interface AdminTable {
  update: (v: Record<string, unknown>) => UpdateChain
  insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
    select: (cols: string) => { maybeSingle: () => Promise<{ data: { id?: string } | null; error: unknown }> }
  } & InsertResult
  delete: () => DeleteChain
  select: (cols: string) => {
    eq: (c: string, v: string) => {
      eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { id?: string } | null; error: unknown }> }
      maybeSingle: () => Promise<{ data: { id?: string; meta?: unknown; preferences?: unknown } | null; error: unknown }>
    }
  }
}

function adminFrom(table: string): AdminTable {
  const db = createAdminClient() as unknown as { from: (t: string) => AdminTable }
  return db.from(table)
}

// ── The materializer ─────────────────────────────────────────────────────────────

/**
 * Materialize a BusinessProfile into a business Space. Deterministic, idempotent, zero AI.
 * On `create`, provisions a NEW unlisted/draft Space owned by `ownerProfileId`. On `update`,
 * re-seeds the existing Space (overwrite semantics for P0). Returns a MaterializeResult.
 */
export async function materializeBusiness(
  profile: BusinessProfile,
  target: MaterializeTarget,
  options: MaterializeOptions = {},
): Promise<MaterializeResult> {
  // FAIL-CLOSED: the commercial-fact gate. A ledger (P1) drives a per-field re-derivation; else the
  // coarse flag; else, when the caller gives NEITHER, withhold (a forgotten flag cannot leak, §4.3).
  const policy: CommercialPolicy = options.ledger
    ? { mode: 'ledger', ledger: options.ledger }
    : (options.verificationPolicy ?? 'withhold')
  const plan = buildPlan(profile, policy)
  if (!plan) return { ok: false, error: 'Draft is missing a usable name or slug.' }

  // Resolve the target space id (provision on create).
  let spaceId: string
  let createdSpace = false
  let ownerProfileId: string | null = null

  if (target.kind === 'create') {
    ownerProfileId = target.ownerProfileId
    const provisioned = await provisionSpace(plan, ownerProfileId, options.isDemo ?? true)
    if (!provisioned) return { ok: false, error: 'Could not provision the space.' }
    spaceId = provisioned
    createdSpace = true
  } else {
    const existing = await getSpaceById(target.spaceId)
    if (!existing) return { ok: false, error: 'Target space not found.' }
    spaceId = existing.id
    ownerProfileId = existing.ownerProfileId
    // Re-apply the identity columns + demo posture on update (overwrite semantics, P0).
    await updateSpaceIdentity(spaceId, plan)
  }

  // Every step below binds to `spaceId`. Each is best-effort + idempotent; a single failure
  // does not abort the whole seed (the result reports counts so the caller/test can assert).
  const prefsWrite = await writeProfileDataAndLayout(spaceId, plan, profile, policy)
  const availabilityWindows = await seedAvailability(spaceId, plan)
  const faqs = await seedFaqs(spaceId, plan)
  const events = await seedEvents(spaceId, plan, ownerProfileId)

  let spotlightDressed = false
  if (options.demoOwnerProfileId) {
    spotlightDressed = await dressSpotlight(options.demoOwnerProfileId, profile)
  }

  return {
    ok: true,
    spaceId,
    slug: plan.identity.slug,
    seeded: {
      createdSpace,
      profileData: prefsWrite.profileData,
      layout: true,
      siteDoc: prefsWrite.siteDoc,
      availabilityWindows,
      faqs,
      events,
      spotlightDressed,
    },
  }
}

// ── Step 1: provision the Space ─────────────────────────────────────────────────────

/**
 * Insert a NEW business Space (unlisted/draft demo posture) owned by `ownerProfileId`, then seat
 * the owner as a Space admin. Mirrors lib/spaces/provision.ts createSpace, but WITHOUT the session
 * gate + redirect (this is a service-role seed, not an interactive create) and WITH the demo
 * posture (visibility 'private', preferences.isDemo). Idempotent on the slug: if the slug is taken,
 * a numeric suffix is appended so a re-seed of a new name never collides. Returns the space id.
 */
async function provisionSpace(
  plan: MaterializationPlan,
  ownerProfileId: string,
  isDemo: boolean,
): Promise<string | null> {
  const entityId = await loadRootSpaceId().then(rootEntityIdFromRoot)
  if (!entityId) return null

  const slug = await freeSlug(plan.identity.slug)
  if (!slug) return null

  const preferences: Record<string, unknown> = {}
  if (isDemo) preferences.isDemo = true
  // websitePublished is intentionally UNSET (draft): the Site at /sites/[slug] stays unpublished
  // until an operator flips it live (§9b). A demo Space is visibility 'private' too.

  const row: Record<string, unknown> = {
    slug,
    name: plan.identity.name,
    type: plan.identity.type,
    status: 'active',
    entity_id: entityId,
    skin: 'dawn',
    network_connected: true,
    visibility: isDemo ? 'private' : 'network',
    plan: 'free',
    entitlements: {},
    feature_roles: {},
    owner_profile_id: ownerProfileId,
    brand_name: plan.identity.brandName,
    tagline: plan.identity.tagline,
    about: plan.identity.about,
    brand_accent: plan.identity.brandAccent,
    brand_logo_url: plan.identity.brandLogoUrl,
    cover_image_url: plan.identity.coverImageUrl,
    preferences,
  }

  try {
    const { data, error } = await adminFrom('spaces').insert(row).select('id').maybeSingle()
    if (error || !data?.id) return null
    // Seat the owner (service-role store, bound to space_id).
    await addSpaceMember({ spaceId: data.id, profileId: ownerProfileId, role: 'admin', status: 'active' })
    // Persist the identity's derived slug back into the plan so the caller reports the real slug.
    plan.identity.slug = slug
    return data.id
  } catch {
    return null
  }
}

/** The root Space's entity_id (the platform money partition). Reads the root row's entity_id via
 *  the admin client. Returns null pre-migration (provisioning then fails cleanly). */
async function rootEntityIdFromRoot(rootSpaceId: string | null): Promise<string | null> {
  if (!rootSpaceId) return null
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { entity_id?: string } | null }> } } }
    }
    const { data } = await db.from('spaces').select('entity_id').eq('id', rootSpaceId).maybeSingle()
    return data?.entity_id ?? null
  } catch {
    return null
  }
}

/** A free slug: the requested slug if untaken, else `${slug}-2`, `${slug}-3`… up to a small bound.
 *  Returns '' when the base slug is unsafe. Binds only to the globally-unique slug column. */
async function freeSlug(base: string): Promise<string> {
  if (!isSafeSlug(base)) return ''
  for (let n = 0; n < 20; n++) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`
    if (!isSafeSlug(candidate)) continue
    if (!(await slugTaken(candidate))) return candidate
  }
  return ''
}

async function slugTaken(slug: string): Promise<boolean> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { id?: string } | null }> } } }
    }
    const { data } = await db.from('spaces').select('id').eq('slug', slug).maybeSingle()
    return !!data?.id
  } catch {
    return true // fail-closed: do not claim a slug we cannot confirm free
  }
}

/** Re-apply identity columns to an existing Space (update target, overwrite semantics). Binds to
 *  the space id. Does NOT touch the slug (a live slug is load-bearing and never overwritten). */
async function updateSpaceIdentity(spaceId: string, plan: MaterializationPlan): Promise<void> {
  const patch: Record<string, unknown> = {
    name: plan.identity.name,
    type: plan.identity.type,
    brand_name: plan.identity.brandName,
    tagline: plan.identity.tagline,
    about: plan.identity.about,
    brand_accent: plan.identity.brandAccent,
  }
  if (plan.identity.brandLogoUrl) patch.brand_logo_url = plan.identity.brandLogoUrl
  if (plan.identity.coverImageUrl) patch.cover_image_url = plan.identity.coverImageUrl
  try {
    await adminFrom('spaces').update(patch).eq('id', spaceId)
  } catch {
    /* best-effort */
  }
}

// ── Step 2: profileData + layout (read-modify-write of spaces.preferences) ──────────────

/**
 * Write the central profileData + the profileLayout jsonb + accent + the SITE Home doc onto
 * spaces.preferences, as a read-modify-write that PRESERVES every other preferences key (mode,
 * moduleMenu, isDemo, …). The layout is sanitized to space blocks (`sanitizeEntityLayout(layout,
 * 'space')`) so a bad block id or content bag never persists. Bound to the space id. Returns whether
 * profileData was written.
 *
 * THE 3-SURFACE compose (docs §5). One seeded Space paints three surfaces from this one write:
 *   • Space profile (/spaces/[slug]) renders the block-picker grid -> preferences.profileLayout.
 *   • Site (/sites/[slug]) renders a Puck doc -> preferences.pageDocs.home, filtered for 'website'.
 *     composeSiteHomeDoc folds the reframed prose into that doc under the SAME commercial-fact
 *     `policy`, so a withheld / generated claim is withheld on the Site too. It is written ONLY when
 *     home has no operator-authored doc yet (edit-wins: never clobber a hand-edited Site page). The
 *     Site stays UNPUBLISHED (websitePublished unset) until an operator flips it live (§9b).
 *   • Spotlight is dressed separately (dressSpotlight), so each surface regenerates independently.
 */
async function writeProfileDataAndLayout(
  spaceId: string,
  plan: MaterializationPlan,
  profile: BusinessProfile,
  policy: CommercialPolicy,
): Promise<{ profileData: boolean; siteDoc: boolean }> {
  const space = await getSpaceById(spaceId)
  const currentPrefs =
    space?.preferences && typeof space.preferences === 'object' && !Array.isArray(space.preferences)
      ? { ...(space.preferences as Record<string, unknown>) }
      : {}

  // profileData: merge the mapped fields over the current central data (withProfileData normalizes).
  const withData = withProfileData(currentPrefs, plan.profileData)

  // profileLayout: sanitize to the space kind, then store (or clear when nothing survives).
  const safeLayout: EntityLayout | null = sanitizeEntityLayout(plan.layout, 'space')
  let next: Record<string, unknown> = { ...withData }
  if (safeLayout) next.profileLayout = safeLayout
  // (leave any existing profileLayout in place if sanitize returned null — do not wipe on a no-op)

  // SITE Home doc: seed pageDocs.home only when the operator has not authored one, so a hand-edited
  // Site page is never overwritten on a re-run (edit-wins). Uses the same commercial-fact policy, so
  // the Site withholds the same unverified prose the profile does.
  const hasAuthoredHome = existingHomeDoc(currentPrefs)
  const siteDoc = !hasAuthoredHome
  if (siteDoc) {
    next = withPageDoc(next, HOME_SLUG, composeSiteHomeDoc(profile, policy))
  }

  try {
    await adminFrom('spaces').update({ preferences: next }).eq('id', spaceId)
    return { profileData: Object.keys(plan.profileData).length > 0, siteDoc }
  } catch {
    return { profileData: false, siteDoc: false }
  }
}

/** Whether the Space already carries an operator-authored Home Puck doc at preferences.pageDocs.home
 *  (so the seeder must not overwrite it). A legacy single-doc `preferences.puck` also counts as
 *  operator content. PURE + total. */
function existingHomeDoc(prefs: Record<string, unknown>): boolean {
  const docs = prefs.pageDocs
  if (docs && typeof docs === 'object' && !Array.isArray(docs) && (docs as Record<string, unknown>)[HOME_SLUG]) {
    return true
  }
  return !!prefs.puck
}

// ── Step 3: availability windows (delete-then-insert, bound to space_id) ────────────────

async function seedAvailability(spaceId: string, plan: MaterializationPlan): Promise<number> {
  const clean = plan.availability
    .map((w) => normalizeWindow(w))
    .filter((w): w is NonNullable<typeof w> => w !== null)
  try {
    // Idempotent replace: clear this space's windows, then insert the new set (mirrors the
    // booking store's own replace, but service-role and bound to space_id).
    await adminFrom('space_availability').delete().eq('space_id', spaceId)
    if (clean.length === 0) return 0
    const rows = clean.map((w) => ({
      space_id: spaceId,
      weekday: w.weekday,
      start_minute: w.startMinute,
      end_minute: w.endMinute,
      slot_minutes: w.slotMinutes,
      timezone: w.timezone,
    }))
    const { error } = await adminFrom('space_availability').insert(rows)
    return error ? 0 : rows.length
  } catch {
    return 0
  }
}

// ── Step 4: FAQ rows (delete-then-insert, bound to space_id) ────────────────────────────

async function seedFaqs(spaceId: string, plan: MaterializationPlan): Promise<number> {
  try {
    await adminFrom('space_faqs').delete().eq('space_id', spaceId)
    if (plan.faqs.length === 0) return 0
    const rows = plan.faqs.map((f) => ({
      space_id: spaceId,
      question: f.question,
      answer: f.answer,
      position: f.position,
    }))
    const { error } = await adminFrom('space_faqs').insert(rows)
    return error ? 0 : rows.length
  } catch {
    return 0
  }
}

// ── Step 5: events (idempotent by (space_id, slug), bound to space_id) ──────────────────

/**
 * Seed events as space_id-stamped, standalone rows. A standalone event self-references its host as
 * scope (scope_type 'standalone', scope_id = host_id) to satisfy the NOT NULL scope_id on a live
 * table (20260625010000_standalone_public_events.sql). Idempotent: an event whose derived slug
 * already exists for this space is skipped (never duplicated). host_id is the space owner; when the
 * owner is unknown (a legacy update target), events are skipped rather than mis-attributed.
 */
async function seedEvents(
  spaceId: string,
  plan: MaterializationPlan,
  ownerProfileId: string | null,
): Promise<number> {
  if (plan.events.length === 0) return 0
  if (!ownerProfileId) return 0 // cannot attribute a host; skip rather than guess
  let seeded = 0
  for (const e of plan.events) {
    const slug = eventSlug(e.title, e.startsAt, spaceId)
    try {
      if (await eventSlugExists(slug)) {
        seeded++ // already present for an earlier run — counts as seeded (idempotent)
        continue
      }
      const row: Record<string, unknown> = {
        title: e.title,
        description: e.description,
        location: e.location,
        starts_at: e.startsAt,
        ends_at: e.endsAt,
        host_id: ownerProfileId,
        scope_id: ownerProfileId, // standalone self-reference (satisfies NOT NULL scope_id)
        scope_type: 'standalone',
        space_id: spaceId,
        slug,
        status: 'published',
        visibility: 'unlisted',
      }
      const { error } = await adminFrom('events').insert(row)
      if (!error) seeded++
    } catch {
      /* best-effort per event */
    }
  }
  return seeded
}

/** A deterministic, space-scoped event slug so a re-run matches the same event (idempotency key).
 *  Includes a short space-id fragment so two spaces can seed identically-titled events. */
function eventSlug(title: string, startsAtISO: string, spaceId: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const day = startsAtISO.slice(0, 10)
  const frag = spaceId.replace(/-/g, '').slice(0, 6)
  return `${base || 'event'}-${day}-${frag}`
}

async function eventSlugExists(slug: string): Promise<boolean> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { id?: string } | null }> } } }
    }
    const { data } = await db.from('events').select('id').eq('slug', slug).maybeSingle()
    return !!data?.id
  } catch {
    return false
  }
}

// ── Step 6: Spotlight dressing (optional demo-dressing, §5 note) ────────────────────────

/**
 * Dress a demo owner's Spotlight so the seeded demo looks lived-in: write a member GRID layout
 * (a single `links` row from the business links) into profiles.meta.entityGrid and enable
 * Spotlight. Reuses the PURE meta writers (withMemberGridLayout / withSpotlightEnabled) and binds
 * the write to the given profile id via the admin client. Session-derived spotlight-actions.ts can
 * NOT be reused here (they gate on the caller's own session), hence the direct, id-bound write.
 * Best-effort; returns whether it wrote.
 */
async function dressSpotlight(profileId: string, profile: BusinessProfile): Promise<boolean> {
  const links = (profile.links ?? [])
    .map((l) => ({ label: (l.platform ?? '').trim() || (l.url ?? '').trim(), url: (l.url ?? '').trim() }))
    .filter((l) => l.url)
  // A member links block content bag (sanitized to the 'member' kind).
  const rawLayout: EntityLayout = {
    rows: [{ id: 'r0', columns: 1, cells: [['links']] }],
    content: links.length ? { links: { items: links } } : undefined,
  }
  const safe = sanitizeEntityLayout(rawLayout, 'member')
  try {
    const table = adminFrom('profiles')
    const { data } = await table
      .select('meta')
      .eq('id', profileId)
      .maybeSingle()
    const currentMeta = (data as { meta?: unknown } | null)?.meta
    let nextMeta = withMemberGridLayout(currentMeta, safe)
    nextMeta = withSpotlightEnabled(nextMeta, true)
    const { error } = await adminFrom('profiles').update({ meta: nextMeta }).eq('id', profileId)
    return !error
  } catch {
    return false
  }
}

// ── The intake wrapper (the spec's applyIntake seam; the table is P1) ───────────────────

/**
 * Apply an approved `business_intake` row (docs §5 `applyIntake`). Wired in P1 now that the
 * `business_intake` table exists (migration 20261022000000): read the row's `draft` (the VERIFIED
 * BusinessProfile the research pipeline produced) + its `ledger`, and materialize with the ledger as
 * an INDEPENDENT per-field commercial-fact gate (docs §4.3): the materializer re-derives, per field,
 * whether each commercial fact is a verified fact (kind:'fact' && verifiedBy) and publishes ONLY
 * those. So a genuinely verified fact publishes (the verified path is live) while every uncleared or
 * generated fact is withheld here too, independently of P1's splitVerified. Then stamp
 * target_space_id + applied_at + status='applied'. Only from 'review' (or 'applied', idempotent
 * re-run); never mid-research. Never throws. The deterministic core is materializeBusiness.
 */
export async function applyIntake(
  intakeId: string,
  options: { ownerProfileId?: string } = {},
): Promise<MaterializeResult> {
  const store = await import('./store')
  const row = await store.getIntake(intakeId)
  if (!row) return { ok: false, error: 'Intake not found.' }
  if (row.status !== 'review' && row.status !== 'applied') {
    return { ok: false, error: `Intake is '${row.status}', not ready to apply (expected 'review').` }
  }
  const rawProfile = row.draft as unknown as BusinessProfile
  if (!rawProfile?.name) return { ok: false, error: 'Intake draft has no usable business name.' }

  // PRIMARY IMAGE = HERO on seed (Importer v2): fold the operator's staged image order onto the draft's
  // media so the primary becomes the hero (cover + photoHero image) and the rest become the gallery block,
  // honouring the hero lock. Robust even if the draft's media was never synced through the review board.
  const stagedImages = Array.isArray(row.inputs.images)
    ? row.inputs.images.filter((u): u is string => typeof u === 'string' && u.length > 0)
    : []
  const profile = stagedImages.length
    ? withImageOrder(rawProfile, stagedImages, { lockHero: !!row.inputs.lockHero })
    : rawProfile

  // Re-materialize onto the existing Space on a re-run, else provision a new one owned by the
  // operator/owner. The ledger drives a PER-FIELD gate: verified facts publish, everything else is
  // withheld here too (independently of the verifier's splitVerified).
  const owner = options.ownerProfileId ?? row.createdBy
  const target: MaterializeTarget = row.targetSpaceId
    ? { kind: 'update', spaceId: row.targetSpaceId }
    : { kind: 'create', ownerProfileId: owner }

  // NEVER dress a member's Spotlight from a seed. `demoOwnerProfileId` used to be the seeding OPERATOR,
  // so applying a demo overwrote that operator's OWN profile grid (meta.entityGrid) with the business's
  // links — a cross-contamination bug (a staff operator seeding a demo had their personal profile clobbered).
  // The seeded Space stands on its own; it must not reach into any real member's profile. Left undefined.
  const result = await materializeBusiness(profile, target, {
    ledger: (row.ledger as ProvenanceLedger) ?? {},
    isDemo: row.inputs.consent?.isDemo ?? true,
  })
  if (!result.ok || !result.spaceId) return result

  // Importer v2: FILE the operator's staged seed images into the new Space's Loom (space-scoped), so
  // the owner has them the moment they claim / edit the Space. Best-effort: a filing miss never fails
  // the apply. Idempotent: only images not already filed (a re-apply, or a post-apply upload that filed
  // directly) are filed, tracked on inputs.imagesFiledToLoom. The first image seeds the cover if unset.
  const seedImages = Array.isArray(row.inputs.images)
    ? row.inputs.images.filter((u): u is string => typeof u === 'string' && u.length > 0)
    : []
  if (seedImages.length > 0) {
    const alreadyFiled = Array.isArray(row.inputs.imagesFiledToLoom)
      ? row.inputs.imagesFiledToLoom.filter((u): u is string => typeof u === 'string')
      : []
    const toFile = seedImages.filter((u) => !alreadyFiled.includes(u))
    const filed = await fileSeedImagesIntoLoom(result.spaceId, toFile, { primaryUrl: seedImages[0] })
    if (filed.length > 0) {
      await store.setInputs(intakeId, {
        ...row.inputs,
        imagesFiledToLoom: [...alreadyFiled, ...filed],
      })
    }
  }

  await store.markApplied(intakeId, result.spaceId)
  await store.setStatus(intakeId, 'applied', { error: null })
  return result
}

// ── Seed images → the Space's Loom (Importer v2) ────────────────────────────────────────

/**
 * File each given seed image (a public `library-media` URL) into the target Space's OWN Loom
 * (library_assets, space-scoped) so a claimed Space carries the operator-uploaded photos as its own
 * assets. Best-effort per image (a miss is skipped, never thrown); RETURNS the URLs that filed, so the
 * caller can record them and keep filing idempotent across the Apply + post-apply-upload paths. When
 * `opts.primaryUrl` is set and the Space has no cover yet, that image is promoted to the cover so the
 * seeded Space is not blank. EXPORTED so the seeder's post-apply upload files onto a live Space too.
 */
export async function fileSeedImagesIntoLoom(
  spaceId: string,
  images: string[],
  opts: { primaryUrl?: string } = {},
): Promise<string[]> {
  const filed: string[] = []
  for (const [i, url] of images.entries()) {
    const path = storagePathFromPublicUrl(url)
    const ext = (url.split('.').pop() || 'jpg').split(/[?#]/)[0].toLowerCase()
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
    try {
      const id = await insertSpaceLibraryImage({
        spaceId,
        title: `Seed image ${i + 1}`,
        slug: `seed-${(path || url).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(-80) || i}`,
        storageBucket: 'library-media',
        storagePath: path ?? url,
        url,
        mime,
        bytes: 0,
      })
      if (id) filed.push(url)
    } catch {
      /* best-effort per image */
    }
  }

  // Promote the primary image to the cover when the Space has none (do not clobber a real cover).
  if (opts.primaryUrl) {
    try {
      const space = await getSpaceById(spaceId)
      if (space && !space.coverImageUrl) {
        await adminFrom('spaces').update({ cover_image_url: opts.primaryUrl }).eq('id', spaceId)
      }
    } catch {
      /* best-effort */
    }
  }
  return filed
}

/** Derive the object path within the `library-media` bucket from its public URL, or null when the URL
 *  is not a recognizable public storage URL for that bucket. PURE + total. */
function storagePathFromPublicUrl(url: string): string | null {
  const marker = '/library-media/'
  const at = url.indexOf(marker)
  if (at < 0) return null
  const rest = url.slice(at + marker.length)
  const clean = rest.split(/[?#]/)[0]
  return clean || null
}
