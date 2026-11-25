'use server'

import { redirect } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { rateLimitOk } from '@/lib/rate-limit'
import { FUNNELS } from '@/lib/funnels/definitions'
import { SIGN_IN_ERRORS, type SignInErrorCode } from './errors'
// 🔴 A 'use server' module may export ONLY async functions: exporting this constant from here failed the
// production build ("The module has no exports at all"), which tsc and vitest cannot see. It lives in
// the pure helper instead.
import { NEW_ACCOUNT_EMAIL_COOKIE, SIGN_IN_HINT_COOKIE, SIGN_IN_HINT_MAX_AGE } from '@/lib/auth/sign-in-hint'
import { passwordProblem } from '@/lib/auth/password-policy'
import { finishSignIn } from '@/lib/auth/finish-sign-in'
import { safeNextPath } from '@/lib/auth/safe-next'
import { SECURE_COOKIE } from '@/lib/http/cookie-secure'

// Shared passwordless sign-in actions, used by /sign-in and by the beta induction's
// cinematic welcome (app/join/(induction)/induction.tsx sign-in beat).
//
// A post-login destination is only honoured if it's a same-origin absolute path. We
// stash it in a short-lived cookie rather than on the callback URL, so the auth
// provider's redirect-allowlist match is never affected (emailRedirectTo stays the
// bare, known-good /auth/callback). /auth/callback re-reads + re-validates it.
function safeNext(raw: FormDataEntryValue | null): string {
  return safeNextPath(raw)
}

/** The funnel a signup came from, narrowed to a slug the CODE defines.
 *
 *  🔴 WHY THIS TRAVELS ON THE USER AND NOT ONLY IN THE COOKIE. The comment above is right that a
 *  bare `emailRedirectTo` keeps the provider's redirect-allowlist match safe, and that is not
 *  being changed here. What it assumes is that the magic link is opened in the SAME browser
 *  context that set the cookie — and for the beta funnel's actual traffic that is false almost
 *  every time: the page is opened inside Instagram's in-app webview, which has its own cookie
 *  jar, and the emailed link opens in Safari. `fq_post_login` is simply not there, so the
 *  destination defaults to /feed and a person who asked for a breathwork timer lands in the
 *  generic Circles induction.
 *
 *  Supabase applies `options.data` to the new auth user's metadata, so this survives the jump
 *  between browsers, devices and days in a way no cookie can. It is READ BACK through this same
 *  FUNNELS map in app/auth/callback/route.ts — never trusted as a path. */
function safeSeq(raw: FormDataEntryValue | null): string {
  const v = typeof raw === 'string' ? raw : ''
  return Object.prototype.hasOwnProperty.call(FUNNELS, v) ? v : ''
}

const POST_LOGIN_COOKIE = 'fq_post_login'

/** Bounce back to the form with a CODE, never a sentence. See ./errors.ts for why. The validated
 *  `next` rides along, so the retry still lands where the person was going: it used to be dropped
 *  here, and a throttled or failed first try sent the second one to /feed. */
function fail(code: SignInErrorCode, next = ''): never {
  redirect(`/sign-in?error=${code}${next ? `&next=${encodeURIComponent(next)}` : ''}`)
}

/** Supabase's OWN email throttle (HTTP 429, `over_email_send_rate_limit`). It used to fall into
 *  `send`, which tells a person whose address is fine to check their address. */
function isProviderThrottle(error: { status?: number; code?: string; message?: string }): boolean {
  return (
    error.status === 429 ||
    error.code === 'over_email_send_rate_limit' ||
    error.code === 'over_request_rate_limit' ||
    /rate limit/i.test(error.message ?? '')
  )
}

async function callerIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}

