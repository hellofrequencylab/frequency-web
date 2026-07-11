// NON PROFIT (501(c)(3)) VERIFICATION (ADR-552, AUDIT #6). The library behind the Non Profit
// verification surfaces: a Space owner submits their EIN + legal org name to request the discounted Non
// Profit plan, and an operator approves or rejects it. Non Profit is the verified-501(c)(3) sibling of
// Business (the SAME full depth, discounted per seat), so the ONLY difference from Business is price +
// this human review. Approval marks the Space eligible and grants the plan through the EXISTING plan-set
// path (setSpacePlan, lib/pricing/space-plan.ts) — this module never writes spaces.plan/entitlements
// directly, so there is one plan-set path, not two.
//
// Backed by the service-role admin client plus untyped casts (space_nonprofit_verifications is not in the
// generated DB types yet, ADR-246, mirroring lib/spaces/tickets.ts). The server is the authority for
// "which space" and "what may this caller do" (P5, ADR-331/334/338): the member submit self-gates on
// canManage; reads fail-safe (null/empty); the admin approve/reject are gated by their route action
// wrappers (staff/janitor) and take the reviewer id from there.
//
// SHAPE (mirrors lib/spaces/tickets.ts): the PURE helpers (EIN normalization + submission validation)
// have no Supabase/Next imports, so they are fully unit-testable (nonprofit-verification.test.ts). This
// module has NO 'use server' directive so it can export those helpers + types; the thin 'use server'
// wrappers the client forms call live in the route-local actions.ts files.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { setSpacePlan } from '@/lib/pricing/space-plan'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// ── Types ─────────────────────────────────────────────────────────────────────────────────────

/** A verification's lifecycle: pending -> verified | rejected. */
export type VerificationStatus = 'pending' | 'verified' | 'rejected'

/** One verification request as the app consumes it (camelCased). */
export interface NonprofitVerification {
  id: string
  spaceId: string
  /** The EIN, normalized to 9 digits (no dashes), or null if it was never captured. */
  ein: string | null
  orgLegalName: string | null
  status: VerificationStatus
  note: string | null
  submittedBy: string | null
  submittedAt: string
  reviewedBy: string | null
  reviewedAt: string | null
}

/** A pending row enriched for the admin queue (space + submitter display data). */
export interface PendingVerification extends NonprofitVerification {
  spaceName: string
  spaceSlug: string
  submitterName: string
}

/** A clean, validated submission the owner sends. */
export interface VerificationSubmission {
  ein: string
  orgLegalName: string
}

const MAX_NAME_LEN = 200
const MAX_NOTE_LEN = 500
const STATUSES: readonly VerificationStatus[] = ['pending', 'verified', 'rejected']

// ── PURE: EIN normalization + submission validation (no IO, fully testable) ─────────────────────

/** Normalize a raw EIN to its 9 digits (dashes/spaces stripped), or null if it is not exactly 9
 *  digits. A US EIN is always 9 digits, conventionally written XX-XXXXXXX; we store the bare digits so
 *  the stored value is canonical regardless of how the owner typed it. Pure. */
export function normalizeEin(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const digits = raw.replace(/\D/g, '')
  return digits.length === 9 ? digits : null
}

/** Format a stored 9-digit EIN as XX-XXXXXXX for display, or return the input unchanged if it is not a
 *  clean 9-digit value. Pure. */
export function formatEin(ein: string | null | undefined): string {
  const digits = (ein ?? '').replace(/\D/g, '')
  return digits.length === 9 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : (ein ?? '')
}

/** Coerce a raw owner submission to a clean VerificationSubmission, or an error string naming the first
 *  problem. Fail-closed: an invalid EIN or an empty legal name is rejected, never trusted. Pure. */
export function validateSubmission(raw: {
  ein?: unknown
  orgLegalName?: unknown
}): { ok: true; value: VerificationSubmission } | { ok: false; error: string } {
  const ein = normalizeEin(raw.ein)
  if (!ein) return { ok: false, error: 'Enter a valid EIN (9 digits, like 12-3456789).' }
  const orgLegalName =
    typeof raw.orgLegalName === 'string' ? raw.orgLegalName.trim().slice(0, MAX_NAME_LEN) : ''
  if (!orgLegalName) return { ok: false, error: 'Enter the legal name of your organization.' }
  return { ok: true, value: { ein, orgLegalName } }
}

// ── IO: the untyped admin-client seam (table not in generated types yet, ADR-246) ──────────────

