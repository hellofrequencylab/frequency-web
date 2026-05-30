import crypto from 'node:crypto'

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