// THE THROTTLE, AND THE ONE THING TO UNDERSTAND ABOUT IT (LIVE-043).
//
// Two buckets, because they stop two different things and neither covers the other:
//   · BY IP catches the spray — one machine walking a list of addresses to learn which ones have
//     accounts, or simply hammering the endpoint. A shared office or household NAT is one IP, so
//     the ceiling is set where a real group of people never reaches it.
//   · BY EMAIL catches the mailbox flood — the address is the target, and the attacker can rotate
//     IPs freely. It is also the bucket that protects the SUPABASE quota, since every accepted
//     request sends real mail.
//
// `whenUnconfigured: 'allow'` is deliberate and is the load-bearing decision here. lib/rate-limit
// FAILS CLOSED in production when Upstash is absent, which is right for a public write and
// catastrophic for this one: an expired KV token would take out sign-in AND sign-up for everyone,
// on a product that is otherwise up. Unthrottled is where this endpoint stood yesterday; denied
// is an outage. See UnconfiguredPolicy in lib/rate-limit.ts.
const IP_LIMIT = 10 // per window, per address
const EMAIL_LIMIT = 4 // per window, per mailbox
const WINDOW = '10 m' as const
const OPEN_WHEN_UNSET = { whenUnconfigured: 'allow' } as const

async function stashNext(next: string) {
  if (!next) return
  ;(await cookies()).set(POST_LOGIN_COOKIE, next, {
    httpOnly: true,
    secure: SECURE_COOKIE,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // an hour to click the magic link
  })
}

async function getCallbackUrl() {
  const origin = (await headers()).get('origin')
  return `${origin}/auth/callback`
}

export async function signInWithMagicLink(formData: FormData) {
  const email = formData.get('email') as string
  const ip = await callerIp()
  // Lower-cased for the bucket key only. The address sent to Supabase is untouched: the local
  // part of an address is case-sensitive per RFC 5321, and it is not this function's business to
  // decide otherwise. Without the fold, `A@x.com` and `a@x.com` would be two buckets and the
  // per-mailbox ceiling would be trivially doubled.
  const mailbox = (email ?? '').trim().toLowerCase()
  const next = safeNext(formData.get('next'))
  if (!(await rateLimitOk('signin:ip', ip, IP_LIMIT, WINDOW, OPEN_WHEN_UNSET))) fail('rate', next)
  if (mailbox && !(await rateLimitOk('signin:email', mailbox, EMAIL_LIMIT, WINDOW, OPEN_WHEN_UNSET))) {
    fail('rate', next)
  }

  await stashNext(next)
  const supabase = await createClient()

  // Signup is OPEN: an unknown email provisions an account here. This used to run a per-email invite
  // gate (platform_flags.beta_invite_only) that passed shouldCreateUser=false for anyone not admitted
  // off the beta waitlist, and bounced them to /beta. The waitlist is gone, so the gate has nothing
  // left to check and every email takes the same path.
  // `emailRedirectTo` stays the bare, known-good /auth/callback — see the note at the top of this
  // file. The funnel rides in user metadata instead, which costs the allowlist nothing.
  const seq = safeSeq(formData.get('seq'))
  // ASK BEFORE CREATING (ADR-1392). The /sign-in form posts `mode=signin`: an address with no account
  // is NOT silently made into a new one, because that is how a member who joined with Google, or who
  // mistyped their address, ended up with two and three accounts. They are asked first. Every other
  // caller (the join induction, the feature funnels) is a signup and keeps creating in one step, and
  // so does the confirm step itself, which posts `mode=create`.
  const askFirst = formData.get('mode') === 'signin'
  // Deleted on the path it was SET on (below): a bare-name delete targets path `/` and left it standing.
  if (formData.get('mode') === 'create') (await cookies()).delete({ name: NEW_ACCOUNT_EMAIL_COOKIE, path: '/sign-in' })
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: await getCallbackUrl(),
      shouldCreateUser: !askFirst,
      ...(seq ? { data: { funnel_seq: seq } } : {}),
    },
  })

  if (error && askFirst && isNoAccountError(error)) {
    ;(await cookies()).set(NEW_ACCOUNT_EMAIL_COOKIE, (email ?? '').trim().slice(0, 254), {
      httpOnly: true,
      secure: SECURE_COOKIE,
      sameSite: 'lax',
      path: '/sign-in',
      maxAge: 60 * 15,
    })
    // `next` rides on the URL too: the step's hidden field and its "Go back" link read it from there.
    redirect(`/sign-in?step=new-account${next ? `&next=${encodeURIComponent(next)}` : ''}`)
  }

  if (error) {
    // Supabase's own wording never reaches the page — see ./errors.ts.
    console.error('[sign-in] magic link failed:', error.message)
    fail(isProviderThrottle(error) ? 'rate' : 'send', next)
  }

  redirect('/sign-in/confirm')
}

