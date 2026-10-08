import { NextResponse } from 'next/server'
import { resolveHostedSpace } from '@/lib/sites/hosted'
import { normalizeHost } from '@/lib/sites/host'
import {
  SITE_ADMIN_COOKIE,
  SITE_ADMIN_PASS_MAX_AGE_S,
  passOpensSite,
  readSiteAdminPass,
  siteAdminView,
} from '@/lib/sites/site-admin-pass'

// THE WEBSITE ADMIN HANDOFF, SITE SIDE (LIVE-864). `/admin/enter?pass=…&to=overview` on the website's own
// host, rewritten here by the proxy. The Frequency console minted the pass for a Space manager
// (app/(main)/spaces/[slug]/manage/leadership/open); this keeps it in a host-only cookie and lands on the
// page asked for, so the pass leaves the address bar at once. A pass for another site or Space, or a bad
// one, sets nothing and lands on the same page, which sends the person to sign in.
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host: hostParam } = await params
  const host = normalizeHost(decodeURIComponent(hostParam))
  const url = new URL(req.url)
  const view = siteAdminView(url.searchParams.get('to')) ?? 'overview'
  const res = NextResponse.redirect(new URL(`/admin/${view}`, `https://${host}`), 303)
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('Referrer-Policy', 'no-referrer')
  const token = url.searchParams.get('pass')
  const space = token ? await resolveHostedSpace(host) : null
  const pass = readSiteAdminPass(token)
  if (space && passOpensSite(pass, host, space.id)) {
    res.cookies.set(SITE_ADMIN_COOKIE, token!, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SITE_ADMIN_PASS_MAX_AGE_S,
    })
  }
  return res
}
