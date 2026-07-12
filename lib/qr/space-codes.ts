// SPACE-SCOPED managed codes (ENTITY-SPACES-BUILD §C, Phase 2 "QR studio per space"). The library
// behind the owner QR surface: list a Space's codes, create a code (capped per plan), and set a
// code's splash landing. The space-scoped analog of lib/qr/codes.ts (the pure slug/destination
// helpers) + the existing admin QR studio, but tenant-isolated by space_id.
//
// Backed by the service-role admin client plus UNTYPED casts (space_id + splash are not in the
// generated DB types yet, ADR-246, mirroring lib/crm/pipeline.ts and lib/spaces/memberships.ts). The
// server is the authority for "which space" and "what may this caller do here" (P5): every
// space-scoped read/write resolves the Space and re-checks getSpaceCapabilities(...).canEditProfile.
// READS fail-safe ([] / null); WRITES fail-closed (a permission miss returns an error, writes
// nothing).
//
// TENANCY: every read filters by space_id, and createSpaceCode stamps space_id on insert, so a caller
// for Space A can never list or mutate Space B's codes. setCodeSplash re-resolves the code's OWN
// space_id and gates on that Space, so a code id from another Space is rejected before any write.
//
// THE PER-PLAN CAP is enforced HERE, not in the DB (see the migration header): createSpaceCode reads
// the Space's plan, counts the Space's existing codes, and refuses a create past the cap. The cap is
// a product policy (it changes with plans), so it lives in app code, never a migration.
//
// VOICE: the owner-facing error strings obey CONTENT-VOICE (plain, no narrated feelings, no em/en
// dashes). The owner types code titles/targets; the form + §10 checklist guard those.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { isJanitor } from '@/lib/core/roles'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  generateSlug,
  normalizeSlug,
  isValidSlug,
  isValidTargetUrl,
  type DestinationType,
} from './codes'
import { normalizeSplash, type Splash } from './splash'
import type { ScanRow } from './analytics'

// ── Per-plan code cap ────────────────────────────────────────────────────────────────────────────
//
// How many managed codes a Space may own, by plan label (spaces.plan). DEFAULT-DENY-ish: an unknown
// or unset plan falls to the FREE cap (the smallest), so a misconfigured plan never grants more than
// free. The numbers are a sane starting policy (documented in the ADR + DATABASE.md); raising a cap
// is a one-line change here, never a migration.
const PLAN_CODE_CAPS: Record<string, number> = {
  free: 3,
  starter: 25,
  pro: 100,
  business: 500,
}
// The cap for an unset / unknown plan (the smallest, so a misconfigured plan is never over-granted).
const DEFAULT_CODE_CAP = PLAN_CODE_CAPS.free

/** The code cap for a plan label. An unset / unknown plan reads as the free cap (fail-small). Pure. */
export function codeCapForPlan(plan: string | null | undefined): number {
  if (!plan) return DEFAULT_CODE_CAP
  const cap = PLAN_CODE_CAPS[plan.trim().toLowerCase()]
  return typeof cap === 'number' ? cap : DEFAULT_CODE_CAP
}

// ── Types ────────────────────────────────────────────────────────────────────────────────────────

/** One space-scoped managed code as the owner surface consumes it (camelCased). A subset of the
 *  qr_codes columns the QR studio shows: identity + destination + live status + scan count + whether
 *  it carries a splash. */
export interface SpaceCode {
  id: string
  slug: string
  title: string
  destinationType: DestinationType
  targetUrl: string | null
  active: boolean
  scanCount: number
  /** Whether this code has a splash landing (the resolver renders it / redirects via its CTA). */
  hasSplash: boolean
  createdAt: string
}

/** The fields the owner provides to create a code. v1 supports the 'url' destination (any link); the
 *  other destination types stay on the admin studio. An optional custom slug; otherwise generated. */
export interface CreateSpaceCodeInput {
  title: string
  /** Any http(s) URL or a site-relative path (validated like the resolver's targets). */
  targetUrl: string
  /** An optional custom slug (normalized + uniqueness-checked); blank = a generated short slug. */
  slug?: string
}

// Hard caps so a malformed/hostile input can never store an unbounded value.
const MAX_TITLE_LEN = 120

// ── IO: the untyped admin-client seam (space_id/splash not in generated types yet, ADR-246) ────────

type CodeRow = {
  id: string
  slug: string
  title: string
  destination_type: string
  target_url: string | null
  active: boolean
  scan_count: number | null
  splash: unknown
  created_at: string
}

const CODE_COLS =
  'id, slug, title, destination_type, target_url, active, scan_count, splash, created_at'

/** A loosely-typed admin handle to qr_codes (untyped because space_id/splash aren't in the generated
 *  types yet, ADR-246). */