/**
 * The Frequency beta entry's send (SCAN-879, components/frequency/site/pages/join/frequency-join.tsx).
 * The SAME throttle buckets, the same post-login cookie, the same bare callback and the same signup
 * OTP as signInWithMagicLink, which an unknown address turns into a new account exactly as the join
 * induction always has. The one difference is the ending: it RETURNS instead of redirecting to
 * /sign-in/confirm, because the entry sends the email as soon as the name and address are in and keeps
 * the visitor on the page for the photo-and-location step while it travels. Errors are our own
 * sentences (./errors.ts), never Supabase's.
 */
export async function sendSignupLink(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = String(formData.get('email') ?? '').trim()
  const mailbox = email.toLowerCase()
  if (!mailbox) return { ok: false, error: SIGN_IN_ERRORS.send }
  const next = safeNext(formData.get('next'))
  if (!(await rateLimitOk('signin:ip', await callerIp(), IP_LIMIT, WINDOW, OPEN_WHEN_UNSET))) {
    return { ok: false, error: SIGN_IN_ERRORS.rate }
  }
  if (!(await rateLimitOk('signin:email', mailbox, EMAIL_LIMIT, WINDOW, OPEN_WHEN_UNSET))) {
    return { ok: false, error: SIGN_IN_ERRORS.rate }
  }

  await stashNext(next)
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: await getCallbackUrl(), shouldCreateUser: true },
  })
  if (error) {
    console.error('[sign-in] signup link failed:', error.message)
    return { ok: false, error: isProviderThrottle(error) ? SIGN_IN_ERRORS.rate : SIGN_IN_ERRORS.send }
  }
  return { ok: true }
}

/** Supabase's answer when `shouldCreateUser` is false and the address has no account: HTTP 422,
 *  `otp_disabled`, "Signups not allowed for otp" (probed against the live project 2026-09-16). */
function isNoAccountError(error: { code?: string; message?: string }): boolean {
  return error.code === 'otp_disabled' || /signups not allowed/i.test(error.message ?? '')
}

export async function signInWithGoogle(formData: FormData) {
  // IP only: the address is not known until Google hands it back, so there is no mailbox to
  // bucket by. A looser ceiling than the magic link's, because this path sends no mail of ours
  // and its cost is one redirect.
  const next = safeNext(formData.get('next'))
  if (!(await rateLimitOk('signin:oauth', await callerIp(), IP_LIMIT * 2, WINDOW, OPEN_WHEN_UNSET))) {
    fail('rate', next)
  }

  await stashNext(next)
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: await getCallbackUrl(),
      // Always show Google's account chooser instead of silently reusing the
      // browser's active session — lets people pick which account to sign in with.
      queryParams: { prompt: 'select_account' },
    },
  })

  if (error || !data.url) {
    console.error('[sign-in] google oauth failed:', error?.message ?? 'no redirect url')
    fail('oauth', next)
  }

  redirect(data.url)
}

