// Stateless unsubscribe tokens.
//
// HMAC-signed (profile_id, category) tuples that work without a DB lookup.
// Lets us drop `?p=...&c=...&t=...` URLs in email footers and have them
// keep working even years later, no state to maintain.
//
// Why HMAC, not JWT: JWT carries claims and an exp — neither helps here.
// We want a permanent revocation lever, not a session token. HMAC of
// (profileId, category) is the minimum that proves "we issued this URL
// for this person, for this category" and that's all we need.

import { createHmac, timingSafeEqual } from 'crypto'
import type { NotificationCategory } from '@/lib/notification-preferences'

// In production: set UNSUBSCRIBE_SECRET to a 32+ byte random string.
// In dev: falls back to the service-role key prefix so tests work, but
// emails generated locally won't validate against production-issued ones.
function getSecret(): string {
  const explicit = process.env.UNSUBSCRIBE_SECRET
  if (explicit) return explicit
  // In production a missing secret is a deploy error, not a soft-degrade: falling back to the
  // service-role key couples every issued unsubscribe link to that key (rotating it silently
  // invalidates them all) and widens the key's blast radius. Fail closed so the misconfig is caught.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[unsubscribe-tokens] UNSUBSCRIBE_SECRET must be set in production. Refusing to sign with the service-role key.',
    )
  }
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32)
  if (!fallback) {
    throw new Error(
      '[unsubscribe-tokens] No UNSUBSCRIBE_SECRET and no SUPABASE_SERVICE_ROLE_KEY — cannot sign.',
    )
  }
  return fallback
}

export function makeUnsubscribeToken(
  profileId: string,
  category: NotificationCategory,
): string {
  const hmac = createHmac('sha256', getSecret())
  hmac.update(`${profileId}:${category}`)
  // 16 bytes (32 hex chars) is enough — first half of SHA-256. Brute-force
  // an 8-byte tag would still need 2^64 tries.
  return hmac.digest('hex').slice(0, 32)
}

export function verifyUnsubscribeToken(
  profileId: string,
  category: NotificationCategory,
  token: string,
): boolean {
  if (!token || token.length !== 32) return false
  const expected = makeUnsubscribeToken(profileId, category)
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'))
  } catch {
    return false
  }
}

export function buildUnsubscribeUrl(params: {
  baseUrl:   string
  profileId: string
  category:  NotificationCategory
}): string {
  const { baseUrl, profileId, category } = params
  const token = makeUnsubscribeToken(profileId, category)
  return `${baseUrl}/unsubscribe?p=${encodeURIComponent(profileId)}&c=${encodeURIComponent(category)}&t=${token}`
}

// The "Manage emails" preference page carried alongside the one-click unsubscribe in the footer. Signed
// with the SAME (profileId, category) HMAC as buildUnsubscribeUrl — the token proves we issued a link for
// this person, and the /manage-emails page verifies it before showing the per-category toggles. Distinct
// from buildUnsubscribeUrl only in the PATH (/manage-emails vs /unsubscribe): the unsubscribe path opts the
// member out on load (RFC 8058 no-click), the manage path lets them adjust categories + resubscribe.
export function buildManageEmailsUrl(params: {
  baseUrl:   string
  profileId: string
  category:  NotificationCategory
}): string {
  const { baseUrl, profileId, category } = params
  const token = makeUnsubscribeToken(profileId, category)
  return `${baseUrl}/manage-emails?p=${encodeURIComponent(profileId)}&c=${encodeURIComponent(category)}&t=${token}`
}

// ── Per-Space unsubscribe (ENTITY-SPACES-BUILD Phase 3) ─────────────────────────────────────────
//
// A Space emails CONTACTS, not just members, so the per-Space unsubscribe is keyed on
// (spaceId, email) rather than (profileId, category): the recipient may have no Frequency profile.
// A successful click records a SPACE-SCOPED suppression (email_suppressions.space_id = spaceId), so
// the person stops hearing from THAT Space only, never the whole platform. This lives ALONGSIDE the
// global token above (the global member unsubscribe is unchanged). The same HMAC secret signs both;
// the inputs differ, so a global token never validates as a space token and vice versa.

/** Mint a per-Space unsubscribe token over (spaceId, email). Lowercases the email so the URL in the
 *  send and the verification at click time agree regardless of how the address was cased. */
export function makeSpaceUnsubscribeToken(spaceId: string, email: string): string {
  const hmac = createHmac('sha256', getSecret())
  hmac.update(`space:${spaceId}:${email.trim().toLowerCase()}`)
  return hmac.digest('hex').slice(0, 32)
}

/** Verify a per-Space unsubscribe token (constant-time). Fail-closed on a bad length / mismatch. */
export function verifySpaceUnsubscribeToken(spaceId: string, email: string, token: string): boolean {
  if (!token || token.length !== 32) return false
  const expected = makeSpaceUnsubscribeToken(spaceId, email)
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'))
  } catch {
    return false
  }
}

/** Build the per-Space unsubscribe URL carried in a Space send's List-Unsubscribe header + footer.
 *  Distinguished from the global URL by the `s` (space) + `e` (email) params (no `c` category). */
export function buildSpaceUnsubscribeUrl(params: {
  baseUrl: string
  spaceId: string
  email:   string
}): string {
  const { baseUrl, spaceId, email } = params
  const addr = email.trim().toLowerCase()
  const token = makeSpaceUnsubscribeToken(spaceId, addr)
  return `${baseUrl}/unsubscribe?s=${encodeURIComponent(spaceId)}&e=${encodeURIComponent(addr)}&t=${token}`
}
