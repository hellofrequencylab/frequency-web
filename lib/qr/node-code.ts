// Signed node codes (LIVE-688, ADR-1654). A QR / NFC node code (a Space check-in code or an
// /admin/qr code) encodes `/n/<nodeId>?s=<code>`, where <code> is an HMAC this server issued over
// (node id, issued-at). The capture verifier (lib/engagement/verify.ts) refuses a code whose tag
// does not match, so a forged `/n/<id>` URL built from a node id alone cannot check anyone in.
//
// Shape: `v1.<issued-at, unix seconds, base36>.<tag>`, where tag is the first 16 bytes of
// HMAC-SHA256(key, "node-code:v1:<nodeId>:<issued-at>") in base64url. 128 bits is plenty for a
// MAC and keeps the QR sparse. The `node-code:` namespace means a node code can never verify as
// any other token signed with the same key.
//
// KEY. signingSecret('node-code', ['UNSUBSCRIBE_SECRET']): the key every production deploy already
// carries, so this needs no new env var. In production a missing key THROWS (fail closed): signing
// refuses to render a code and verification refuses every signed code. Rotating UNSUBSCRIBE_SECRET
// voids every printed node code; reprint from the same screen after a rotation.
//
// PRINTED BEFORE THIS SHIPPED. Codes printed before LIVE-688 carry either no `?s=` at all or the
// node's old random `nodes.secret`. They keep working until LEGACY_NODE_CODE_GRACE_ENDS, then the
// verifier refuses them and the scanner sees "Couldn't verify this code." The fix is a reprint from
// /admin/qr or the Space's check-in settings, which now always render a signed code.
//
// Crypto only, no IO: a pure, unit-testable seam (lib/qr/node-code.test.ts).

import { createHmac, timingSafeEqual } from 'crypto'
import { signingSecret } from '@/lib/signing-secret'
import { nodeUrl } from '@/lib/qr/links'

/** The last moment a code printed before signing (no `?s=`, or the node's old random secret) still
 *  claims. After it, only a signed code checks a member in. Stated in ADR-1654. */
export const LEGACY_NODE_CODE_GRACE_ENDS = Date.parse('2026-12-01T00:00:00Z')

/** A signed code may not claim an issue time further ahead of the server clock than this. */
const FUTURE_SKEW_MS = 5 * 60 * 1000

const VERSION = 'v1'
const TAG_BYTES = 16

const getSecret = (): string => signingSecret('node-code', ['UNSUBSCRIBE_SECRET'])

function tag(nodeId: string, issuedAtSec: number): string {
  return createHmac('sha256', getSecret())
    .update(`node-code:${VERSION}:${nodeId}:${issuedAtSec}`)
    .digest()
    .subarray(0, TAG_BYTES)
    .toString('base64url')
}

/** Constant-time string equality (length guard first, since timingSafeEqual throws on a mismatch). */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** True when `value` has the shape of a signed node code (not whether it verifies). */
export function isSignedNodeCode(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${VERSION}.`)
}

/** Issue a signed code for a node. Throws in production when the signing key is missing. */
export function signNodeCode(nodeId: string, issuedAtMs: number = Date.now()): string {
  const iat = Math.floor(issuedAtMs / 1000)
  return `${VERSION}.${iat.toString(36)}.${tag(nodeId, iat)}`
}

/** The absolute `/n/<nodeId>?s=<signed code>` URL a node's QR / NFC encodes. Every surface that
 *  renders, downloads or prints a node code builds it here, so no surface can print an unsigned one. */
export function signedNodeUrl(nodeId: string, issuedAtMs: number = Date.now()): string {
  return nodeUrl(nodeId, signNodeCode(nodeId, issuedAtMs))
}

/** Verify a signed code against the node it was presented for. Fail closed: a bad shape, a tag
 *  for a different node, a tampered issue time, a future issue time, or a missing key all read
 *  as not verified. */
export function verifyNodeCode(nodeId: string, code: string | null | undefined, now: number = Date.now()): boolean {
  if (!nodeId || typeof code !== 'string') return false
  const parts = code.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return false
  const [, iatRaw, presentedTag] = parts
  if (!/^[0-9a-z]{1,10}$/.test(iatRaw) || !presentedTag) return false
  const iat = parseInt(iatRaw, 36)
  if (!Number.isSafeInteger(iat) || iat <= 0) return false
  if (iat * 1000 > now + FUTURE_SKEW_MS) return false
  try {
    return safeEqual(presentedTag, tag(nodeId, iat))
  } catch {
    return false
  }
}

/** How a presented code fared: `signed` (a valid HMAC code), `legacy` (a pre-signing printed code,
 *  accepted only inside the grace window), or `refused`. */
export type NodeCodeVerdict = 'signed' | 'legacy' | 'refused'

/**
 * The capture verifier's one question about the code: may it claim this node?
 *
 *  • A code shaped like a signed code must verify, whatever the date. A tampered or cross-node
 *    code is refused, never waved through as legacy.
 *  • Before LEGACY_NODE_CODE_GRACE_ENDS, a pre-signing code still claims: the node's old random
 *    secret when it has one (exact match), or no code at all when it never had one.
 *  • After the grace window, anything unsigned is refused.
 */
export function nodeCodeVerdict(input: {
  nodeId: string
  presented: string | null | undefined
  /** The node's pre-signing random secret (`nodes.secret`), or null when it never had one. */
  legacySecret: string | null | undefined
  now?: number
}): NodeCodeVerdict {
  const now = input.now ?? Date.now()
  const presented = typeof input.presented === 'string' ? input.presented : ''

  if (isSignedNodeCode(presented)) {
    return verifyNodeCode(input.nodeId, presented, now) ? 'signed' : 'refused'
  }

  if (now >= LEGACY_NODE_CODE_GRACE_ENDS) return 'refused'

  if (input.legacySecret) {
    return presented && safeEqual(presented, input.legacySecret) ? 'legacy' : 'refused'
  }
  return presented ? 'refused' : 'legacy'
}