// ── PASSWORDS (SEC-045) ─────────────────────────────────────────────────────────────────────────────
//
// The third door, beside the magic link and Google. Frequency was passwordless from its first commit
// (ADR-071/082/510); the owner asked for a normal email and password on 2026-11-25. Every rule below is
// the existing front door's rule applied to one more form: the same limiter with the same fail-OPEN opt
// (LIVE-043), the same closed error vocabulary (./errors.ts), the same validated `next`.
//
// WHAT KEEPS IT SAFE, and where each piece lives:
//   · breached passwords: Supabase leaked-password protection (HaveIBeenPwned, OWN-007) → `weak`.
//   · the length rule: lib/auth/password-policy.ts here, and the matching dashboard minimum.
//   · enumeration: a wrong address and a wrong password read the same; sign-up and reset always say
//     "check your email", whether or not the address has an account.
//   · account takeover by sign-up: "Confirm email" is ON in the live project (mailer_autoconfirm=false,
//     read 2026-11-25), so a password sign-up gets NO session until its mailbox clicks the link, and
//     Supabase only joins identities whose email is verified.
//   · guessing: a per-mailbox bucket (five tries per ten minutes) on top of the per-IP one and
//     Supabase's own limits.
//   · reset: a recovery session must be fresh to set a password, and setting one signs every OTHER
//     session out.

/** Five password tries per mailbox per window. A person who mistyped gets five; a guesser gets five. */
const PASSWORD_EMAIL_LIMIT = 5
/** How recent a sign-in must be to set a new password with it: the recovery link's own lifetime. */
const RESET_FRESH_MS = 60 * 60 * 1000

/** Bounce to a password form with a CODE. `fail` (above) always lands on /sign-in; these forms each
 *  have their own page, so the error comes back to the form that raised it. */
function bounce(path: string, code: SignInErrorCode, next = ''): never {
  const sep = path.includes('?') ? '&' : '?'
  redirect(`${path}${sep}error=${code}${next ? `&next=${encodeURIComponent(next)}` : ''}`)
}

function field(formData: FormData, name: string): string {
  const v = formData.get(name)
  return typeof v === 'string' ? v : ''
}

export async function signInWithPassword(formData: FormData) {
  const email = field(formData, 'email').trim()
  const password = field(formData, 'password')
  const mailbox = email.toLowerCase()
  const next = safeNext(formData.get('next'))
  const back = '/sign-in?method=password'
  if (!(await rateLimitOk('signin:pw-ip', await callerIp(), IP_LIMIT * 2, WINDOW, OPEN_WHEN_UNSET))) {
    bounce(back, 'rate', next)
  }
  if (mailbox && !(await rateLimitOk('signin:pw-email', mailbox, PASSWORD_EMAIL_LIMIT, WINDOW, OPEN_WHEN_UNSET))) {
    bounce(back, 'rate', next)
  }
  if (!mailbox || !password) bounce(back, 'credentials', next)

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    if (isProviderThrottle(error)) bounce(back, 'rate', next)
    if (error.code === 'email_not_confirmed') bounce(back, 'unconfirmed', next)
    // Never log the address or the password: a failed sign-in is routine, and a log line is a copy.
    bounce(back, 'credentials', next)
  }

  const { destination, hint } = await finishSignIn(supabase, next || null)
  const jar = await cookies()
  jar.delete(POST_LOGIN_COOKIE)
  if (hint) {
    jar.set(SIGN_IN_HINT_COOKIE, hint, {
      httpOnly: true,
      secure: SECURE_COOKIE,
      sameSite: 'lax',
      path: '/',
      maxAge: SIGN_IN_HINT_MAX_AGE,
    })
  }
  redirect(destination)
}

