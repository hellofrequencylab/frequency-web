import { NextResponse, type NextRequest } from 'next/server'

// Forward the current pathname as a request header so server components can read the
// route they're rendering for (next/headers can't see the URL otherwise). The right
// rail (components/sidebar/right-sidebar.tsx) uses this to pick page-specific panels
// while staying server-rendered. Pure pass-through — no auth/redirect logic here
// (auth is handled in the route layouts via the Supabase server client).
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers)
  headers.set('x-pathname', req.nextUrl.pathname)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // Skip static assets, image optimizer, and API routes.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
