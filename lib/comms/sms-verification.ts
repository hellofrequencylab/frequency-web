// Pure helpers for the phone-capture + SMS opt-in verification flow (ADR-256).
//
// The settings flow is: a member enters a phone, we text them a 6-digit code and
// write a `pending_verification` row to the sms_consent ledger carrying a HASH of the
// code + an expiry; the member enters the code, we re-hash and compare, and on a match
// insert an `opted_in` row (express written consent recorded). These helpers carry the
// no-IO pieces so they can be unit-tested: E.164 normalization, code generation, the
// salted hash, and the time/attempt validity check. The actions wire them to Supabase.
//
// No secrets in here beyond the per-code salt the caller supplies (TWILIO_AUTH_TOKEN or
// a dedicated secret); the hash is keyed so a leaked ledger row can't be brute-forced
// back to the plaintext code offline without the key.

import crypto from 'node:crypto'

/** How long a verification code is valid for (minutes). Short by design. */
export const SMS_CODE_TTL_MINUTES = 10
/** Max verification attempts before a code is dead (defends against guessing). */
export const SMS_CODE_MAX_ATTEMPTS = 5

/**
 * Normalize a user-entered phone to E.164 (e.g. "+15555550123"), or null when it can't
 * be confidently parsed. Conservative: strips spaces/dashes/parens, keeps a leading +.
 * A bare 10-digit US number is assumed +1 (the launch market); an 11-digit starting
 * with 1 is prefixed with +. Anything already starting with + and 8-15 digits passes
 * through. Returns null rather than guessing for ambiguous input (fail-closed).
 */
export function normalizeE164(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/[^\d]/g, '')
  if (!digits) return null

  if (hasPlus) {
    // International form already supplied; validate length (E.164 is up to 15 digits).
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  }
  // No +: assume the US launch market.
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

/** A cryptographically-random 6-digit numeric code as a zero-padded string. */
export function generateSmsCode(): string {
  // 0..999999 inclusive, uniform via rejection-free modulo on a 32-bit draw is fine
  // here (the slight bias is negligible for a 6-digit human code), but use the
  // dedicated int helper for cleanliness.
  const n = crypto.randomInt(0, 1_000_000)
  return n.toString().padStart(6, '0')
}

/**
 * Salted, keyed hash of a code bound to a phone (so a code for one number is useless
 * for another). Returns a hex digest. `key` is a server secret the plaintext is never
 * stored alongside, so the ledger row alone cannot be reversed.
 */
export function hashSmsCode(code: string, phone: string, key: string): string {
  return crypto.createHmac('sha256', key).update(`${phone}:${code}`).digest('hex')
}

export interface PendingVerification {
  codeHash: string
  /** ISO expiry timestamp. */
  expiresAt: string
  attempts: number
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'too_many_attempts' | 'mismatch' }

/**
 * Pure check of a submitted code against a stored pending verification. Order: expiry
 * first (a stale code is dead regardless), then the attempt cap, then the constant-time
 * hash compare. `nowMs` is injectable for tests. Does NOT mutate; the caller persists
 * the incremented attempt count / the opted_in row.
 */
export function checkSmsCode(
  pending: PendingVerification,
  submittedCode: string,
  phone: string,
  key: string,
  nowMs: number = Date.now(),
): VerifyResult {
  if (Number.isNaN(Date.parse(pending.expiresAt)) || Date.parse(pending.expiresAt) <= nowMs) {
    return { ok: false, reason: 'expired' }
  }
  if (pending.attempts >= SMS_CODE_MAX_ATTEMPTS) {
    return { ok: false, reason: 'too_many_attempts' }
  }
  const expected = hashSmsCode(submittedCode.trim(), phone, key)
  const expectedBuf = Buffer.from(expected)
  const actualBuf = Buffer.from(pending.codeHash)
  const match =
    expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf)
  return match ? { ok: true } : { ok: false, reason: 'mismatch' }
}

/** The secret used to key the code hash. Falls back through SMS-adjacent secrets so the
 *  flow works wherever any one is configured; the hash is keyed, not the consent gate. */
export function smsCodeKey(): string {
  return (
    process.env.SMS_VERIFICATION_SECRET ||
    process.env.TWILIO_AUTH_TOKEN ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'sms-verification-fallback-key'
  )
}
