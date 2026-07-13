// SEEDED SPACE CLAIM spine. SERVER-ONLY.
//
// A seeded (demo) Space is materialized owned by the operator who seeded it (the business seeder's
// applyIntake sets owner_profile_id to the operator). This mints a one-time claim token so the operator
// can hand the Space to its real owner with a link: the claimer opens /spaces/claim/<token>, signs in,
// and ownership transfers to them (owner column flips, they are seated as an 'admin' member, the token
// is consumed). Mirrors the Classifieds/Housing listing claim spine (lib/listing-seeder/claim.ts):
//   • token = randomBytes(24).base64url,
//   • the transfer is a COMPARE-AND-SET filtered on the live token + unclaimed, so a race lets exactly
//     one claimer win and a used/guessed token reveals nothing.
//
// The claim_token / claimed_by / claimed_at columns are not in database.types yet, so this reaches them
// through a narrow untyped handle (repo convention, ADR-246), exactly like lib/listing-seeder/claim.ts.

import { randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { addSpaceMember } from '@/lib/spaces/membership'

/** A url-safe, hard-to-guess one-time claim secret. PURE. */
export function mintClaimToken(): string {
  return randomBytes(24).toString('base64url')
}

// ── Untyped handle (the claim_* columns are not in database.types yet) ──────────
interface ClaimQuery {
  select: (cols: string) => ClaimQuery
  update: (patch: Record<string, unknown>) => ClaimQuery
  eq: (col: string, val: unknown) => ClaimQuery
  is: (col: string, val: null) => ClaimQuery
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>
}
function spacesTable(): ClaimQuery {
  return (createAdminClient() as unknown as { from: (t: string) => ClaimQuery }).from('spaces')
}

/**
 * Mint + stamp a claim token onto a seeded Space (called by the business seeder right after it
 * materializes the Space). Bound to (id, unclaimed), so a token is only ever attached to an unclaimed
 * Space. Returns the token, or null on failure. authz-ok: scoped to (id, unclaimed), only ever run
 * behind the admin publish path.
 */
export async function mintSpaceClaimToken(spaceId: string): Promise<string | null> {
  const token = mintClaimToken()
  try {
    const { data, error } = await spacesTable()
      .update({ claim_token: token })
      .eq('id', spaceId)
      .is('claimed_at', null)
      .select('id')
      .maybeSingle()
    if (error || !data?.id) return null
    return token
  } catch {
    return null
  }
}

/**
 * The still-live claim token for a Space, or null when claimed / never minted. Reads the secret
 * directly, so the CALLER must gate this to platform staff before surfacing it (it builds the shareable
 * claim link an operator sends the real owner).
 */
export async function getSpaceClaimToken(spaceId: string): Promise<string | null> {
  try {
    const { data } = await spacesTable()
      .select('claim_token, claimed_at')
      .eq('id', spaceId)
      .maybeSingle()
    const row = data as { claim_token?: string | null; claimed_at?: string | null } | null
    if (!row || row.claimed_at) return null
    return row.claim_token ?? null
  } catch {
    return null
  }
}

/** A resolved, still-claimable Space behind a token (what the claim page renders). */
export interface ResolvedSpaceClaim {
  spaceId: string
  slug: string
  name: string
}

/**
 * Resolve a claim token to its Space. Returns null when the token is unknown, already consumed (nulled),
 * or the Space is already claimed, so a used/guessed token reveals nothing. Reads only.
 */
export async function resolveSpaceClaim(token: string): Promise<ResolvedSpaceClaim | null> {
  if (!token || token.length < 8) return null
  try {
    const { data } = await spacesTable()
      .select('id, slug, name, claimed_at')
      .eq('claim_token', token)
      .maybeSingle()
    if (!data?.id) return null
    if ((data.claimed_at as string | null) ?? null) return null // already claimed
    return { spaceId: data.id as string, slug: (data.slug as string) ?? '', name: (data.name as string) ?? '' }
  } catch {
    return null
  }
}

/** The outcome of a successful claim. */
export interface ClaimedSpace {
  spaceId: string
  slug: string
}

/**
 * Claim a seeded Space: transfer ownership to `profileId`. A COMPARE-AND-SET filtered on (token,
 * unclaimed) so it only succeeds when the Space is still unclaimed and a race lets exactly one claimer
 * win. On success the owner column flips to the claimer, claimed_by/claimed_at stamp, and the token is
 * consumed (nulled); then the claimer is seated as an 'admin' member so their owner role is consistent
 * across the owner column AND the per-Space role ladder (matching transferSpaceOwnership). Returns the
 * claimed Space, or null when the token is unknown / already used. authz-ok: bound to the claim token;
 * the caller (the claim page action) requires the claimer be signed in.
 */
export async function claimSpace(token: string, profileId: string): Promise<ClaimedSpace | null> {
  if (!token || !profileId) return null
  const nowIso = new Date().toISOString()
  try {
    const { data, error } = await spacesTable()
      .update({ owner_profile_id: profileId, claimed_by: profileId, claimed_at: nowIso, claim_token: null })
      .eq('claim_token', token)
      .is('claimed_at', null)
      .select('id, slug')
      .maybeSingle()
    if (error || !data?.id) return null
    // Seat the claimer as an admin member (upsert on (space_id, profile_id)), so the owner role reads
    // consistently through getSpaceCapabilities. Best-effort: the owner column already transferred.
    await addSpaceMember({ spaceId: data.id as string, profileId, role: 'admin', status: 'active' })
    return { spaceId: data.id as string, slug: (data.slug as string) ?? '' }
  } catch {
    return null
  }
}
