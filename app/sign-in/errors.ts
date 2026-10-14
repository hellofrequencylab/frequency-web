// The sign-in error vocabulary — a CODE in the URL, our words on the page.
//
// WHY THIS EXISTS. `/sign-in` renders `decodeURIComponent(searchParams.error)` straight into the
// page. React escapes it, so this was never script injection — it is CONTENT injection, which on a
// login form is the more useful attack anyway. Anyone could send
// `…/sign-in?error=Your%20account%20is%20locked.%20Call%20555-0100%20to%20restore%20it` and the
// product would render that sentence, in the product's own error styling, on the product's own
// sign-in page. Nothing about the page tells the reader those words came off their own URL.
//
// The second problem was quieter and hit every real error: two of the three writers passed
// Supabase's raw `error.message` through. "Email rate limit exceeded" and
// "AuthApiError: Invalid login credentials" are a vendor's strings, not ours, and they land on the
// one screen where the reader is most likely to give up (docs/CONTENT-VOICE.md).
//
// So the query string now carries a code from a closed set, and the page owns the sentence. An
// unknown code is not rendered — it falls back to the generic line, which is what makes the
// injection surface close rather than narrow.
//
// PURE: no React, no server imports, so the page, the two actions and /auth/callback all read one
// table and the guard test can import it.

export const SIGN_IN_ERRORS = {
  /** The limiter said no. Same words as the subscribe form's throttle, deliberately. */
  rate: 'Too many tries. Give it a few minutes and try again.',
  /** Supabase refused to send the magic link (bad address, provider outage, its own throttle). */
  send: 'That link did not send. Check the address and try again.',
  /** signInWithOAuth failed before we ever left for Google. */
  oauth: 'Google sign-in did not go through. Try again, or use the email link.',
  /** /auth/callback could not exchange the code (expired, already used, different browser). */
  callback: 'That link did not work. Ask for a new one and open it on this device.',
  /** The emailed link was past its expiry, or had already been used once (Supabase `otp_expired`). */
  expired: 'That link has expired. Links work once and only for a short while, so ask for a new one.',
  /** The person backed out of Google's consent screen (`access_denied` with no OTP code). */
  denied: 'Google sign-in was cancelled. Try again, or use the email link.',
} as const

export type SignInErrorCode = keyof typeof SIGN_IN_ERRORS

/**
 * The code for an /auth/callback failure, read from what Supabase put on the callback URL. An expired
 * or reused email link and a cancelled Google consent used to share the `callback` line, which told
 * someone who pressed Cancel on Google to "ask for a new" link.
 */
export function callbackErrorCode(params: { error?: string | null; error_code?: string | null }): SignInErrorCode {
  if (params.error_code === 'otp_expired') return 'expired'
  if (params.error === 'access_denied') return 'denied'
  return 'callback'
}


/** The generic line, for an absent or unrecognised code. */
export const SIGN_IN_ERROR_FALLBACK = 'Something went wrong. Try that again.'

/**
 * The sentence to show for whatever arrived in `?error=`, or null when nothing did.
 *
 * A value that is not a known code still renders SOMETHING — a real failure must never be
 * silent — but it renders OUR generic line, never the attacker's (or the vendor's) text.
 */
export function signInErrorMessage(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const code = raw.trim()
  return (SIGN_IN_ERRORS as Record<string, string>)[code] ?? SIGN_IN_ERROR_FALLBACK
}
