import { NextResponse } from 'next/server'

// GET /auth/native (LIVE-718): the universal-link return path for a native sign-in. With the app
// installed, iOS opens the app on this URL (claimed in app/.well-known/apple-app-site-association)
// and the app exchanges the code itself. Without the app, the browser lands here, and the web
// finishes the same sign-in: the query (the PKCE `code`, and any `next`) is handed to the web's
// own callback unchanged, which validates everything it reads.

export function GET(request: Request) {
  const url = new URL(request.url)
  return NextResponse.redirect(`${url.origin}/auth/callback${url.search}`)
}
