// Resonance matches + consent: the double-opt-in spine (Resonance Engine Phase 4 · ADR-385 ·
// docs/NEXT-GEN-CRM.md "The Resonance Graph"). Two governed mutations:
//   • resonance_consent  — a person's own opt-IN to matching (+ an opt-OUT of being a target). The
//                          member controls whether they are in the pool at all (the trust moat).
//   • resonance_matches  — the bilateral opt-in on a specific pairing (a_optin / b_optin /
//                          accepted_at). NOTHING is "accepted" until BOTH sides tap yes. This is the
//                          consent record that send_intro_email checks before it may send.
//
// Server-only (admin client). Both tables are reached untyped until the generated types regenerate
// (ADR-246). RLS is the fail-closed service-role pattern (RLS on, no client policy).
//
// AUTHZ — these are MUTATIONS, so they self-guard or self-scope:
//   • setMatchingConsent / setTargetOptOut SCOPE the write to the caller's OWN profile id (a member
//     may only set their own consent). The caller is established by the gated server action that
//     resolves getMyProfileId; this binds the write with .eq('profile_id', selfId).
//   • recordMatchOptIn SCOPES the write to the canonical (a_pid, b_pid) pair AND requires the
//     opting-in person to be one of the two parties (a confused-deputy guard).
// FAIL-CLOSED everywhere: a missing party, a non-party opter, or any error denies the write.

import { createAdminClient } from '@/lib/supabase/admin'
import { orderPair } from './edges'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Matching consent (a member's own opt-in) ──────────────────────────────────────

/** A person's matching consent. Opt-IN default is FALSE (a person-to-person surface is opt-in, like
 *  email_marketing in lib/consent/scopes.ts): say nothing and you are not in the pool. */
export interface MatchingConsent {
  optedIn: boolean
  optedOutAsTarget: boolean
}

export const NO_MATCHING_CONSENT: MatchingConsent = { optedIn: false, optedOutAsTarget: false }

/** Read one person's matching consent. FAIL-SAFE + opt-IN default: an absent row, a missing table
 *  (pre-migration), or any error reads as NOT opted in. */
export async function getMatchingConsent(profileId: string): Promise<MatchingConsent> {
  if (!UUID_RE.test(profileId)) return NO_MATCHING_CONSENT
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { opted_in: boolean | null; opted_out_as_target: boolean | null } | null; error: unknown }>
          }
        }
      }
    }
    const { data, error } = await admin
      .from('resonance_consent')
      .select('opted_in, opted_out_as_target')
      .eq('profile_id', profileId)
      .maybeSingle()
    if (error || !data) return NO_MATCHING_CONSENT
    return { optedIn: data.opted_in === true, optedOutAsTarget: data.opted_out_as_target === true }
  } catch {
    return NO_MATCHING_CONSENT
  }
}

/**
 * Set whether the caller's OWN profile is opted in to matching. SELF-SCOPED: `selfProfileId` is the
 * authenticated caller (resolved by the gated action), and the upsert is bound to that id, so a
 * member can only ever change their own consent. FAIL-CLOSED: a bad id denies. Returns ok.
 */
export async function setMatchingConsent(selfProfileId: string, optedIn: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!UUID_RE.test(selfProfileId)) return { ok: false, error: 'That profile id does not look right.' }
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => { upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<{ error: unknown }> }
    }
    const { error } = await admin
      .from('resonance_consent')
      .upsert({ profile_id: selfProfileId, opted_in: optedIn, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' })
    if (error) return { ok: false, error: 'Could not save that. Try again in a moment.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not save that. Try again in a moment.' }
  }
}

/**
 * Set whether the caller's OWN profile opts OUT of being a match target (mute being suggested to
 * others without leaving the pool entirely). SELF-SCOPED to the caller's id. FAIL-CLOSED. Returns ok.
 */
export async function setTargetOptOut(selfProfileId: string, optedOut: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!UUID_RE.test(selfProfileId)) return { ok: false, error: 'That profile id does not look right.' }
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => { upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<{ error: unknown }> }
    }
    const { error } = await admin
      .from('resonance_consent')
      .upsert(
        { profile_id: selfProfileId, opted_out_as_target: optedOut, updated_at: new Date().toISOString() },
        { onConflict: 'profile_id' },
      )
    if (error) return { ok: false, error: 'Could not save that. Try again in a moment.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not save that. Try again in a moment.' }
  }
}