type VerificationRow = {
  id: string
  space_id: string
  ein: string | null
  org_legal_name: string | null
  status: string
  note: string | null
  submitted_by: string | null
  submitted_at: string
  reviewed_by: string | null
  reviewed_at: string | null
}

const COLS =
  'id, space_id, ein, org_legal_name, status, note, submitted_by, submitted_at, reviewed_by, reviewed_at'

/** Narrow a raw status to a known VerificationStatus (default-deny to 'pending'). */
function asStatus(raw: string | null | undefined): VerificationStatus {
  return STATUSES.includes(raw as VerificationStatus) ? (raw as VerificationStatus) : 'pending'
}

/** Map a DB row to the app's NonprofitVerification. */
function mapRow(r: VerificationRow): NonprofitVerification {
  return {
    id: r.id,
    spaceId: r.space_id,
    ein: r.ein ?? null,
    orgLegalName: r.org_legal_name ?? null,
    status: asStatus(r.status),
    note: r.note ?? null,
    submittedBy: r.submitted_by ?? null,
    submittedAt: r.submitted_at,
    reviewedBy: r.reviewed_by ?? null,
    reviewedAt: r.reviewed_at ?? null,
  }
}

type VerificationQuery = {
  select: (cols: string) => VerificationQuery
  eq: (col: string, val: string) => VerificationQuery
  neq: (col: string, val: string) => VerificationQuery
  order: (col: string, opts: { ascending: boolean }) => VerificationQuery
  limit: (n: number) => VerificationQuery
  maybeSingle: () => Promise<{ data: VerificationRow | null; error: unknown }>
  insert: (rows: Record<string, unknown>[]) => {
    select: (cols: string) => { maybeSingle: () => Promise<{ data: VerificationRow | null; error: unknown }> }
  }
  update: (patch: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> }
  then: (resolve: (r: { data: VerificationRow[] | null; error: unknown }) => unknown) => Promise<unknown>
}

function table(): VerificationQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => VerificationQuery }
  return db.from('space_nonprofit_verifications')
}

// ── READS (service-role, fail-safe; callers gate their own render) ──────────────────────────────

/** The Space's CURRENT verification row (the newest by submitted_at), or null. Service-role read,
 *  FAIL-SAFE to null. The billing surface reads this to show pending / verified / rejected status; it
 *  already gated its render on canManage, so this does not re-gate. */
export async function getSpaceVerification(spaceId: string): Promise<NonprofitVerification | null> {
  try {
    const { data } = await table()
      .select(COLS)
      .eq('space_id', spaceId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data ? mapRow(data) : null
  } catch {
    return null
  }
}

/** The Space's ACTIVE (pending or verified) verification row, or null. Used by the submit path to block
 *  a duplicate request. Service-role, FAIL-SAFE to null. */
async function getActiveVerification(spaceId: string): Promise<NonprofitVerification | null> {
  const current = await getSpaceVerification(spaceId)
  return current && current.status !== 'rejected' ? current : null
}

/** The pending verification queue for the admin review surface, enriched with the Space name/slug + the
 *  submitter's display name. Service-role read, FAIL-SAFE to []. The route action wrapper gates the
 *  caller (staff/janitor) before this is shown. Newest first. */
export async function listPendingVerifications(): Promise<PendingVerification[]> {
  try {
    const { data, error } = (await table()
      .select(COLS)
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false })) as unknown as {
      data: VerificationRow[] | null
      error: unknown
    }
    if (error || !data || data.length === 0) return []
    const rows = data.map(mapRow)

    const db = createAdminClient()
    const spaceIds = [...new Set(rows.map((r) => r.spaceId))]
    const submitterIds = [...new Set(rows.map((r) => r.submittedBy).filter((v): v is string => !!v))]

    const [{ data: spaces }, { data: people }] = await Promise.all([
      db.from('spaces').select('id, name, slug').in('id', spaceIds),
      submitterIds.length
        ? db.from('profiles').select('id, display_name').in('id', submitterIds)
        : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    ])
    const spaceById = new Map((spaces ?? []).map((s) => [s.id as string, s]))
    const nameById = new Map((people ?? []).map((p) => [p.id as string, p.display_name]))

    return rows.map((r) => {
      const space = spaceById.get(r.spaceId)
      return {
        ...r,
        spaceName: (space?.name as string) ?? 'A space',
        spaceSlug: (space?.slug as string) ?? '',
        submitterName: (r.submittedBy && nameById.get(r.submittedBy)?.trim()) || 'A member',
      }
    })
  } catch {
    return []
  }
}

