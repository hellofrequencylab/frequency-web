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
