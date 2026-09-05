'use server'

// Lead capture for the onboarding funnels (ADR-959, migration 20270215000000).
//
// The induction already parks its answers in `fq_pending_induction` — a ONE-HOUR httpOnly cookie
// (actions.ts, stashPendingInduction) that is the whole of our memory of a signed-out visitor. When
// it expires, someone who answered three beats and stopped is simply gone. These three actions add a
// server-side row beside that cookie: the email is taken at beat 1, later beats update the same row,
// and sign-in stamps it converted.
//
// TRANSACTIONAL, NOT MARKETING. What this enables is one "finish setting up your account" note, the
// same category as a password reset. Nothing here records or implies consent to be marketed to;
// that lives on contacts.consent_state behind the double opt-in at /subscribe.
//
// Every write goes through a SECURITY DEFINER function, so the table itself stays fail-closed to
// anon (RLS on, zero policies). The functions return an opaque id or nothing at all — a capture must
// never reveal whether an address is already a member.
// 2026-09-05 (scan2 L7-6): the capture now returns {id, claim_token} in one fixed shape, and the
// two later doors return a boolean that only the holder of that token can turn true. Neither says
// anything about the address; see migration 20270345000610.

import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { rateLimitOk } from '@/lib/rate-limit'
import { resolveAcquisition } from '@/lib/attribution/server'
import type { Json } from '@/lib/database.types'

/** The id of the lead row this browser is building, so later beats update it instead of
 *  re-capturing. httpOnly: the id is the capability that authorises an update. */
// 2026-09-05 (scan2 L7-6): the id is no longer the capability. The cookie now carries
// `<lead id>.<claim token>`, and the claim token (minted by capture_signup_lead, stored hashed,
// migration 20270345000610) is what update_signup_lead / mark_signup_lead_converted require. A
// cookie in the old bare-id shape names a row that no token can open, so it is treated as absent.
const LEAD_COOKIE = 'fq_lead'
const LEAD_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days — a funnel abandoned today is worth mailing next week

/** Same shape app/(marketing)/subscribe/actions.ts validates with. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** What capture_signup_lead returns since 20270345000610: the row id and the one-time proof. */
interface LeadClaim {
  id: string
  claimToken: string
}

/** The cookie value is `<id>.<claim token>`. Two non-empty halves, or nothing: a bare id from
 *  before the token existed cannot open its row, so it is not worth a round trip. */
function readLeadClaim(value: string | undefined): LeadClaim | null {
  if (!value) return null
  const dot = value.indexOf('.')
  if (dot <= 0) return null
  const id = value.slice(0, dot)
  const claimToken = value.slice(dot + 1)
  if (!id || !claimToken || claimToken.includes('.')) return null
  return { id, claimToken }
}

/** The RPC's jsonb return, read defensively: both fields must be non-empty strings. */
function parseLeadClaim(data: unknown): LeadClaim | null {
  if (!data || typeof data !== 'object') return null
  const { id, claim_token: claimToken } = data as { id?: unknown; claim_token?: unknown }
  if (typeof id !== 'string' || !id || typeof claimToken !== 'string' || !claimToken) return null
  return { id, claimToken }
}

/** Which funnel the visitor is in. Mirrors the migration's `source` check constraint. */
export type LeadSource = 'beta_induction' | 'feature_funnel'

export interface LeadFields {
  firstName?: string
  lastName?: string
  displayName?: string
  handle?: string
  /** Whatever the funnel has answered so far (interests, persona, intent, location). */
  payload?: Record<string, Json>
}

export type LeadResult = { ok: true } | { ok: false }

/**
 * The RPCs are live but not in the generated types, so they are called through the untyped surface —
 * repo convention, see lib/quest/complete.ts and lib/traits/refresh.ts. Regenerating the types will
 * not remove the need for this: `rpc()` is typed from the same generated file, so the cast stays
 * until that file is refreshed AND every caller here is retyped in one pass.
 */
type UntypedRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>
}

/**
 * Throttle by IP, but FAIL OPEN when Upstash is not configured.
 *
 * lib/rate-limit.ts fails CLOSED in production for an absent limiter, which is right for a login or
 * a public write endpoint: better to deny than to silently unthrottle. It is the wrong trade here.
 * This is the top of the signup funnel, and the two failure modes are not comparable — a duplicate
 * lead row costs us one wasted upsert on a unique index that collapses it anyway, while a denied
 * capture costs us the lead permanently, with no trace left to notice it happened. So an
 * unconfigured limiter skips the check instead of blocking the funnel; a CONFIGURED limiter is
 * honoured exactly as everywhere else.
 */
async function captureRateLimitOk(): Promise<boolean> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return true
  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || 'unknown'
  return rateLimitOk('signup-lead', ip, 10, '10 m')
}