// ── WRITES ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Submit a Non Profit verification request for a Space. Gated on canEditProfile (owner / admin / editor)
 * server-side. Validates the EIN + legal name (fail-closed), blocks a duplicate ACTIVE request (one
 * pending/verified row per Space; the partial unique index is the final guard against a race), then
 * inserts a pending row through the admin client. Returns ActionResult. Fail-closed on permission.
 */
export async function submitNonprofitVerification(
  spaceId: string,
  raw: { ein?: unknown; orgLegalName?: unknown },
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to request Non Profit verification.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile)
    return fail('You do not have permission to manage this space.')

  const parsed = validateSubmission(raw)
  if (!parsed.ok) return fail(parsed.error)

  // Block a duplicate: one active (pending or verified) request per Space.
  const active = await getActiveVerification(spaceId)
  if (active) {
    return fail(
      active.status === 'verified'
        ? 'This space is already verified as a Non Profit.'
        : 'You already have a verification request in review.',
    )
  }

  try {
    const { error } = await table()
      .insert([
        {
          space_id: spaceId,
          ein: parsed.value.ein,
          org_legal_name: parsed.value.orgLegalName,
          status: 'pending',
          submitted_by: profileId,
        },
      ])
      .select(COLS)
      .maybeSingle()
    if (error) {
      // The partial unique index rejects a second active row for the Space: translate the race into
      // the friendly message rather than a raw DB error.
      return fail('You already have a verification request in review.')
    }
  } catch {
    return fail('Could not submit your request right now. Try again.')
  }
  return ok()
}

/** Set a verification's decision fields (status + reviewer + timestamp, plus an optional note) through
 *  the admin client. Scoped to the one id (untyped, ADR-246). Returns the DB error (or null). */
async function writeDecision(
  id: string,
  patch: { status: VerificationStatus; reviewerId: string; note?: string | null },
): Promise<unknown> {
  const { error } = await table()
    .update({
      status: patch.status,
      reviewed_by: patch.reviewerId,
      reviewed_at: new Date().toISOString(),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
    })
    .eq('id', id)
  return error
}

/**
 * APPROVE a verification (service-role; the route action gates the reviewer as staff/janitor). Marks the
 * row verified, then GRANTS the discounted Non Profit plan through the EXISTING plan-set path
 * (setSpacePlan with force:true — the explicit operator grant that stands regardless of the billing-live
 * switch, exactly what force is for). setSpacePlan writes spaces.plan = 'nonprofit' and set-to-targets
 * the billing entitlement namespace to the Non Profit depth (identical to Business). Idempotent-ish:
 * re-approving a verified row re-grants the same plan. Returns ActionResult.
 */
export async function approveVerification(id: string, reviewerId: string): Promise<ActionResult> {
  if (!id) return fail('Missing verification.')
  const row = await readById(id)
  if (!row) return fail('Verification not found.')

  const dbErr = await writeDecision(id, { status: 'verified', reviewerId })
  if (dbErr) return fail('Could not approve the request. Try again.')

  // Grant the Non Profit plan via the existing plan-set path. force:true because approval is the
  // explicit operator grant and must take effect even while billing is OFF (setSpacePlan §force).
  const grant = await setSpacePlan(row.spaceId, 'nonprofit', { force: true })
  if (!grant.ok) {
    // The decision is recorded, but the plan did not flip. Surface it so the operator can retry rather
    // than believe the Space is on Non Profit when it is not.
    return fail('Marked verified, but granting the Non Profit plan failed. Try again.')
  }
  return ok()
}

/**
 * REJECT a verification with a reason (service-role; the route action gates the reviewer). Marks the row
 * rejected + stores the note (shown to the owner so they know what to fix). Does NOT touch the plan.
 * Returns ActionResult.
 */
export async function rejectVerification(
  id: string,
  reviewerId: string,
  note: string,
): Promise<ActionResult> {
  if (!id) return fail('Missing verification.')
  const reason = note.trim().slice(0, MAX_NOTE_LEN)
  if (!reason) return fail('Add a short reason so the owner knows what to correct.')

  const dbErr = await writeDecision(id, { status: 'rejected', reviewerId, note: reason })
  if (dbErr) return fail('Could not reject the request. Try again.')
  return ok()
}

/** One verification row by id, or null (service-role; FAIL-SAFE to null). */
async function readById(id: string): Promise<NonprofitVerification | null> {
  try {
    const { data } = await table().select(COLS).eq('id', id).maybeSingle()
    return data ? mapRow(data) : null
  } catch {
    return null
  }
}