function codesTable(): {
  select: (cols: string) => {
    eq: (col: string, val: string) => {
      eq?: (col: string, val: string) => unknown
      order: (col: string, opts: { ascending: boolean }) => Promise<{
        data: CodeRow[] | null
        error: unknown
      }>
      maybeSingle: () => Promise<{ data: CodeRow | null; error: unknown }>
    }
  }
  insert: (rows: Record<string, unknown>[]) => {
    select: (cols: string) => { maybeSingle: () => Promise<{ data: CodeRow | null; error: unknown }> }
  }
  update: (patch: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> }
} {
  const db = createAdminClient() as unknown as {
    from: (t: string) => ReturnType<typeof codesTable>
  }
  return db.from('qr_codes')
}

/** Map a DB code row to the app's SpaceCode. A splash is "present" when it normalizes to a valid
 *  Splash (a malformed/cleared blob reads as no splash). */
function mapCodeRow(r: CodeRow): SpaceCode {
  const dt = (['url', 'node', 'circle', 'event'] as const).includes(r.destination_type as DestinationType)
    ? (r.destination_type as DestinationType)
    : 'url'
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    destinationType: dt,
    targetUrl: r.target_url ?? null,
    active: r.active !== false,
    scanCount: typeof r.scan_count === 'number' ? r.scan_count : 0,
    hasSplash: normalizeSplash(r.splash) !== null,
    createdAt: r.created_at,
  }
}

/** Read a Space's codes (service-role; FAIL-SAFE to []), newest first. Filters by space_id, so it
 *  only ever returns THIS Space's codes (tenant isolation). */
async function readSpaceCodes(spaceId: string): Promise<SpaceCode[]> {
  try {
    const { data, error } = await codesTable()
      .select(CODE_COLS)
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })
    if (error || !data) return []
    return data.map(mapCodeRow)
  } catch {
    return []
  }
}

/** The Space's plan label (spaces.plan), read via an untyped select since plan isn't on the typed
 *  Space (ADR-246). FAIL-SAFE to null (which the cap reads as the smallest/free cap). */
async function readSpacePlan(spaceId: string): Promise<string | null> {
  try {
    const { data } = (await createAdminClient()
      .from('spaces')
      .select('plan')
      .eq('id', spaceId)
      .maybeSingle()) as { data: { plan?: string | null } | null }
    return data?.plan ?? null
  } catch {
    return null
  }
}

/** Whether a slug is already taken by ANY code (service-role; slugs are globally unique on qr_codes).
 *  FAIL-CLOSED on error: treat as taken so a create never collides. */
async function slugTaken(slug: string): Promise<boolean> {
  try {
    const { data } = await codesTable().select('id').eq('slug', slug).maybeSingle()
    return !!data
  } catch {
    return true
  }
}

// ── PUBLIC SERVER HELPERS (all gated / validated server-side) ─────────────────────────────────────

/**
 * A Space's managed codes for the owner QR surface. Gated on canEditProfile (owner / admin / editor)
 * OR a platform janitor previewing as staff; WRITES (createSpaceCode / setCodeSplash) stay on
 * canEditProfile. FAIL-SAFE to [] for an anonymous / unauthorized caller or any error. Tenant-scoped:
 * only THIS Space's codes.
 */
export async function listSpaceCodes(spaceId: string): Promise<SpaceCode[]> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return []
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole)) return []
  return readSpaceCodes(spaceId)
}

/**
 * The raw scan rows for a Space's codes, for the per-space QR analytics (lib/qr/analytics.ts
 * summarizeScans). Gated on canEditProfile OR a janitor staff preview; FAIL-SAFE to []. Tenant-scoped:
 * resolves THIS Space's code ids, then reads only their scans, so a caller never sees another Space's
 * scan log. Returns [] (not all scans) when the Space has no codes, so an empty filter can never leak
 * every Space's rows.
 */
export async function listSpaceScanRows(spaceId: string): Promise<ScanRow[]> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return []
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole)) return []

  try {
    const codes = await readSpaceCodes(spaceId)
    const codeIds = codes.map((c) => c.id)
    // No codes -> no scans. Returning [] here is the guard against an empty `.in([])` filter that
    // some clients treat as "no filter" (which would leak every Space's scans).
    if (codeIds.length === 0) return []
    const { data } = (await createAdminClient()
      .from('qr_scans')
      .select('qr_code_id, profile_id, scanned_at, medium')
      .in('qr_code_id', codeIds)) as { data: ScanRow[] | null }
    return data ?? []
  } catch {
    return []
  }
}

/**
 * Create a managed code for a Space. Gated on canEditProfile. Enforces the PER-PLAN CAP: reads the
 * Space's plan, counts the Space's existing codes, and refuses past the cap (with a plain message).
 * Validates title + target (a 'url' code points anywhere, like the resolver), normalizes / generates
 * a unique slug, then inserts with space_id stamped. Returns the created code's slug on success.
 * Fail-closed on permission, cap, or validation.
 */
