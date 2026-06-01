import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Supabase redirects here after a magic-link click or OAuth consent.
// The `code` query param is a one-time PKCE code that must be exchanged
// for a session on the server; the browser never sees the raw tokens.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // `next` lets callers specify a post-login destination (defaults to feed).
  // It arrives from attacker-influenceable links (/sign-in?next=..., invite
  // links), so only accept a same-origin absolute path; anything starting with
  // `//` or `/\` is a protocol-relative open-redirect to another host.
  const requested = searchParams.get('next') ?? '/feed'
  const next =
    requested.startsWith('/') && !requested.startsWith('//') && !requested.startsWith('/\\')
      ? requested
      : '/feed'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong. Send the user back to sign-in with a message.
  return NextResponse.redirect(
    `${origin}/sign-in?error=${encodeURIComponent('Could not sign in. Please try again.')}`
  )
}
