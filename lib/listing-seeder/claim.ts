// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIEDS & HOUSING SEEDER — the CLAIM spine (Phase 0). SERVER-ONLY.
//
// Mirrors the EVENTS claim flow (lib/events/event-drafts.ts): a seeded listing is
// authored by the Frequency seed owner (seed-owner.ts) and carries a one-time,
// url-safe CLAIM TOKEN. The real poster follows the emailed link, signs in, and the
// transfer atomically hands ownership to them. Exactly like events:
//   • token = randomBytes(24).toString('base64url') (node:crypto), partial-unique,
//   • the transfer is a COMPARE-AND-SET update (filters on the current seed owner +
//     unclaimed) so a race lets only ONE claimer win,
//   • on claim the owner column flips to the claimer, claimed_by/claimed_at stamp,
//     and the token is nulled (consumed).
//
// The one adaptation: the owner column differs per vertical (market_listings.author_id
// vs listings.owner_profile_id), and we add an explicit claimed_by column (events only
// tracked claimed_at + the host flip); claimed_by records WHO claimed, distinct from
// the owner flip, for audit + the later claim page.
//
// The listing_intake table + the claim_token/claimed_by/claimed_at columns are not in
// database.types yet, so this module reaches them through a narrow untyped handle
// (repo convention, ADR-246), exactly like lib/importer/store.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSeedOwnerProfileId } from './seed-owner'
import type { ListingSeedKind } from './types'

/** Which table + owner column each seeder vertical claims against. */
const CLAIM_TARGET: Record<ListingSeedKind, { table: string; ownerCol: string }> = {
  classifieds: { table: 'market_listings', ownerCol: 'author_id' },
  housing: { table: 'listings', ownerCol: 'owner_profile_id' },
}

/** A url-safe, hard-to-guess one-time claim secret. Identical to the events mint. PURE. */
export function mintClaimToken(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * Whether a listing row is claimable: it must currently be owned by the seed owner AND unclaimed.
 * The single guard both the token mint and the transfer enforce (as CAS filters on the write, and
 * here for a pre-check / test). PURE.
 */
export function canClaimListing(
  row: { ownerId: string | null; claimedAt: string | null | undefined },
  seedOwnerId: string | null,
): boolean {
  if (!seedOwnerId) return false
  if (row.ownerId !== seedOwnerId) return false
  return row.claimedAt === null || row.claimedAt === undefined
}

// ── Untyped handle (the claim_* columns are not in database.types yet, ADR-246) ────

interface ClaimQuery {
  select: (cols: string) => ClaimQuery
  update: (patch: Record<string, unknown>) => ClaimQuery
  eq: (col: string, val: unknown) => ClaimQuery
  is: (col: string, val: null) => ClaimQuery
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>
}

function table(name: string): ClaimQuery {
  return (createAdminClient() as unknown as { from: (t: string) => ClaimQuery }).from(name)
}

// ── Mint ──────────────────────────────────────────────────────────────────────────

/**
 * Mint + stamp a claim token onto a seeded listing (called by the publish agent right after it
 * creates the seed-owned row). Bound to the row id AND to the seed owner + unclaimed state, so a
 * token is only ever attached to a genuinely seed-owned, unclaimed listing. Returns the token, or
 * null on failure (missing seed owner / not a seed-owned row / write error). authz-ok: the write is
 * scoped to (id, seed-owner, unclaimed) and only ever runs behind the admin publish path.
 */
export async function mintListingClaimToken(
  kind: ListingSeedKind,
  listingId: string,
): Promise<string | null> {
  const seedOwnerId = await resolveSeedOwnerProfileId()
  if (!seedOwnerId) return null
  const { table: tbl, ownerCol } = CLAIM_TARGET[kind]
  const token = mintClaimToken()
  try {
    const { data, error } = await table(tbl)
      .update({ claim_token: token })
      .eq('id', listingId)
      .eq(ownerCol, seedOwnerId)
      .is('claimed_at', null)
      .select('id')
      .maybeSingle()
    if (error || !data?.id) return null
    return token
  } catch {
    return null
  }
}

// ── Resolve ─────────────────────────────────────────────────────────────────────

/** A resolved, still-claimable listing behind a token (what the claim page renders). */
export interface ResolvedListingClaim {
  kind: ListingSeedKind
  listingId: string
  title: string
  ownerProfileId: string | null
  claimedAt: string | null
}

/**
 * Resolve a claim token to its listing, searching BOTH verticals. Returns null when the token is
 * unknown, already consumed (nulled), or the row is already claimed, so a used/guessed token reveals
 * nothing (mirrors the events claim page's fail-to-notFound posture). Reads only.
 */
export async function resolveListingClaim(token: string): Promise<ResolvedListingClaim | null> {
  if (!token || token.length < 8) return null
  for (const kind of Object.keys(CLAIM_TARGET) as ListingSeedKind[]) {
    const { table: tbl, ownerCol } = CLAIM_TARGET[kind]
    try {
      const { data } = await table(tbl)
        .select(`id, title, ${ownerCol}, claimed_at`)
        .eq('claim_token', token)
        .maybeSingle()
      if (!data?.id) continue
      const claimedAt = (data.claimed_at as string | null) ?? null
      if (claimedAt) return null // already claimed
      return {
        kind,
        listingId: data.id as string,
        title: (data.title as string) ?? '',
        ownerProfileId: (data[ownerCol] as string | null) ?? null,
        claimedAt,
      }
    } catch {
      // try the other vertical
    }
  }
  return null
}

// ── Transfer ───────────────────────────────────────────────────────────────────

/** The outcome of a successful claim: which vertical + listing changed hands. */
export interface ClaimedListing {
  kind: ListingSeedKind
  listingId: string
}

/** Build the ownership-transfer patch for a kind. Explicit per kind (no computed key) so the owner
 *  column can never be anything but the intended literal. PURE. */
function transferPatch(kind: ListingSeedKind, profileId: string, nowIso: string): Record<string, unknown> {
  const base = { claimed_by: profileId, claimed_at: nowIso, claim_token: null }
  return kind === 'classifieds'
    ? { ...base, author_id: profileId }
    : { ...base, owner_profile_id: profileId }
}

/**
 * Claim a seeded listing: transfer ownership to `profileId`. Mirrors claimEvent — a COMPARE-AND-SET
 * update filtered on (token, seed owner, unclaimed) so it only succeeds when the row is still seed
 * owned and unclaimed, and a race lets exactly one claimer win. On success the owner column flips to
 * the claimer, claimed_by/claimed_at stamp, and the token is consumed (nulled). Returns the claimed
 * listing, or null when the token is unknown / already used / not seed owned. authz-ok: the write is
 * bound to the claim token + the current seed owner; the caller (the claim page action) requires the
 * claimer be signed in.
 */
export async function claimListing(token: string, profileId: string): Promise<ClaimedListing | null> {
  if (!token || !profileId) return null
  const seedOwnerId = await resolveSeedOwnerProfileId()
  if (!seedOwnerId) return null
  const nowIso = new Date().toISOString()

  for (const kind of Object.keys(CLAIM_TARGET) as ListingSeedKind[]) {
    const { table: tbl, ownerCol } = CLAIM_TARGET[kind]
    try {
      const { data, error } = await table(tbl)
        .update(transferPatch(kind, profileId, nowIso))
        .eq('claim_token', token)
        .eq(ownerCol, seedOwnerId)
        .is('claimed_at', null)
        .select('id')
        .maybeSingle()
      if (error || !data?.id) continue
      return { kind, listingId: data.id as string }
    } catch {
      // try the other vertical
    }
  }
  return null
}
