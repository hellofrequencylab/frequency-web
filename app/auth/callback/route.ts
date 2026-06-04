import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

// Must match the cookie set in app/sign-in/page.tsx.
const POST_LOGIN_COOKIE = 'fq_post_login'

// Supabase redirects here after a magic-link click or OAuth consent.
// The `code` query param is a one-time PKCE code that must be exchanged
// for a session on the server; the browser never sees the raw tokens.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Post-login destination (defaults to feed). It's carried in the short-lived
  // `fq_post_login` cookie set at sign-in (a `?next=` query param is also honoured
  // for invite links). Both are attacker-influenceable, so only accept a
  // same-origin absolute path; anything starting with `//` or `/\` is a
  // protocol-relative open-redirect to another host.
  const cookieStore = await cookies()
  const requested = searchParams.get('next') ?? cookieStore.get('fq_post_login')?.value ?? '/feed'
  const next =
    requested.startsWith('/') && !requested.startsWith('//') && !requested.startsWith('/\\')
      ? requested
      : '/feed'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const res = NextResponse.redirect(`${origin}${next}`)
      res.cookies.delete(POST_LOGIN_COOKIE)
      return res
    }
  }

  // Something went wrong. Send the user back to sign-in with a message.
  return NextResponse.redirect(
    `${origin}/sign-in?error=${encodeURIComponent('Could not sign in. Please try again.')}`
  )
}
