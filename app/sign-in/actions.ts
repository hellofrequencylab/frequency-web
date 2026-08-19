'use server'

import { redirect } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { rateLimitOk } from '@/lib/rate-limit'
import type { SignInErrorCode } from './errors'

// Shared passwordless sign-in actions, used by /sign-in and by the beta induction's
// cinematic welcome (app/join/(induction)/induction.tsx sign-in beat).
//
// A post-login destination is only honoured if it's a same-origin absolute path. We
// stash it in a short-lived cookie rather than on the callback URL, so the auth
// provider's redirect-allowlist match is never affected (emailRedirectTo stays the
// bare, known-good /auth/callback). /auth/callback re-reads + re-validates it.
function safeNext(raw: FormDataEntryValue | null): string {
  const v = typeof raw === 'string' ? raw : ''
  return v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : ''
}

const POST_LOGIN_COOKIE = 'fq_post_login'

/** Bounce back to the form with a CODE, never a sentence. See ./errors.ts for why. */
function fail(code: SignInErrorCode): never {
  redirect(`/sign-in?error=${code}`)
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
  if (!(await rateLimitOk('signin:ip', ip, IP_LIMIT, WINDOW, OPEN_WHEN_UNSET))) fail('rate')
  if (mailbox && !(await rateLimitOk('signin:email', mailbox, EMAIL_LIMIT, WINDOW, OPEN_WHEN_UNSET))) {
    fail('rate')
  }

  await stashNext(safeNext(formData.get('next')))
  const supabase = await createClient()

  // Signup is OPEN: an unknown email provisions an account here. This used to run a per-email invite
  // gate (platform_flags.beta_invite_only) that passed shouldCreateUser=false for anyone not admitted
  // off the beta waitlist, and bounced them to /beta. The waitlist is gone, so the gate has nothing
  // left to check and every email takes the same path.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: await getCallbackUrl() },
  })

  if (error) {
    // Supabase's own wording never reaches the page — see ./errors.ts.
    console.error('[sign-in] magic link failed:', error.message)
    fail('send')
  }

  redirect('/sign-in/confirm')
}

export async function signInWithGoogle(formData: FormData) {
  // IP only: the address is not known until Google hands it back, so there is no mailbox to
  // bucket by. A looser ceiling than the magic link's, because this path sends no mail of ours
  // and its cost is one redirect.
  if (!(await rateLimitOk('signin:oauth', await callerIp(), IP_LIMIT * 2, WINDOW, OPEN_WHEN_UNSET))) {
    fail('rate')
  }

  await stashNext(safeNext(formData.get('next')))
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
    fail('oauth')
  }

  redirect(data.url)
}
