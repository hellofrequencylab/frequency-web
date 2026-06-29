import crypto from 'node:crypto'

// Default replay window: a signed payload older (or newer) than this is rejected.
// Svix's own SDK uses the same 5-minute tolerance.
export const WEBHOOK_TOLERANCE_SECONDS = 300

/**
 * Whether a svix-timestamp (Unix seconds, as a string) is within the replay-window
 * tolerance of `now`. The signature covers the timestamp, so a stale-but-valid payload
 * is a captured signed request being replayed — reject it. A non-numeric / missing
 * timestamp is rejected (fail-closed). `nowMs` is injectable for tests.
 */
export function isFreshTimestamp(
  timestamp: string | null | undefined,
  toleranceSeconds: number = WEBHOOK_TOLERANCE_SECONDS,
  nowMs: number = Date.now(),
): boolean {
  if (!timestamp) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  const nowSeconds = Math.floor(nowMs / 1000)
  return Math.abs(nowSeconds - ts) <= toleranceSeconds
}

// Svix-style HMAC verification for Resend webhooks (no svix dependency). The
// signed content is `${id}.${timestamp}.${body}`; the secret is "whsec_<base64>".
// The svix-signature header is a space-separated list of "v1,<base64sig>" entries.
export function verifyResendSignature(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
  signatureHeader: string,
): boolean {
  try {
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
    const expected = crypto
      .createHmac('sha256', key)
      .update(`${id}.${timestamp}.${body}`)
      .digest('base64')
    const expectedBuf = Buffer.from(expected)
    return signatureHeader.split(' ').some((part) => {
      const sig = part.split(',')[1]
      if (!sig) return false
      const sigBuf = Buffer.from(sig)
      return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)
    })
  } catch {
    return false
  }
}

// ── Twilio webhook (X-Twilio-Signature) verification, no `twilio` dependency ──
//
// Twilio's documented scheme (ADR-256): build the signed string by taking the FULL
// request URL (scheme + host + path + query, exactly as Twilio called it) and, for a
// form-encoded POST, appending each POST parameter's key immediately followed by its
// value, with the parameters sorted alphabetically by key and NO separators between
// them. HMAC-SHA1 that string with the account auth token as the key, base64-encode
// it, and compare to the X-Twilio-Signature header. Pure + unit-testable.

/**
 * Build the exact string Twilio signs: `url` + each sorted `key+value` concatenated.
 * Sorting is by the raw key (Twilio uses a simple alphabetical sort of param names).
 */
export function buildTwilioSignedString(url: string, params: Record<string, string>): string {
  const keys = Object.keys(params).sort()
  let signed = url
  for (const key of keys) signed += key + params[key]
  return signed
}

/**
 * Verify an X-Twilio-Signature header. `url` is the full URL Twilio POSTed to (must
 * match what you configured in the Twilio console, including scheme + host), `params`
 * is the parsed form body, and `signatureHeader` is the base64 signature Twilio sent.
 * Returns false on any error or mismatch (fail-closed). Constant-time comparison.
 */
export function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signatureHeader: string | null | undefined,
): boolean {
  if (!authToken || !signatureHeader) return false
  try {
    const signed = buildTwilioSignedString(url, params)
    const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(signed, 'utf8')).digest('base64')
    const expectedBuf = Buffer.from(expected)
    const sigBuf = Buffer.from(signatureHeader)
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)
  } catch {
    return false
  }
}
