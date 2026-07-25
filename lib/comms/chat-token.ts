// Capability token for an anonymous live-chat session (ADR-816). A visitor who starts a support chat gets
// back their conversation `ref` + an HMAC token over it. The token is the access key for TWO things:
//   1) the server actions (post / load history) verify it before touching the conversation, and
//   2) it names the Realtime BROADCAST channel (`chat:<token>`), so only the visitor + the operator (who
//      derive the same token server-side) can join — the channel is unguessable, which is what gates an
//      anonymous, RLS-less broadcast channel. Mirrors lib/comms/reply-address.ts (same HMAC → 32-hex tag).
//
// PURE + server-only (reads a secret). Distinct derivation from the reply-address tokens (`chat:` prefix),
// so a leaked reply address can never be used as a chat token or vice-versa.

import { createHmac, timingSafeEqual } from 'crypto'

function getSecret(): string {
  const explicit = process.env.CONVERSATION_TOKEN_SECRET
  if (explicit) return explicit
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[chat-token] CONVERSATION_TOKEN_SECRET must be set in production.')
  }
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32)
  if (!fallback) throw new Error('[chat-token] No CONVERSATION_TOKEN_SECRET and no SUPABASE_SERVICE_ROLE_KEY.')
  return fallback
}

/** HMAC over the conversation ref (chat variant). 16 bytes (32 hex). */
export function makeChatToken(ref: string | number): string {
  return createHmac('sha256', getSecret()).update(`chat:${ref}`).digest('hex').slice(0, 32)
}

/** Constant-time verify. Fail-closed on bad length / mismatch / non-hex. */
export function verifyChatToken(ref: string | number, token: string): boolean {
  if (!token || token.length !== 32) return false
  try {
    return timingSafeEqual(Buffer.from(makeChatToken(ref), 'hex'), Buffer.from(token, 'hex'))
  } catch {
    return false
  }
}
