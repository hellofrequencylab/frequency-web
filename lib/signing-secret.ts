// THE HMAC SIGNING SECRET, resolved one way for every token in the product.
//
// WHY THIS EXISTS. Eight modules sign tokens — unsubscribe links, chat/reply addresses, email
// open tracking, opt-in confirms, lead links, event invites — and all eight had written the same
// `getSecret()` by hand: try an explicit env var, else fall back to the first 32 bytes of
// SUPABASE_SERVICE_ROLE_KEY. Four of them had grown a production guard on top of that fallback.
// Four had not. The code read as uniform and was not, which is the worst way for a security
// posture to differ: nothing in the shape of the file tells you which kind you are looking at.
//
// THE RULE, now in one place. In production the fallback is REFUSED. Signing live tokens with the
// service-role key couples every issued link to that key, so rotating it silently invalidates all
// of them at once, and it widens the key's blast radius from "server-side data access" to "anyone
// who can forge a link". A missing secret in production is a deploy error, not a soft-degrade, so
// this throws and the misconfiguration is caught at the first send rather than at the incident.
//
// Outside production the fallback stands, because local dev and CI have no secret provisioned and
// tests need to sign. Tokens minted locally will not validate against production-issued ones,
// which is correct: they were signed with a different key.
//
// The `envNames` list is ordered — first non-empty wins. Several callers accept a chain
// (OPTIN_CONFIRM_SECRET, then BETA_CONFIRM_SECRET, then UNSUBSCRIBE_SECRET) so one provisioned
// value can cover a family of links without setting three.

/** Resolve the HMAC key for a signing module, refusing the service-role fallback in production.
 *
 *  @param label   Module tag for the error message (e.g. 'unsubscribe-tokens').
 *  @param envNames Env var names in priority order; the first non-empty one wins.
 *  @throws When production has none of `envNames` set, or when no key can be resolved at all. */
export function signingSecret(label: string, envNames: readonly string[]): string {
  for (const name of envNames) {
    const value = process.env[name]
    if (value) return value
  }

  const names = envNames.join(' / ')

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `[${label}] ${names} must be set in production. Refusing to sign with the service-role key.`,
    )
  }

  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32)
  if (!fallback) {
    throw new Error(`[${label}] No ${names} and no SUPABASE_SERVICE_ROLE_KEY — cannot sign.`)
  }
  return fallback
}
