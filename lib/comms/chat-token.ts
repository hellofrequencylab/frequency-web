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
import { signingSecret } from '@/lib/signing-secret'
import { envStringOrNull } from '@/lib/env/string'

const getSecret = (): string => signingSecret('chat-token', ['CONVERSATION_TOKEN_SECRET'])

/** Whether a chat capability token can be minted at all: the secret is set, or this is not production
 *  and the dev fallback applies. In production with CONVERSATION_TOKEN_SECRET unset `getSecret` throws;
 *  this turns that into a boolean a caller can check BEFORE writing anything. Never throws. */
export function chatSigningAvailable(): boolean {
  try {
    getSecret()
    return true
  } catch {
    return false
  }
}

/**
 * The RUNTIME prerequisites of the live-chat widget (scan2 L3-06, 2026-09-05): a signing secret that can
 * mint the visitor's capability token, and the platform inbox owner the conversation hangs on
 * (CRM_INBOX_OWNER_PROFILE_ID, blank counts as unset). The widget is mounted on the BUILD-time flag
 * NEXT_PUBLIC_SUPPORT_CHAT; the three public layouts AND startSupportChat both gate on this too, so the
 * chat is never offered when it cannot open a thread, and a thread is never opened when its token cannot
 * be minted. Lives here (not in support-chat.ts) so a layout can import it without pulling the admin
 * client and the conversations spine into every public route. Pure env reads; never throws.
 */
export function isSupportChatAvailable(): boolean {
  return envStringOrNull('CRM_INBOX_OWNER_PROFILE_ID') !== null && chatSigningAvailable()
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