export async function createSpaceCode(
  spaceId: string,
  input: CreateSpaceCodeInput,
): Promise<ActionResult<{ slug: string }>> {
  const caller = await getCallerProfile()
  if (!caller?.id) return fail('Sign in to add a code.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  const caps = await getSpaceCapabilities(space, caller.id)
  if (!caps.canEditProfile) return fail('You do not have permission to add a code for this space.')
  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2, defense in depth) — see lib/spaces/booking.ts.
  if (!spaceFunctionAccess(space, 'qr', caps.role))
    return fail('QR codes is not turned on for this space, or your role cannot use it.')

  // Validate the inputs (the form pre-checks, but the server is the authority).
  const title = input.title?.trim().slice(0, MAX_TITLE_LEN) ?? ''
  if (!title) return fail('Give the code a title.')
  const targetUrl = input.targetUrl?.trim() ?? ''
  if (!isValidTargetUrl(targetUrl)) return fail('Use a full web address or a link that starts with /.')

  // PER-PLAN CAP: count this Space's existing codes, refuse past the plan's cap.
  const existing = await readSpaceCodes(spaceId)
  const cap = codeCapForPlan(await readSpacePlan(spaceId))
  if (existing.length >= cap) {
    return fail(`Your plan allows ${cap} codes. Remove one or upgrade to add more.`)
  }

  // Resolve a unique slug: a normalized custom slug if given + valid + free, else a generated one
  // (retried a few times against the unique constraint).
  let slug = ''
  if (input.slug && input.slug.trim()) {
    const custom = normalizeSlug(input.slug)
    if (!isValidSlug(custom)) return fail('That custom link is not valid. Use letters, numbers, and hyphens.')
    if (await slugTaken(custom)) return fail('That custom link is taken. Pick another.')
    slug = custom
  } else {
    for (let i = 0; i < 5; i++) {
      const candidate = generateSlug()
      if (!(await slugTaken(candidate))) {
        slug = candidate
        break
      }
    }
    if (!slug) return fail('Could not create a code right now. Try again.')
  }

  try {
    const { data, error } = await codesTable()
      .insert([
        {
          space_id: spaceId,
          slug,
          title,
          destination_type: 'url',
          target_url: targetUrl,
          active: true,
          created_by: caller.id,
          // ATTRIBUTION OWNER (mirrors the personal / marketing codes): stamp the creator as the
          // owner_profile_id so a scan of this Space code credits their Zaps at signup — the /q resolver
          // drops fq_ref = owner_profile_id for an anonymous scanner and applyReferralAttribution pays out
          // on activation (lib/qr/referral.ts). Without it a Space code logged the scan but credited no one.
          // purpose stays null, so this is NOT a personal connect code (no QR contact capture in /q).
          owner_profile_id: caller.id,
        },
      ])
      .select(CODE_COLS)
      .maybeSingle()
    if (error || !data) return fail('Could not create a code right now. Try again.')
  } catch {
    return fail('Could not create a code right now. Try again.')
  }
  return ok({ slug })
}

/**
 * Set (or clear) a code's SPLASH landing. Gated on canEditProfile of the code's OWN Space (re-resolved
 * from the code row, so a code id from another Space is rejected before any write). Passing null
 * clears the splash (the code returns to its normal redirect). A non-null splash is normalized +
 * validated (lib/qr/splash.ts); an unfixable splash is rejected. Fail-closed on permission.
 */
export async function setCodeSplash(
  codeId: string,
  splash: Splash | null,
): Promise<ActionResult> {
  const caller = await getCallerProfile()
  if (!caller?.id) return fail('Sign in to edit this code.')

  // Re-resolve the code's space_id from the row, so authorization gates on the code's OWN Space (no
  // cross-space edit via a foreign code id).
  let row: { space_id: string | null } | null = null
  try {
    const { data } = (await createAdminClient()
      .from('qr_codes')
      .select('space_id')
      .eq('id', codeId)
      .maybeSingle()) as { data: { space_id: string | null } | null }
    row = data
  } catch {
    row = null
  }
  if (!row?.space_id) return fail('Code not found.')

  const space = await getSpaceById(row.space_id)
  if (!space) return fail('Space not found.')
  const caps = await getSpaceCapabilities(space, caller.id)
  if (!caps.canEditProfile) return fail('You do not have permission to edit this code.')
  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2, defense in depth) — see lib/spaces/booking.ts.
  if (!spaceFunctionAccess(space, 'qr', caps.role))
    return fail('QR codes is not turned on for this space, or your role cannot use it.')

  // Normalize the incoming splash. null clears it; a non-null but unfixable splash is rejected (so a
  // half-built splash never lands on a scan).
  let stored: Splash | null = null
  if (splash !== null) {
    stored = normalizeSplash(splash)
    if (!stored) return fail('Add a heading to your splash before saving.')
  }

  try {
    const { error } = await codesTable().update({ splash: stored }).eq('id', codeId)
    if (error) return fail('Could not save the splash. Try again.')
  } catch {
    return fail('Could not save the splash. Try again.')
  }
  return ok()
}
