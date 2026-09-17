// THE LAST-SIGN-IN HINT (ADR-1392). A small, device-local reminder of HOW someone signed in last time,
// so a returning member uses the same door instead of opening a second account.
//
// WHY. Sign-in is two passwordless doors (an email link and Google), and every address that has never
// been used creates a new account. A member who joined with Google on one Gmail and later typed a
// different address into the email form ended up with two accounts, then three. The sign-in page now
// says "Last time you signed in with Google (m•••@gmail.com)".
//
// PRIVACY. The cookie holds the method and a MASKED address only, never the address itself, so a shared
// device shows a hint rather than someone's email. The value is re-validated on read against a strict
// shape, because a cookie is user-controlled and this text renders on the sign-in page.
//
// Pure: no Next, no Supabase.

export const SIGN_IN_HINT_COOKIE = 'fq_last_sign_in'

/** Carries the address from "no account for that email" to the confirm step. httpOnly and short-lived,
 *  so the address never rides on a URL. Read by app/sign-in/page.tsx, written by app/sign-in/actions.ts. */
export const NEW_ACCOUNT_EMAIL_COOKIE = 'fq_new_account_email'
/** A year: long enough to still help someone who signs in rarely. */
export const SIGN_IN_HINT_MAX_AGE = 60 * 60 * 24 * 365

export type SignInMethod = 'google' | 'email'

export interface SignInHint {
  method: SignInMethod
  /** e.g. "m•••@gmail.com" */
  masked: string
}

const MASK = '•••'
const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

/** "meghan@gmail.com" → "m•••@gmail.com". Null for anything that is not a plausible address. */
export function maskEmail(email: string | null | undefined): string | null {
  const e = (email ?? '').trim()
  const at = e.lastIndexOf('@')
  if (at < 1 || at === e.length - 1) return null
  const domain = e.slice(at + 1).toLowerCase()
  if (!DOMAIN_RE.test(domain) || domain.length > 253) return null
  const first = e[0].toLowerCase()
  if (!/[a-z0-9]/.test(first)) return null
  return `${first}${MASK}@${domain}`
}

/** The door this user most recently came through, from their identities. Google wins only when its
 *  identity carries the latest sign-in; anything else reads as the email link. */
export function lastSignInMethod(
  identities: readonly { provider?: string | null; last_sign_in_at?: string | null }[] | null | undefined,
  fallbackProvider?: string | null,
): SignInMethod {
  let best: { provider: string; at: number } | null = null
  for (const i of identities ?? []) {
    const at = i.last_sign_in_at ? Date.parse(i.last_sign_in_at) : NaN
    if (!i.provider || Number.isNaN(at)) continue
    if (!best || at > best.at) best = { provider: i.provider, at }
  }
  const provider = best?.provider ?? fallbackProvider ?? 'email'
  return provider === 'google' ? 'google' : 'email'
}

export function encodeSignInHint(hint: SignInHint): string {
  return `${hint.method}|${hint.masked}`
}

/** Read the cookie back, or null. Anything not exactly the shape this module writes is ignored. */
export function decodeSignInHint(raw: string | null | undefined): SignInHint | null {
  if (typeof raw !== 'string' || raw.length > 300) return null
  const [method, masked, extra] = raw.split('|')
  if (extra !== undefined || (method !== 'google' && method !== 'email')) return null
  const at = (masked ?? '').indexOf('@')
  if (at !== 1 + MASK.length || !(masked ?? '').startsWith(`${masked![0]}${MASK}@`)) return null
  if (!/^[a-z0-9]$/.test(masked![0]) || !DOMAIN_RE.test(masked!.slice(at + 1))) return null
  return { method, masked: masked! }
}

/** The one sentence the sign-in page shows. */
export function signInHintSentence(hint: SignInHint): string {
  return hint.method === 'google'
    ? `Last time you signed in with Google (${hint.masked}).`
    : `Last time you signed in with an email link to ${hint.masked}.`
}
