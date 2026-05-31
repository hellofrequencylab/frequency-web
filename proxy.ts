import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_PATHS = [
  '/feed',
  '/broadcast',
  '/circles',
  '/practices',
  '/channels',
  '/events',
  '/messages',
  '/people',
  '/search',
  '/crew',
  '/groups',
  '/hubs',
  '/nexuses',
  '/profile',
  '/admin',
  '/onboarding',
  '/settings',
]

export async function proxy(request: NextRequest) {
  // Start with a plain pass-through response. We may replace it below once
  // the Supabase cookie handler needs to write updated session cookies.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Mutate the request cookies first so any downstream Server Component
          // that reads cookies() sees the refreshed values within this request.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Re-create the response with the mutated request so Next.js forwards
          // the updated cookies to the browser.
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Do not add any logic between createServerClient and getUser().
  // A stray await or early return can silently break session refresh, causing
  // users to appear randomly logged out.
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  // Calendar feed downloads (.ics) are intentionally shareable — anyone with
  // the event link should be able to add it to their calendar. Events are
  // already anon-readable via the public_landing_reads RLS policies.
  const isShareableFeed = pathname.endsWith('.ics')
  const isProtected = !isShareableFeed && PROTECTED_PATHS.some((p) => pathname.startsWith(p))

  if (!user && isProtected) {
    const signInUrl = request.nextUrl.clone()
    signInUrl.pathname = '/sign-in'
    // Copy any refreshed session cookies onto the redirect response so they
    // are not lost (e.g. a nearly-expired token that was just rotated).
    const redirectResponse = NextResponse.redirect(signInUrl)
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => redirectResponse.cookies.set(cookie))
    return redirectResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Run on all paths except Next.js internals and static assets.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