// ── The double-opt-in match record ────────────────────────────────────────────────

/** The state of one pairing's bilateral opt-in. */
export interface MatchState {
  aPid: string
  bPid: string
  aOptin: boolean
  bOptin: boolean
  acceptedAt: string | null
}

/** Read the match state for a pair (canonical order applied). FAIL-SAFE: nulls/false when absent. */
export async function getMatchState(x: string, y: string): Promise<MatchState | null> {
  if (!UUID_RE.test(x) || !UUID_RE.test(y) || x === y) return null
  const { a, b } = orderPair(x, y)
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{ data: { a_optin: boolean | null; b_optin: boolean | null; accepted_at: string | null } | null; error: unknown }>
            }
          }
        }
      }
    }
    const { data, error } = await admin
      .from('resonance_matches')
      .select('a_optin, b_optin, accepted_at')
      .eq('a_pid', a)
      .eq('b_pid', b)
      .maybeSingle()
    if (error) return null
    if (!data) return { aPid: a, bPid: b, aOptin: false, bOptin: false, acceptedAt: null }
    return { aPid: a, bPid: b, aOptin: data.a_optin === true, bOptin: data.b_optin === true, acceptedAt: data.accepted_at }
  } catch {
    return null
  }
}

/**
 * Record that `selfProfileId` taps YES on the pairing with `otherProfileId`. CONFUSED-DEPUTY GUARD:
 * the opter MUST be one of the two parties on the canonical pair; a non-party caller is denied. When
 * BOTH sides have now opted in, stamp `accepted_at` (the bilateral completion the intro email gates
 * on). SELF-SCOPED to the (a_pid, b_pid) pair. FAIL-CLOSED. Returns the resulting state.
 */
export async function recordMatchOptIn(
  selfProfileId: string,
  otherProfileId: string,
): Promise<{ ok: boolean; bothOptedIn: boolean; error?: string }> {
  if (!UUID_RE.test(selfProfileId) || !UUID_RE.test(otherProfileId) || selfProfileId === otherProfileId) {
    return { ok: false, bothOptedIn: false, error: 'That pairing does not look right.' }
  }
  // The opter must be opted in to matching at all (you cannot accept an intro you opted out of).
  const selfConsent = await getMatchingConsent(selfProfileId)
  if (!selfConsent.optedIn) return { ok: false, bothOptedIn: false, error: 'Turn on matching first to accept an intro.' }

  const { a, b } = orderPair(selfProfileId, otherProfileId)
  const selfIsA = selfProfileId === a
  try {
    const existing = await getMatchState(a, b)
    const aOptin = existing?.aOptin || selfIsA
    const bOptin = existing?.bOptin || !selfIsA
    const bothOptedIn = aOptin && bOptin
    const acceptedAt = bothOptedIn ? (existing?.acceptedAt ?? new Date().toISOString()) : null

    const admin = createAdminClient() as unknown as {
      from: (t: string) => { upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<{ error: unknown }> }
    }
    const { error } = await admin.from('resonance_matches').upsert(
      {
        a_pid: a,
        b_pid: b,
        a_optin: aOptin,
        b_optin: bOptin,
        accepted_at: acceptedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'a_pid,b_pid' },
    )
    if (error) return { ok: false, bothOptedIn: false, error: 'Could not record that. Try again in a moment.' }
    return { ok: true, bothOptedIn }
  } catch {
    return { ok: false, bothOptedIn: false, error: 'Could not record that. Try again in a moment.' }
  }
}

/**
 * Whether an intro between two people MAY be sent: BOTH parties have opted in (accepted_at is set).
 * The hard gate send_intro_email checks before any send. FAIL-CLOSED: false unless the bilateral
 * record exists with both flags true. This is the literal "nothing sends until both tap yes".
 */
export async function bothPartiesOptedIn(x: string, y: string): Promise<boolean> {
  const state = await getMatchState(x, y)
  if (!state) return false
  return state.aOptin && state.bOptin && state.acceptedAt != null
}
