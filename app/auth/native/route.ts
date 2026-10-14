import { NextResponse } from 'next/server'
import { decideNativeReturn } from '@/lib/auth/native-handoff'

// GET /auth/native (LIVE-718): the universal-link return path for a native sign-in. With the app
// installed, iOS opens the app on this URL (claimed in app/.well-known/apple-app-site-association)
// and the app exchanges the code itself, so this handler never runs.
//
// When it DOES run, the link opened in a browser, and the PKCE code_verifier for this code lives in
// the app, not here. The web cannot finish this sign-in and must not try: it used to forward the
// code to /auth/callback, whose exchange always failed ("That link did not work"). Now it reads
// nothing but the query, exchanges nothing and sets no cookie:
//   • a Supabase failure (expired, denied) or a missing/malformed code goes back to /sign-in with a
//     closed-set error code and a safeNextPath-checked `next`;
//   • a good code goes to the hand-off page, which offers "Open the app" (the app's own scheme) and
//     a fresh web sign-in for a device without the app.
// Every redirect is same-origin and built from validated values (lib/auth/native-handoff.ts).

export function GET(request: Request) {
  const url = new URL(request.url)
  const decision = decideNativeReturn(url.searchParams)
  const to = decision.kind === 'handoff' ? decision.handoffPath : decision.to
  const res = NextResponse.redirect(`${url.origin}${to}`)
  // The code rides the URL (Supabase put it there); keep it out of any referrer and any cache.
  res.headers.set('Referrer-Policy', 'no-referrer')
  res.headers.set('Cache-Control', 'no-store')
  return res
}