/** Split a display name into first / last for the follow-up note's greeting. One space is the only
 *  split; "Ada Lovelace King" keeps "Lovelace King" as the surname rather than guessing. */
function splitName(displayName: string | undefined): { firstName?: string; lastName?: string } {
  const name = (displayName ?? '').trim()
  if (!name) return {}
  const i = name.indexOf(' ')
  if (i === -1) return { firstName: name }
  return { firstName: name.slice(0, i), lastName: name.slice(i + 1).trim() || undefined }
}

/**
 * Beat 2 of the funnel: take the email and open (or re-open) this person's lead row.
 *
 * Returns only ok / not-ok. It never says whether the address was new, already a lead, or already a
 * member — the RPC is built so it cannot, and this action must not undo that by leaking the
 * difference through its own return value or its errors.
 */
export async function captureLead(
  input: { email: string; step?: number; source?: LeadSource } & LeadFields,
): Promise<LeadResult> {
  const email = (input.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return { ok: false }

  if (!(await captureRateLimitOk())) return { ok: false }

  const names = splitName(input.displayName)

  try {
    const supabase = await createClient()
    const { data, error } = await (supabase as unknown as UntypedRpc).rpc('capture_signup_lead', {
      p_email: email,
      p_source: input.source ?? 'beta_induction',
      p_step: input.step ?? 0,
      p_first_name: input.firstName ?? names.firstName ?? null,
      p_last_name: input.lastName ?? names.lastName ?? null,
      p_display_name: input.displayName ?? null,
      p_handle: input.handle ?? null,
      p_payload: input.payload ?? {},
      // How they first reached us (ADR-095), from the same cookies the member record reads.
      p_attribution: await resolveAcquisition(),
    })
    const claim = error ? null : parseLeadClaim(data)
    if (!claim) return { ok: false }

    ;(await cookies()).set(LEAD_COOKIE, `${claim.id}.${claim.claimToken}`, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: LEAD_COOKIE_MAX_AGE,
    })
    return { ok: true }
  } catch {
    // A capture failure must never surface as a different outcome than a duplicate would.
    return { ok: false }
  }
}

/**
 * Later beats: fold new answers into the row this browser already opened.
 *
 * Silent no-op with no `fq_lead` cookie — a visitor who skipped the email field at beat 2 has told
 * us nothing we could follow up on, so there is nothing to update and nothing to report.
 */
export async function updateLead(input: { step?: number } & LeadFields): Promise<LeadResult> {
  const claim = readLeadClaim((await cookies()).get(LEAD_COOKIE)?.value)
  if (!claim) return { ok: false }

  const names = splitName(input.displayName)

  try {
    const supabase = await createClient()
    // Returns boolean since 20270345000610: false means the (id, token) pair opened no row.
    const { data, error } = await (supabase as unknown as UntypedRpc).rpc('update_signup_lead', {
      p_lead_id: claim.id,
      p_claim_token: claim.claimToken,
      p_step: input.step ?? null,
      p_first_name: input.firstName ?? names.firstName ?? null,
      p_last_name: input.lastName ?? names.lastName ?? null,
      p_display_name: input.displayName ?? null,
      p_handle: input.handle ?? null,
      p_payload: input.payload ?? {},
    })
    return error || data !== true ? { ok: false } : { ok: true }
  } catch {
    return { ok: false }
  }
}

/**
 * The funnel finished: stamp the lead converted so the recovery job stops considering it.
 *
 * Best-effort by design — called from the induction finaliser, where a failure here must never
 * block a member's profile from being written. The RPC verifies the caller is signed in AS this
 * profile, so a stolen lead id cannot attach itself to someone else's account.
 */
export async function markLeadConverted(profileId: string): Promise<LeadResult> {
  const claim = readLeadClaim((await cookies()).get(LEAD_COOKIE)?.value)
  if (!claim || !profileId) return { ok: false }

  try {
    const supabase = await createClient()
    // Returns boolean since 20270345000610: true only when the caller owns the profile AND the
    // claim token opens the row.
    const { data, error } = await (supabase as unknown as UntypedRpc).rpc('mark_signup_lead_converted', {
      p_lead_id: claim.id,
      p_profile_id: profileId,
      p_claim_token: claim.claimToken,
    })
    if (error) return { ok: false }
    // Consume-and-clear, the same lifecycle fq_beta_seq and fq_pending_induction follow: this row
    // is finished, and on a shared or kiosk browser the NEXT person's funnel must not update it.
    ;(await cookies()).set(LEAD_COOKIE, '', { path: '/', maxAge: 0 })
    return data === true ? { ok: true } : { ok: false }
  } catch {
    return { ok: false }
  }
}
