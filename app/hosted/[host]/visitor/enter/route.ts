import { NextResponse } from 'next/server'
import { resolveHostedSpace } from '@/lib/sites/hosted'
import { normalizeHost } from '@/lib/sites/host'
import {
  SITE_VISITOR_COOKIE,
  SITE_VISITOR_MAX_AGE_S,
  readVisitorHandoff,
  safeSitePath,
  signVisitorCookie,
} from '@/lib/sites/site-visitor'

// THE WEBSITE LOG IN, SITE SIDE (LIVE-1207, lib/sites/site-visitor.ts). `/_s/enter?t=…&next=/page` on the
// website's own host, rewritten here by the proxy. Frequency minted the handoff token for this host; this
// checks it, keeps the person's name, handle and photo in a signed host-only cookie, and lands on the page
// asked for so the token leaves the address bar at once. A bad, expired or other-site token sets nothing and
// lands on the same page, signed out. The cookie is read only by /_s/me, never by the cached page render.
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host: hostParam } = await params
  const host = normalizeHost(decodeURIComponent(hostParam))
  const url = new URL(req.url)
  const res = NextResponse.redirect(new URL(safeSitePath(url.searchParams.get('next')), `https://${host}`), 303)
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('Referrer-Policy', 'no-referrer')
  const token = url.searchParams.get('t')
  const visitor = token ? readVisitorHandoff(token, host) : null
  const space = visitor ? await resolveHostedSpace(host) : null
  const cookie = space && visitor ? signVisitorCookie(host, visitor) : null
  if (cookie) {
    res.cookies.set(SITE_VISITOR_COOKIE, cookie, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SITE_VISITOR_MAX_AGE_S,
    })
  }
  return res
}
