// DONATIONS for the Organization role (ENTITY-SPACES-SYSTEM §2.6 "Donate", MASTER-PLAN item
// ADMIN-01). The library plus the gated server actions behind the owner donations surface, the
// Organization analog of lib/spaces/memberships.ts:
//   space_donation_asks: the single donation ask an owner publishes per Space (a fund label, a short
//                        description, and a set of suggested amounts the Donate card renders).
// Backed by the service-role admin client plus untyped casts (the table is not in the generated DB
// types yet, ADR-246, mirroring lib/spaces/memberships.ts). The server is the authority for "which
// space" and "what may this caller do here" (P5): every write re-checks authorization SERVER-SIDE;
// reads fail-safe (null) and writes fail-closed on a permission miss.
//
// v1 IS NOT MONEY. The fund label, the description, and the suggested amounts are DISPLAY ONLY:
// nothing here takes a payment, and there is no Stripe path. The owner editor and the member surface
// frame this honestly (CONTENT-VOICE skeptic test) so no copy implies a charge. Real charges + tax
// receipts are Phase 4 and deliberately NOT built here (additive later: a payments table + a charge
// id column, never a refactor, P4).
//
// SHAPE: the PURE helpers (ask normalization + validation) have no Supabase/Next imports, so they are
// fully unit-testable (lib/spaces/donations.test.ts). The IO (the admin-client read/write) is a thin
// layer below them, and the ACTION IMPLEMENTATIONS are plain async functions here. This module has NO
// 'use server' directive (so it can ALSO export the pure helpers the test needs and the types the
// surfaces import). The thin 'use server' wrapper the CLIENT editor calls lives in
// lib/spaces/donations-actions.ts (a server-action module must export only async functions, so the
// pure helpers cannot live there). SERVER components import the read actions straight from here.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { isJanitor } from '@/lib/core/roles'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// ── Types ─────────────────────────────────────────────────────────────────────────────────────

/** One donation ask as the app consumes it (camelCased). fundLabel names the fund; description is a
 *  short plain blurb; suggestedAmountsCents are the quick-pick chip amounts. All DISPLAY ONLY in v1
 *  (nothing takes a payment). isActive hides the ask from members without deleting it. */
export interface DonationAsk {
  /** The ask id (absent for a not-yet-saved draft from the editor). */
  id?: string
  fundLabel: string
  description: string | null
  /** Suggested gift amounts in integer cents. DISPLAY ONLY (no charge is taken). */
  suggestedAmountsCents: number[]
  isActive: boolean
}

// Hard caps so a malformed / hostile ask can never write an unbounded payload.
const MAX_FUND_LABEL_LEN = 80
const MAX_DESCRIPTION_LEN = 500
const MAX_SUGGESTED_AMOUNTS = 8
// A generous upper bound on a suggested amount (in cents) so a typo cannot store an absurd value.
const MAX_AMOUNT_CENTS = 100_000_000

// ── PURE: ask normalization + validation (no IO, fully testable) ────────────────────────────────

/** Clamp a raw amount to a non-negative integer number of cents within [0, MAX_AMOUNT_CENTS], or
 *  null if it cannot be made a positive amount. A non-finite / negative / NaN / zero value is
 *  dropped (a "suggested $0" is not a meaningful chip). Pure. */
function normalizeAmountCents(raw: unknown): number | null {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(n, MAX_AMOUNT_CENTS)
}

/** Coerce a raw value to a clean array of suggested cent amounts: drops non-positive / malformed
 *  entries, de-duplicates, sorts ascending, and caps the count. Anything non-array reads as empty.
 *  Pure + fail-closed. */
export function normalizeSuggestedAmounts(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<number>()
  for (const item of raw) {
    const cents = normalizeAmountCents(item)
    if (cents != null) seen.add(cents)
    if (seen.size >= MAX_SUGGESTED_AMOUNTS) break
  }
  return [...seen].sort((a, b) => a - b)
}

/** Coerce a raw ask-ish value to a clean DonationAsk, or null if it cannot be made valid. An ask
 *  MUST have a non-empty fund label; everything else defaults sensibly (no description, no suggested
 *  amounts, active). Fail-closed: a label-less / malformed ask is DROPPED, never trusted. The `id` is
 *  preserved only when it is a non-empty string (a draft has none). Pure. */
export function normalizeAsk(raw: {
  id?: unknown
  fundLabel?: unknown
  description?: unknown
  suggestedAmountsCents?: unknown
  isActive?: unknown
}): DonationAsk | null {
  const fundLabel =
    typeof raw.fundLabel === 'string' ? raw.fundLabel.trim().slice(0, MAX_FUND_LABEL_LEN) : ''
  if (!fundLabel) return null

  const description =
    typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim().slice(0, MAX_DESCRIPTION_LEN)
      : null

  const ask: DonationAsk = {
    fundLabel,
    description,
    suggestedAmountsCents: normalizeSuggestedAmounts(raw.suggestedAmountsCents),
    // Default-active: only an explicit `false` turns the ask off.
    isActive: raw.isActive !== false,
  }
  if (typeof raw.id === 'string' && raw.id.trim()) ask.id = raw.id.trim()
  return ask
}

