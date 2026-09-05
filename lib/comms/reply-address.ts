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
import { signingSecret } from '@/lib/signing-secret'
import { envString } from '@/lib/env/string'

/** The inbound reply subdomain. Its MX points at the provider's inbound; a catch-all route posts to the
 *  inbound-email webhook. Kept out of the apex so bulk/human mail identities stay separate. */
// 2026-09-05 (scan2 L3-02): read through envString so a BLANK CONVERSATION_REPLY_DOMAIN falls back to the
// default instead of producing `reply+…@` addresses.
export const REPLY_DOMAIN = envString('CONVERSATION_REPLY_DOMAIN', 'reply.frequencylocal.com')

// In production: set CONVERSATION_TOKEN_SECRET to a 32+ byte random string. In dev: fall back to the
// service-role key prefix so tests work (locally-issued addresses won't validate against prod-issued ones).
// Fail closed in production rather than silently coupling every reply address to the service-role key.
const getSecret = (): string => signingSecret('reply-address', ['CONVERSATION_TOKEN_SECRET'])

/** The member/operator-safe copy for a send refused because reply addresses cannot be signed. Plain voice. */
export const CONVERSATION_SIGNING_UNAVAILABLE_COPY =
  'Reply email is not set up on this server yet, so this message cannot go out. Nothing was sent.'

/**
 * Whether outbound conversation mail can be signed at all (scan2 L3-06, 2026-09-05). In production with
 * CONVERSATION_TOKEN_SECRET unset, `getSecret` THROWS, and before this check that throw fired from deep
 * inside a send, after the conversation row and the outbound message had already been written, and
 * surfaced to the member as a generic server-action failure. Callers run this BEFORE they open a
 * conversation or append a message, and return CONVERSATION_SIGNING_UNAVAILABLE_COPY when it is false.
 * The refusal is logged here, once per call, so the misconfiguration is visible in the runtime log
 * rather than swallowed by a caller's catch. Never throws.
 */
export function conversationSigningAvailable(): boolean {
  try {
    getSecret()
    return true
  } catch (err) {
    console.error('[comms] conversation reply addresses cannot be signed; outbound conversation mail is refused', {
      reason: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/** Who a reply address belongs to. `member` = the counterpart's reply-to (routes INBOUND onto the thread) —
 *  the default, and the ONLY role most of the system uses. `house` = the operator/leader's reply-to on a
 *  FORWARDED copy (the email bridge, ADR-814): a reply to it routes OUTBOUND to the member, as the house.
 *  Direction is decided by which secret-derived address the reply lands on, never by the (spoofable) From. */
export type ReplyRole = 'member' | 'house'

/** HMAC over the conversation ref (+ role). 16 bytes (32 hex) — the first half of SHA-256; forging an
 *  8-byte tag is 2^64 work. The ref is stringified so the signed input is stable regardless of caller
 *  number/string. The `member` role signs `conv:<ref>` (UNCHANGED — addresses already in the wild keep
 *  validating); `house` signs a distinct `conv:<ref>:house`, so a member token can never pass as a house
 *  token (which would let a leaked member address send outbound as the house). */
export function makeConversationToken(ref: string | number, role: ReplyRole = 'member'): string {
  const hmac = createHmac('sha256', getSecret())
  hmac.update(role === 'house' ? `conv:${ref}:house` : `conv:${ref}`)
  return hmac.digest('hex').slice(0, 32)
}

/** Constant-time verify (role-aware). Fail-closed on bad length / mismatch / non-hex. */
export function verifyConversationToken(ref: string | number, token: string, role: ReplyRole = 'member'): boolean {
  if (!token || token.length !== 32) return false
  const expected = makeConversationToken(ref, role)
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'))
  } catch {
    return false
  }
}

/** The per-conversation Reply-To address. `member` (default): `reply+1042-<tag>@reply…` (UNCHANGED). `house`:
 *  `reply+1042.h-<tag>@reply…` — a distinct local part so the parser can tell the two roles apart O(1). */
export function buildConversationReplyAddress(ref: string | number, role: ReplyRole = 'member'): string {
  const marker = role === 'house' ? `${ref}.h` : `${ref}`
  return `reply+${marker}-${makeConversationToken(ref, role)}@${REPLY_DOMAIN}`
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
): { ref: string; token: string; role: ReplyRole } | null {
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
    const rest = local.slice('reply+'.length) // "<ref>-<token>" or "<ref>.h-<token>" (house)
    const dash = rest.lastIndexOf('-')
    if (dash <= 0 || dash === rest.length - 1) continue
    let ref = rest.slice(0, dash)
    const token = rest.slice(dash + 1)
    if (token.length !== 32) continue
    // A `.h` suffix on the ref segment marks the house role; strip it before the digits check.
    let role: ReplyRole = 'member'
    if (ref.endsWith('.h')) {
      role = 'house'
      ref = ref.slice(0, -2)
    }
    if (!isDigits(ref)) continue
    return { ref, token, role }
  }
  return null
}
