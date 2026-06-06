import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  FIRST_TOUCH_COOKIE,
  CHANNEL_COOKIE,
  FIRST_TOUCH_MAX_AGE,
  buildFirstTouch,
  encodeFirstTouch,
} from '@/lib/attribution/first-touch'

const PROTECTED_PATHS = [
  '/feed',
  '/broadcast',
  '/circles',
  '/practices',
  '/programs',
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
  const { pathname } = request.nextUrl

  // Expose the current route to server components — next/headers can't see the URL
  // otherwise. The right rail reads `x-pathname` to choose its page-specific panels
  // while staying server-rendered (ADR-161). Recomputed per response so it always
  // reflects the latest (cookie-mutated) request headers.
  const withPath = (req: NextRequest) => {
    const headers = new Headers(req.headers)
    headers.set('x-pathname', pathname)
    return headers
  }

  // Start with a plain pass-through response. We may replace it below once
  // the Supabase cookie handler needs to write updated session cookies.
  let supabaseResponse = NextResponse.next({ request: { headers: withPath(request) } })

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
          // the updated cookies to the browser (and re-stamp x-pathname).
          supabaseResponse = NextResponse.next({ request: { headers: withPath(request) } })
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

  // First-touch attribution (ADR-095): record HOW an anonymous visitor first
  // arrived — campaign, referrer, landing page — once, immutably, so it survives
  // the sign-in round-trip and is never lost. Best practice is capture-on-arrival.
  if (!user) {
    if (!request.cookies.get(FIRST_TOUCH_COOKIE)) {
      const touch = buildFirstTouch(request.nextUrl.searchParams, pathname, request.headers.get('referer'))
      supabaseResponse.cookies.set(FIRST_TOUCH_COOKIE, encodeFirstTouch(touch), {
        path: '/', maxAge: FIRST_TOUCH_MAX_AGE, sameSite: 'lax',
      })
    }
    // High-level channel hint for the person-driven entry routes (the QR resolver
    // sets its own on /q). Feeds last-touch; first-touch still wins the tag.
    const channelHint = pathname.startsWith('/join/')
      ? 'referral'
      : pathname.startsWith('/events/')
        ? 'event_guest'
        : null
    if (channelHint) {
      supabaseResponse.cookies.set(CHANNEL_COOKIE, channelHint, {
        path: '/', maxAge: FIRST_TOUCH_MAX_AGE, sameSite: 'lax',
      })
    }
  }

  // Calendar feed downloads (.ics) are intentionally shareable — anyone with
  // the event link should be able to add it to their calendar. Events are
  // already anon-readable via the public_landing_reads RLS policies.
  const isShareableFeed = pathname.endsWith('.ics')
  // The beta induction is the public on-ramp: signed-out visitors get the
  // sequence's cinematic welcome (sign-in embedded) at /onboarding/beta, and the
  // no-auth preview demo at /onboarding/beta/preview (ADR-068). Both override the
  // '/onboarding' protected prefix; the page itself auth-gates the real induction
  // (an unauthed visitor sees the welcome, never the writes). Removed at launch.
  const isBetaEntry = pathname.startsWith('/onboarding/beta')
  const isProtected =
    !isShareableFeed && !isBetaEntry && PROTECTED_PATHS.some((p) => pathname.startsWith(p))

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