// ── IO: the untyped admin-client seam (table not in generated types yet, ADR-246) ──────────────

// Loosely-typed row + builder for the not-yet-typed table, mirroring lib/spaces/memberships.ts.
type AskRow = {
  id: string
  space_id: string
  fund_label: string
  description: string | null
  suggested_amounts_cents: unknown
  is_active: boolean
}

type AskQuery = {
  select: (cols: string) => AskQuery
  eq: (col: string, val: string) => AskQuery
  delete: () => AskQuery
  insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }>
  maybeSingle: () => Promise<{ data: AskRow | null; error: unknown }>
}

function asksTable(): AskQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => AskQuery }
  return db.from('space_donation_asks')
}

const ASK_COLS = 'id, space_id, fund_label, description, suggested_amounts_cents, is_active'

/** Map a DB ask row to the app's DonationAsk (amounts re-normalized; the label is trusted as-is
 *  since it was validated on write). */
function mapAskRow(r: AskRow): DonationAsk {
  return {
    id: r.id,
    fundLabel: r.fund_label,
    description: r.description ?? null,
    suggestedAmountsCents: normalizeSuggestedAmounts(r.suggested_amounts_cents),
    isActive: r.is_active !== false,
  }
}

/** Read a Space's single donation ask (service-role; FAIL-SAFE to null). */
async function readAsk(spaceId: string): Promise<DonationAsk | null> {
  try {
    const { data, error } = await asksTable()
      .select(ASK_COLS)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error || !data) return null
    return mapAskRow(data)
  } catch {
    return null
  }
}

// ── PUBLIC SERVER ACTIONS (all gated / validated server-side) ──────────────────────────────────

/**
 * Set a Space's donation ask (replace-by-space, like setMembershipTiers but a SINGLE row). Gated on
 * canEditProfile (owner / admin / editor) re-checked SERVER-SIDE on every call, so the staff
 * (janitor) preview never writes. Validates + normalizes the ask (a label-less / malformed one is
 * rejected; amounts are cleaned, de-duplicated, sorted, capped). Replaces (delete then insert) the
 * Space's single ask through the admin client; passing `null` (or an ask that normalizes away) CLEARS
 * the ask (a valid "no donations configured" state). Returns ActionResult. Fail-closed on permission.
 *
 * v1 TAKES NO PAYMENT. This records the owner's configuration only; there is no Stripe path. Real
 * charges + tax receipts are Phase 4 (additive later, never a refactor, P4).
 */
export async function setDonationAsk(
  spaceId: string,
  ask: DonationAsk | null,
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to set your donation ask.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  // SERVER-SIDE owner gate (re-checked on every write; the staff preview is read-only).
  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile)
    return fail('You do not have permission to set the donation ask for this space.')
  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2, defense in depth) — see lib/spaces/booking.ts.
  if (!spaceFunctionAccess(space, 'donations', caps.role))
    return fail('Donations is not turned on for this space, or your role cannot use it.')

  // Normalize. A label-less / malformed ask (or an explicit null) clears the ask.
  const clean = ask ? normalizeAsk(ask) : null

  try {
    // Clear the existing ask, then insert the new one. At most one row per Space, so a clean replace
    // keeps the ask the single source of truth (the member surface re-reads it).
    const del = await asksTable().delete().eq('space_id', spaceId)
    if ((del as unknown as { error?: unknown }).error) {
      return fail('Could not save your donation ask. Try again.')
    }
    if (clean) {
      const { error } = await asksTable().insert([
        {
          space_id: spaceId,
          fund_label: clean.fundLabel,
          description: clean.description,
          suggested_amounts_cents: clean.suggestedAmountsCents,
          is_active: clean.isActive,
        },
      ])
      if (error) return fail('Could not save your donation ask. Try again.')
    }
  } catch {
    return fail('Could not save your donation ask. Try again.')
  }
  return ok()
}

/** A Space's ACTIVE donation ask, for the member-facing Donate surface (any caller; the server
 *  component reads this so the ask is public-readable). Returns null when there is no ask or it is
 *  hidden (is_active=false). FAIL-SAFE to null. */
export async function getDonationAsk(spaceId: string): Promise<DonationAsk | null> {
  try {
    const ask = await readAsk(spaceId)
    return ask && ask.isActive ? ask : null
  } catch {
    return null
  }
}

/** A Space's donation ask as the owner editor reads it back, INCLUDING a hidden (inactive) one
 *  (service-role; FAIL-SAFE to null). Gated on canEditProfile (owner / admin / editor) OR a platform
 *  janitor previewing as staff; WRITES stay on canEditProfile (the staff preview is read-only). */
export async function getOwnerDonationAsk(spaceId: string): Promise<DonationAsk | null> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole)) return null
  return readAsk(spaceId)
}
