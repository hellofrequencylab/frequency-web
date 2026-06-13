// Anti-claim-farming trust check for the Poster Events engine (server-only).
//
// A claim is meant to mean "a real organizer took over an event a member posted
// from their poster". That handshake pays the POSTER a bonus and counts toward
// their honesty band. Left open, it is a Zap-farming lever: a poster and a
// sockpuppet (or a reciprocal buddy) can claim each other's events all day.
//
// isValidClaim() is the gate. A claim still transfers ownership regardless (the
// organizer should always be able to take their event over), but it pays NO bonus
// and does NOT count toward quality unless it passes here. It returns false when:
//   • the claimer IS the poster (self-claim);
//   • the claimer account is a freshly-minted sockpuppet: created within 48h
//     before claiming AND with no community history (no membership, no practice
//     log, no RSVP);
//   • RECIPROCITY: the poster has previously claimed an event this claimer posted,
//     OR the same poster/claimer pair already has a claim in the OTHER direction
//     (an a -> b and b -> a ring).
//
// All reads go through the untyped admin handle (repo convention: new columns
// aren't in the generated types). Pure-ish: a few scoped reads, then a verdict.
// Server-side only by construction (it talks to the admin client); kept free of
// the 'server-only' import so the band/trust math is unit-testable with mocks,
// exactly like poster-quality.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// eslint-disable-next-line no-restricted-syntax -- dynamic table name can't be statically typed
const db = () => createAdminClient() as unknown as SupabaseClient

/** A freshly-minted account is suspect within this window of its creation. */
const NEW_ACCOUNT_MS = 48 * 60 * 60 * 1000

export interface ClaimTrustResult {
  /** True when the claim should pay the bonus and count toward quality. */
  valid: boolean
  /** Why it was rejected (for the ledger / debugging). null when valid. */
  reason: 'self_claim' | 'sockpuppet' | 'reciprocal' | null
}

/** Has this profile any real community history? One hit in any signal is enough. */
async function hasCommunityHistory(profileId: string): Promise<boolean> {
  const admin = db()
  const probe = (table: string, col: string): Promise<boolean> =>
    Promise.resolve(
      admin
        .from(table)
        .select(col, { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .limit(1),
    ).then(
      ({ count }) => (count ?? 0) > 0,
      () => false,
    )
  const probes: Promise<boolean>[] = [
    probe('memberships', 'profile_id'),
    probe('practice_logs', 'id'),
    probe('event_rsvps', 'id'),
  ]
  const results = await Promise.all(probes)
  return results.some(Boolean)
}

/** True when the account was created within the suspect window before now. */
async function isFreshAccount(profileId: string): Promise<boolean> {
  const { data } = await db()
    .from('profiles')
    .select('created_at')
    .eq('id', profileId)
    .maybeSingle()
  const createdAt = (data as { created_at?: string | null } | null)?.created_at ?? null
  if (!createdAt) return false
  const ms = Date.parse(createdAt)
  if (!Number.isFinite(ms)) return false
  return Date.now() - ms < NEW_ACCOUNT_MS
}

/**
 * True when the poster/claimer pair forms a reciprocity ring:
 *   • the poster has previously CLAIMED an event the CLAIMER posted, OR
 *   • this exact pair already has a claim in the other direction
 *     (claimer posted, poster claimed) — an a -> b and b -> a loop.
 *
 * Both reduce to one question against the events table: is there a published,
 * claimed event whose poster is the claimer and whose host (claimer) is the
 * poster? If so, the relationship is reciprocal and this new claim is suspect.
 */
async function isReciprocal(posterProfileId: string, claimerProfileId: string): Promise<boolean> {
  const { data } = await db()
    .from('events')
    .select('id')
    .eq('posted_by_profile_id', claimerProfileId)
    .eq('host_id', posterProfileId)
    .not('claimed_at', 'is', null)
    .limit(1)
    .maybeSingle()
  return Boolean(data)
}

/**
 * The trust gate for a claim. Returns valid=false (with a reason) when the claim
 * should transfer ownership but pay no bonus and not count toward quality.
 * Conservative: any read failure that can't prove the claim is bad lets it pass
 * the structural checks, but the explicit self/reciprocal/sockpuppet rules win.
 */
export async function isValidClaim(
  posterProfileId: string | null,
  claimerProfileId: string,
): Promise<ClaimTrustResult> {
  // No poster on record: there is nobody to pay and nothing to farm. Treat as
  // not-valid so we never award a phantom bonus.
  if (!posterProfileId) return { valid: false, reason: 'self_claim' }

  // Self-claim: the poster claiming their own event earns nothing.
  if (posterProfileId === claimerProfileId) return { valid: false, reason: 'self_claim' }

  // Reciprocity ring: a -> b and b -> a.
  if (await isReciprocal(posterProfileId, claimerProfileId)) {
    return { valid: false, reason: 'reciprocal' }
  }

  // Sockpuppet: a brand-new account with no community history.
  if (await isFreshAccount(claimerProfileId)) {
    const established = await hasCommunityHistory(claimerProfileId)
    if (!established) return { valid: false, reason: 'sockpuppet' }
  }

  return { valid: true, reason: null }
}
