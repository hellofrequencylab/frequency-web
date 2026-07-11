'use server'

import { redirect } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { shouldBlockNewSignup } from '@/lib/beta/invite-gate'

// Shared passwordless sign-in actions, used by /sign-in and by the beta induction's
// cinematic welcome (app/onboarding/beta/welcome.tsx).
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
  await stashNext(safeNext(formData.get('next')))
  const supabase = await createClient()

  // INVITE GATE (platform_flags.beta_invite_only, default OFF → this is a no-op today). When ON, a NEW,
  // non-admitted email must not provision an account: passing shouldCreateUser=false makes GoTrue skip
  // creating the auth user (and thus the profile trigger) — while an EXISTING member still receives a
  // login link (shouldCreateUser only affects unknown emails). shouldBlockNewSignup fails OPEN, so a DB
  // hiccup leaves signup fully open. See lib/beta/invite-gate.ts.
  const blockNewSignup = await shouldBlockNewSignup(email)

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: await getCallbackUrl(), shouldCreateUser: !blockNewSignup },
  })

  if (error) {
    // With shouldCreateUser=false, an unknown email errors ("Signups not allowed for otp"). That means a
    // non-admitted new email tried to join while invite-only is ON → send them to the waitlist, no
    // account created. (An existing member never reaches here: their OTP send succeeds.)
    if (blockNewSignup) {
      redirect('/beta')
    }
    redirect(`/sign-in?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/sign-in/confirm')
}

export async function signInWithGoogle(formData: FormData) {
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
    redirect(`/sign-in?error=${encodeURIComponent(error?.message ?? 'OAuth failed')}`)
  }

  redirect(data.url)
}
