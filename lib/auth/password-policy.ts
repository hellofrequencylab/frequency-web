// THE PASSWORD RULE (SEC-045). One place, read by the sign-up, reset and set-a-password forms and by
// the server actions behind them, so the hint a person reads and the check the server runs never drift.
//
// THE SHAPE FOLLOWS NIST SP 800-63B: length is the requirement, composition rules are not. No "one
// capital, one digit, one symbol" (they push people to `Password1!`), no forced rotation, any printable
// character (spaces included, so a passphrase works), paste allowed, and a show-password toggle in place
// of a "type it again" field.
//
// The breached-password check is NOT here: Supabase's leaked-password protection (HaveIBeenPwned, OWN-007)
// refuses a known-breached password on the auth server itself, and its `weak_password` answer comes back
// as the `weak` code (app/sign-in/errors.ts). This module only states the floor and the ceiling so the
// form can say them out loud and the server can refuse early.
//
// 🔴 THE DASHBOARD MUST MATCH. Supabase's own "Minimum password length" (Auth, Providers, Email) is the
// rule an attacker calling the auth API directly meets, since they never touch this module. Keep it set
// to PASSWORD_MIN_LENGTH (docs/RUNBOOKS.md, "Password sign-in").
//
// Pure: no Next, no Supabase.

/** The floor. Owner's call (card 2026-11-25): 12 recommended. */
export const PASSWORD_MIN_LENGTH = 12

/** The ceiling. Supabase hashes with bcrypt, which reads only the first 72 BYTES, so anything longer
 *  would be silently cut. Refusing it is honest; truncating it is not. */
export const PASSWORD_MAX_BYTES = 72

export type PasswordProblem = 'short' | 'long' | 'email'

/** The hint under every new-password field. */
export const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters. A short phrase you will remember works well.`

/** What is wrong with a NEW password, or null when it passes this rule. Characters are counted as the
 *  person sees them (code points), bytes as bcrypt does. */
export function passwordProblem(password: string, email?: string | null): PasswordProblem | null {
  if ([...password].length < PASSWORD_MIN_LENGTH) return 'short'
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return 'long'
  const mailbox = (email ?? '').trim().toLowerCase()
  if (mailbox && password.trim().toLowerCase() === mailbox) return 'email'
  return null
}
