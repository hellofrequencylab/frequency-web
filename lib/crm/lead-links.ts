// Signed public-capture links for lead-grab front doors 2 to 5 (CRM-MASTER-BUILD-PLAN §Phase 3).
//
// Door 1 (Space QR) uses the fq_lead COOKIE path (app/q/[slug]). The other four doors are surfaces a
// visitor lands on directly, so each needs a shareable link that safely carries the capture CONTEXT
// (which Space, which door, the event/magnet label, the resource to unlock, the introduced contact)
// WITHOUT a per-magnet/per-event DB row. We do it the way the double-opt-in confirm link does
// (lib/crm/optin/tokens.ts): a stateless HMAC-signed token. The signature proves WE minted the link,
// so a visitor can never forge a capture into an arbitrary Space, and the payload is tamper-evident.
//
// The token is the ONLY trusted context a public capture action reads — never a raw spaceId from the
// client. A distinct namespace (`lead-link:`) means an opt-in / unsubscribe / beta token can never be
// replayed here and vice versa. Every link carries an expiry so a leaked/printed link goes stale.
//
// PURE + framework-free (node `crypto` only), so it unit-tests in isolation.

import { createHmac, timingSafeEqual } from 'crypto'
import { isLeadDoor, type LeadDoor } from './lead-capture'

/** Default lifetime of a capture link. Long enough to print on a flyer or leave in a link-in-bio,
 *  short enough that a forgotten link stops sealing leads on its own. */
export const LEAD_LINK_TTL_DAYS = 120

/** The four doors that use a public capture LINK (space_qr uses the cookie path instead). */
export type LinkDoor = Exclude<LeadDoor, 'space_qr'>

/** The public path each link-door lands on (a top-level, noindex capture surface). */
export const DOOR_PATHS: Record<LinkDoor, string> = {
  warm_intro: '/intro', // door 2 — the double-opt-in ACCEPT surface
  event: '/checkin', // door 3 — attendee capture
  lead_magnet: '/unlock', // door 4 — consent-native unlock
  share_back: '/exchange', // door 5 — reciprocal handshake
}

/** The signed payload a capture link carries. Keys are short (the token rides in a URL). */
export interface LeadLinkPayload {
  /** Space the capture seals into. */
  s: string
  /** Door kind. */
  d: LinkDoor
  /** A label — the magnet name, the event title, or the campaign. */
  l?: string
  /** Met-context (event / city) stamped on the entry point. */
  w?: string
  /** Attendance tier (event door): 'attended' | 'rsvp' | 'vip'. */
  tr?: string
  /** The resource to reveal on a consent-native unlock (magnet door), an http(s) URL. */
  r?: string
  /** The sealed contact id (warm-intro accept door) — set when the intro was captured. */
  c?: string
  /** A display name for the introducer / the Space, shown as consent context. */
  by?: string
  /** Unix-seconds expiry. */
  exp: number
}

function getSecret(): string {
  const explicit =
    process.env.OPTIN_CONFIRM_SECRET || process.env.BETA_CONFIRM_SECRET || process.env.UNSUBSCRIBE_SECRET
  if (explicit) return explicit
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32)
  if (!fallback) {
    throw new Error('[lead-links] No OPTIN_CONFIRM_SECRET / BETA_CONFIRM_SECRET / UNSUBSCRIBE_SECRET / service-role key to sign with.')
  }
  return fallback
}

function sign(body: string): string {
  return createHmac('sha256', getSecret()).update(`lead-link:${body}`).digest('hex').slice(0, 32)
}

/** PURE: serialize + sign a payload into a URL-safe token (`<base64url-json>.<sig>`). */
export function signLeadLink(payload: LeadLinkPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

/** PURE: verify + parse a token back to its payload, or null. Fail-closed on a bad signature, a
 *  malformed body, an unknown door, or an expired link. Constant-time signature compare. */
export function parseLeadLink(token: string | null | undefined, now: number = Date.now()): LeadLinkPayload | null {
  if (!token || typeof token !== 'string') return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (sig.length !== 32) return null
  const expected = sign(body)
  try {
    if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))) return null
  } catch {
    return null
  }
  let payload: LeadLinkPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LeadLinkPayload
  } catch {
    return null
  }
  if (!payload || typeof payload.s !== 'string' || !payload.s) return null
  // The parsed door is untrusted (a forged token could carry anything), so re-validate at the LeadDoor
  // level and reject the cookie-path door — only the four link doors have a surface here.
  const door = payload.d as LeadDoor
  if (!isLeadDoor(door) || door === 'space_qr') return null
  if (!Number.isFinite(payload.exp) || payload.exp <= 0 || payload.exp * 1000 < now) return null
  return payload
}

/** PURE: stamp a fresh expiry onto a payload draft. */
export function makeLeadLinkPayload(
  draft: Omit<LeadLinkPayload, 'exp'>,
  ttlDays: number = LEAD_LINK_TTL_DAYS,
): LeadLinkPayload {
  return { ...draft, exp: Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60 }
}

/** PURE: whether a string is a safe http(s) URL (the magnet resource / a reciprocal profile link).
 *  Rejects javascript:, data:, and relative junk so a reveal link can never be an injection vector. */
export function isSafeHttpUrl(raw: string | null | undefined): boolean {
  if (!raw) return false
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/** Build the full public capture URL for a payload, or '' when the door has no link surface. */
export function buildLeadLinkUrl(baseUrl: string, payload: LeadLinkPayload): string {
  const path = DOOR_PATHS[payload.d as LinkDoor]
  if (!path) return ''
  return `${baseUrl.replace(/\/$/, '')}${path}?t=${encodeURIComponent(signLeadLink(payload))}`
}
