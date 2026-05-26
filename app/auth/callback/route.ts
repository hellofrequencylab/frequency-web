import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Supabase redirects here after a magic-link click or OAuth consent.
// The `code` query param is a one-time PKCE code that must be exchanged
// for a session on the server; the browser never sees the raw tokens.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // `next` lets callers specify a post-login destination (defaults to feed).
  const next = searchParams.get('next') ?? '/feed'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong — send the user back to sign-in with a message.
  return NextResponse.redirect(
    `${origin}/sign-in?error=${encodeURIComponent('Could not sign in. Please try again.')}`
  )
}
