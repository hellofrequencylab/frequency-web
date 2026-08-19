import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  FIRST_TOUCH_COOKIE,
  CHANNEL_COOKIE,
  FIRST_TOUCH_MAX_AGE,
  buildFirstTouch,
  encodeFirstTouch,
} from '@/lib/attribution/first-touch'
import { isProfileRef } from '@/lib/qr/public-url'
import { hasPublicTwin } from '@/lib/nav/public-twin'
import { referralsEnabled } from '@/lib/platform-flags'
import { isFunnelSplashPath } from '@/lib/funnels/definitions'

// The referral attribution cookie — the referrer's profile id, consumed once at
// onboarding by applyReferralAttribution (lib/qr/referral.ts). Name + attributes MUST
// match the /q resolver (app/q/[slug]/route.ts) so both entry points feed one consumer.
const REF_COOKIE = 'fq_ref'
const REF_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

const PROTECTED_PATHS = [
  '/feed',
  '/nearby',
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
  const { pathname } = request.nextUrl

  // Expose the current route to server components — next/headers can't see the URL
  // otherwise. The right rail reads `x-pathname` to choose its page-specific panels
  // while staying server-rendered (ADR-161). `x-search` carries the query string so a
  // deep server component (e.g. a layout-engine block) can read the page's facets —
  // searchParams are a PAGE prop and never reach a nested module otherwise. Recomputed
  // per response so it always reflects the latest (cookie-mutated) request headers.
  const withPath = (req: NextRequest) => {
    const headers = new Headers(req.headers)
    headers.set('x-pathname', pathname)
    headers.set('x-search', req.nextUrl.search)
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
    // Profile SHARE-LINK referral (the bug fix): a person's share link/QR carries
    // `?ref=<ownerProfileId>` (see publicShareUrl). A Server Component page can't set
    // cookies, so — exactly as the /q resolver does for an owner-owned scan — we drop the
    // `fq_ref` attribution cookie HERE for an anonymous visitor, and the eventual signup is
    // credited to that owner at onboarding (applyReferralAttribution). Gated identically to
    // /q: anonymous only, referrals master switch on. Set BEFORE the protected-path redirect
    // below so the cookie is copied onto the /sign-in redirect (profiles are protected).
    //
    // Not a hot-path DB read: the flag is only consulted when the `?ref` param is actually
    // present (share-link traffic), which is rare. First-touch wins — never overwrite an
    // existing fq_ref. The ref is UUID-validated so a junk value can't poison the cookie;
    // applyReferralAttribution still checks the referrer exists + isn't self before crediting.
    const ref = request.nextUrl.searchParams.get('ref')
    if (isProfileRef(ref) && !request.cookies.get(REF_COOKIE)) {
      // Master switch (defaults on, like the /q resolver). Read defensively: the flag
      // reader is React-cache wrapped, so a non-render context must never throw the proxy.
      // Both branches assign, so no initializer is needed (and a dead one trips CodeQL).
      let enabled: boolean
      try {
        enabled = await referralsEnabled()
      } catch {
        enabled = true
      }
      if (enabled) {
        supabaseResponse.cookies.set(REF_COOKIE, ref, {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: REF_COOKIE_MAX_AGE,
        })
      }
    }

    if (!request.cookies.get(FIRST_TOUCH_COOKIE)) {
      const touch = buildFirstTouch(request.nextUrl.searchParams, pathname, request.headers.get('referer'))
      supabaseResponse.cookies.set(FIRST_TOUCH_COOKIE, encodeFirstTouch(touch), {
        path: '/', maxAge: FIRST_TOUCH_MAX_AGE, sameSite: 'lax',
      })
    }
    // High-level channel hint for the person-driven entry routes (the QR resolver
    // sets its own on /q). Feeds last-touch; first-touch still wins the tag.
    // /join/<x> is two doors on one segment (ADR-1090): a Circle INVITE token is a
    // referral, but a Funnel SPLASH slug (/join/breathwork) is not person-driven —
    // its channel comes from utm/referrer like any campaign landing, exactly as it
    // did at /beta/<slug>. isFunnelSplashPath tells them apart (code Funnel slugs
    // are known synchronously; only they have splashes).
    const channelHint = pathname.startsWith('/join/') && !isFunnelSplashPath(pathname)
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
  // The Funnels front door (ADR-068, renamed ADR-1090) lives at /join, which is
  // deliberately NOT in PROTECTED_PATHS: signed-out visitors run the whole
  // cinematic induction (sign-in embedded) at /join, the no-auth preview at
  // /join/preview, and the splash/invite pages at /join/<slug>. The pages
  // themselves auth-gate every write. Old /onboarding/beta URLs 308 to /join in
  // next.config.ts BEFORE this proxy runs, so the '/onboarding' protected prefix
  // never sees them and needs no carve-out any more.
  // Public events (SEO/AIO + shareable): the events index and an event's detail page are
  // anon-readable — a signed-out visitor sees the event and is prompted to sign in for any
  // action. The CREATE flow (/events/new) and host MANAGE sub-routes stay protected.
  const isPublicEventView =
    pathname === '/events' ||
    (pathname.startsWith('/events/') &&
      pathname !== '/events/new' &&
      !pathname.startsWith('/events/new/') &&
      !/\/manage(\/|$)/.test(pathname))
  // Member detail routes with a canonical PUBLIC twin under /discover (lib/nav/public-twin.ts).
  // A share link or QR resolves to the MEMBER url (/circles/<slug>, /practices/<id>, …), so
  // bouncing an anonymous recipient to /sign-in dead-ends the one growth channel that costs
  // nothing. Let the request through to the (main) layout, whose signed-out branch resolves the
  // twin and redirects there. Only the DETAIL route matches: the index pages and every /manage,
  // /edit and /settings sub-route fall through and stay protected exactly as before.
  const isTwinRedirectable = hasPublicTwin(pathname)
  const isProtected =
    !isShareableFeed &&
    !isPublicEventView &&
    !isTwinRedirectable &&
    PROTECTED_PATHS.some((p) => pathname.startsWith(p))

  if (!user && isProtected) {
    const signInUrl = request.nextUrl.clone()
    signInUrl.pathname = '/sign-in'
    // Carry WHERE THEY WERE GOING through the sign-in round trip. Without this the destination was
    // simply dropped: someone who followed a link to a specific page got a bare sign-in form and,
    // after clicking the magic link, landed on /feed having never reached the thing they came for.
    // The machinery to honour it already existed end to end and nothing was feeding it — /sign-in
    // reads `next`, re-validates it as a same-origin absolute path, and stashes it in the short-lived
    // `fq_post_login` cookie, which /auth/callback re-reads and re-validates before redirecting.
    //
    // The search string rides along so a parameterised destination survives, and the query is REBUILT
    // rather than inherited: `clone()` keeps the original page's params, which would otherwise arrive
    // on /sign-in as stray input (a `?ref` is already banked in a cookie above, and an `?error` would
    // render someone else's error banner on the form).
    const destination = `${pathname}${request.nextUrl.search}`
    signInUrl.search = ''
    signInUrl.searchParams.set('next', destination)
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
