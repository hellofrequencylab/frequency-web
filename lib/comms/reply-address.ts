// Per-conversation reply addresses (the routing key for inbound ticketed email).
//
// A ticketed 1:1 email sets `Reply-To: reply+<ref>-<token>@<REPLY_DOMAIN>`. When the recipient hits
// reply in their normal mail app, the message lands on our inbound MX and the webhook parses the local
// part back into (ref, token): `ref` is the conversation's public id (routing key, O(1) lookup), and
// `token` is an HMAC over the ref that makes the address UNFORGEABLE and NON-ENUMERABLE. An attacker can
// guess `ref=1001` but cannot produce its tag, so they can never inject into someone else's thread.
//
// Mirrors lib/unsubscribe-tokens.ts exactly (same HMAC-sha256 → 32-hex tag → timingSafeEqual), so the
// two stateless-token systems share one security model. PURE + server-only (reads a secret); unit-tested.

import { createHmac, timingSafeEqual } from 'crypto'

/** The inbound reply subdomain. Its MX points at the provider's inbound; a catch-all route posts to the
 *  inbound-email webhook. Kept out of the apex so bulk/human mail identities stay separate. */
export const REPLY_DOMAIN = process.env.CONVERSATION_REPLY_DOMAIN ?? 'reply.frequencylocal.com'

// In production: set CONVERSATION_TOKEN_SECRET to a 32+ byte random string. In dev: fall back to the
// service-role key prefix so tests work (locally-issued addresses won't validate against prod-issued ones).
// Fail closed in production rather than silently coupling every reply address to the service-role key.
function getSecret(): string {
  const explicit = process.env.CONVERSATION_TOKEN_SECRET
  if (explicit) return explicit
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[reply-address] CONVERSATION_TOKEN_SECRET must be set in production. Refusing to sign with the service-role key.',
    )
  }
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32)
  if (!fallback) {
    throw new Error('[reply-address] No CONVERSATION_TOKEN_SECRET and no SUPABASE_SERVICE_ROLE_KEY — cannot sign.')
  }
  return fallback
}

/** HMAC over the conversation ref. 16 bytes (32 hex) — the first half of SHA-256; forging an 8-byte tag
 *  is 2^64 work. The ref is stringified so the signed input is stable regardless of caller number/string. */
export function makeConversationToken(ref: string | number): string {
  const hmac = createHmac('sha256', getSecret())
  hmac.update(`conv:${ref}`)
  return hmac.digest('hex').slice(0, 32)
}

/** Constant-time verify. Fail-closed on bad length / mismatch / non-hex. */
export function verifyConversationToken(ref: string | number, token: string): boolean {
  if (!token || token.length !== 32) return false
  const expected = makeConversationToken(ref)
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'))
  } catch {
    return false
  }
}

/** The per-conversation Reply-To address, e.g. `reply+1042-<tag>@reply.frequencylocal.com`. */
export function buildConversationReplyAddress(ref: string | number): string {
  return `reply+${ref}-${makeConversationToken(ref)}@${REPLY_DOMAIN}`
}

/** Pull a bare, lowercased address out of a header value that may be `Name <a@b>` or just `a@b`. No regex
 *  (ReDoS-safe): find the angle-bracket pair, else trim. Rejects control chars / whitespace inside. */
function extractAddress(raw: string): string | null {
  let s = raw.trim()
  const lt = s.indexOf('<')
  if (lt !== -1) {
    const gt = s.indexOf('>', lt + 1)
    if (gt === -1) return null
    s = s.slice(lt + 1, gt).trim()
  }
  if (!s || s.length > 320) return null
  // No spaces or control chars in a bare address.
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c <= 0x20 || c === 0x7f) return null
  }
  return s.toLowerCase()
}

function isDigits(s: string): boolean {
  if (!s) return false
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x30 || c > 0x39) return false
  }
  return true
}

/** Parse an inbound recipient (the `To`/envelope address) back into (ref, token), or null when it is not
 *  one of our reply addresses. Accepts a string (possibly comma-separated / with a display name) or an
 *  array. Does NOT verify the token — the caller verifies, then resolves the conversation. */
export function parseConversationReplyAddress(
  to: string | string[] | null | undefined,
): { ref: string; token: string } | null {
  const parts = Array.isArray(to) ? to : typeof to === 'string' ? to.split(',') : []
  const domain = REPLY_DOMAIN.toLowerCase()
  for (const part of parts) {
    const addr = extractAddress(part)
    if (!addr) continue
    const at = addr.lastIndexOf('@')
    if (at <= 0) continue
    if (addr.slice(at + 1) !== domain) continue
    const local = addr.slice(0, at)
    if (!local.startsWith('reply+')) continue
    const rest = local.slice('reply+'.length) // "<ref>-<token>"
    const dash = rest.lastIndexOf('-')
    if (dash <= 0 || dash === rest.length - 1) continue
    const ref = rest.slice(0, dash)
    const token = rest.slice(dash + 1)
    if (!isDigits(ref) || token.length !== 32) continue
    return { ref, token }
  }
  return null
}