export async function signUpWithPassword(formData: FormData) {
  const email = field(formData, 'email').trim()
  const password = field(formData, 'password')
  const mailbox = email.toLowerCase()
  const next = safeNext(formData.get('next'))
  const back = '/sign-in?step=create'
  // This path SENDS MAIL, so it shares the magic link's buckets: one mailbox cannot be flooded by
  // alternating between the two forms.
  if (!(await rateLimitOk('signin:ip', await callerIp(), IP_LIMIT, WINDOW, OPEN_WHEN_UNSET))) bounce(back, 'rate', next)
  if (mailbox && !(await rateLimitOk('signin:email', mailbox, EMAIL_LIMIT, WINDOW, OPEN_WHEN_UNSET))) {
    bounce(back, 'rate', next)
  }
  if (!mailbox) bounce(back, 'send', next)
  const problem = passwordProblem(password, email)
  if (problem) bounce(back, problem, next)

  await stashNext(next)
  const seq = safeSeq(formData.get('seq'))
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: await getCallbackUrl(),
      ...(seq ? { data: { funnel_seq: seq } } : {}),
    },
  })
  if (error) {
    if (isProviderThrottle(error)) bounce(back, 'rate', next)
    if (error.code === 'weak_password') bounce(back, 'weak', next)
    // `user_already_exists` only comes back when confirmations are OFF. With them on (live), Supabase
    // answers an existing address with a look-alike success, which is what keeps this form from
    // telling a stranger who has an account. Either way the screen below says the same thing.
    if (error.code !== 'user_already_exists') {
      console.error('[sign-in] password sign-up failed:', error.code ?? error.message)
      bounce(back, 'send', next)
    }
  }
  ;(await cookies()).delete({ name: NEW_ACCOUNT_EMAIL_COOKIE, path: '/sign-in' })
  redirect('/sign-in/confirm?sent=signup')
}

export async function requestPasswordReset(formData: FormData) {
  const email = field(formData, 'email').trim()
  const mailbox = email.toLowerCase()
  const back = '/sign-in?step=forgot'
  if (!(await rateLimitOk('signin:ip', await callerIp(), IP_LIMIT, WINDOW, OPEN_WHEN_UNSET))) bounce(back, 'rate')
  if (mailbox && !(await rateLimitOk('signin:email', mailbox, EMAIL_LIMIT, WINDOW, OPEN_WHEN_UNSET))) bounce(back, 'rate')
  if (!mailbox) bounce(back, 'send')

  // The recovery link lands on the bare /auth/callback like every other link (the redirect allow-list
  // is that one URL), and the stashed destination carries the person on to the new-password form.
  await stashNext('/sign-in?step=new-password')
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: await getCallbackUrl() })
  if (error && isProviderThrottle(error)) bounce(back, 'rate')
  if (error) console.error('[sign-in] password reset send failed:', error.code ?? error.message)
  // Same screen whether or not the address has an account, and whether or not the send worked for an
  // unknown address: the reset form must not be a way to test which emails are members.
  redirect('/sign-in/confirm?sent=reset')
}

export async function setNewPassword(formData: FormData) {
  const password = field(formData, 'password')
  const back = '/sign-in?step=new-password'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // A fresh sign-in only: the recovery link (or a sign-in a moment ago). An old session on a shared or
  // unlocked device must not be able to take the account over by changing its password.
  const at = user?.last_sign_in_at ? Date.parse(user.last_sign_in_at) : NaN
  if (!user || Number.isNaN(at) || Date.now() - at > RESET_FRESH_MS) bounce('/sign-in?step=forgot', 'reset')
  const problem = passwordProblem(password, user.email)
  if (problem) bounce(back, problem)

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    if (error.code === 'weak_password') bounce(back, 'weak')
    if (error.code === 'same_password') bounce(back, 'same')
    if (error.code === 'reauthentication_needed') bounce('/sign-in?step=forgot', 'reset')
    if (isProviderThrottle(error)) bounce(back, 'rate')
    console.error('[sign-in] set password failed:', error.code ?? error.message)
    bounce(back, 'send')
  }
  // A new password ends every OTHER session: whoever knew the old one is signed out everywhere.
  await supabase.auth.signOut({ scope: 'others' }).catch(() => {})
  redirect('/sign-in/confirm?sent=password-saved')
}
