'use server'

import { redirect } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

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

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: await getCallbackUrl() },
  })

  if (error) {
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
