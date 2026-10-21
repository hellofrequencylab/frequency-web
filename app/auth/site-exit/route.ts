import { NextResponse } from 'next/server'
import { signOutCurrentSession } from '@/lib/auth/sign-out'
import { normalizeHost } from '@/lib/sites/host'
import { readVisitorExit } from '@/lib/sites/site-visitor'

// A WEBSITE'S SIGN OUT, FREQUENCY SIDE (LIVE-1207, lib/sites/site-visitor.ts). The site cleared its own
// cookie and sent the person here with a 60-second EXIT token it signed for its own host. A browser sends
// Frequency's session on a top-level GET, which a cross-site POST would not, so this is a GET; the token is
// what keeps it from being a drive-by sign-out: only a site that held the person's own cookie can mint one.
// Without a good token nothing is signed out. The person lands back on the site either way, and the host
// comes from the signed token's own claim (it only verifies for the host named), never an open redirect.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const host = normalizeHost(url.searchParams.get('h'))
  const valid = /^[a-z0-9.-]{1,253}$/.test(host) && readVisitorExit(url.searchParams.get('t'), host)
  if (!valid) return NextResponse.redirect(new URL('/', url.origin), 303)
  await signOutCurrentSession()
  const res = NextResponse.redirect(`https://${host}/`, 303)
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('Referrer-Policy', 'no-referrer')
  return res
}
