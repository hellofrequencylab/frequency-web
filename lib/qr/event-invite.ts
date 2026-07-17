// Signed event-invite tokens (ADR-154). The public RSVP capture form
// (/rsvp/<token>) carries the inviter + event in ONE opaque, HMAC-signed token so the
// form NEVER trusts a client-supplied inviter_profile_id / event_id — it resolves them
// only from a token this server issued. Minted fresh on every scan by the /q resolver
// (from the code's owner_profile_id + event_id), verified on the form load and again on
// submit. Stateless (no DB row), with a short expiry so a shared /rsvp link goes stale.
//
// Mirrors the HMAC token modules already in the repo (lib/beta-tokens.ts,
// lib/crm/optin/tokens.ts, lib/unsubscribe-tokens.ts). A distinct namespace
// (`event-invite:`) means an event-invite token can never verify as any other token.
// Crypto-only by design, so it stays a pure, unit-testable seam.

import { createHmac, timingSafeEqual } from 'crypto'

/** Default lifetime of an issued invite link. Long enough to walk to the form and fill
 *  it in, short enough that a forwarded /rsvp link cannot capture guests indefinitely. */
export const EVENT_INVITE_TTL_DAYS = 30

/** The verified invite: who invited (the QR owner) and to which event. */
export interface EventInvite {
  inviterProfileId: string
  eventId: string
}

/** The signed payload (compact keys to keep the token short). */
interface EventInvitePayload {
  i: string // inviterProfileId
  e: string // eventId
  x: number // expiry (unix seconds)
}

function getSecret(): string {
  const explicit =
    process.env.EVENT_INVITE_SECRET || process.env.BETA_CONFIRM_SECRET || process.env.UNSUBSCRIBE_SECRET
  if (explicit) return explicit
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32)
  if (!fallback) {
    throw new Error(
      '[event-invite] No EVENT_INVITE_SECRET / BETA_CONFIRM_SECRET / UNSUBSCRIBE_SECRET / service-role key to sign with.',
    )
  }
  return fallback
}

/** PURE: the signed tag over the base64url payload body (namespaced). */
function sign(body: string): string {
  return createHmac('sha256', getSecret()).update(`event-invite:${body}`).digest('base64url')
}

/**
 * Mint a signed token carrying (inviter, event, expiry). Shape: `<b64url(payload)>.<sig>`
 * — one opaque path segment, no raw ids exposed as query params.
 */
export function makeEventInviteToken(
  inviterProfileId: string,
  eventId: string,
  ttlDays: number = EVENT_INVITE_TTL_DAYS,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60
  const payload: EventInvitePayload = { i: inviterProfileId, e: eventId, x: exp }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

/**
 * Verify a token and return the invite, or null. Fail-closed on a bad shape, a signature
 * mismatch (constant-time compare), a malformed payload, or an expired token. This is the
 * ONLY way the inviter/event are resolved for the public form — never from client input.
 */
export function verifyEventInviteToken(token: string | undefined | null, now: number = Date.now()): EventInvite | null {
  if (!token || typeof token !== 'string') return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0 || dot >= token.length - 1) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  // Signature must match (constant-time; equal-length guard first).
  const expected = sign(body)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }

  let payload: EventInvitePayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as EventInvitePayload
  } catch {
    return null
  }
  if (!payload || typeof payload.i !== 'string' || typeof payload.e !== 'string' || typeof payload.x !== 'number') {
    return null
  }
  if (!payload.i || !payload.e) return null
  if (payload.x * 1000 < now) return null // expired

  return { inviterProfileId: payload.i, eventId: payload.e }
}

/** The public form path for an invite token (same-origin; no host needed). */
export function eventInvitePath(token: string): string {
  return `/rsvp/${token}`
}
