import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { appOrigin, normalizeHost } from '@/lib/sites/host'
import { SITE_VISITOR_COOKIE, readVisitorCookie, signVisitorExit } from '@/lib/sites/site-visitor'

// THE WEBSITE SIGN OUT, SITE SIDE (LIVE-1207, lib/sites/site-visitor.ts). The profile menu's Sign out POSTs
// here (`/_s/exit`). The display cookie is cleared at once. If it was a real one, the person is sent on to
// Frequency with a 60-second exit token for this host so Frequency's own session ends too, and Frequency
// returns them to the site. POST only, and the cookie is SameSite=Lax, so another site cannot make a
// visitor's browser sign them out: a cross-site POST carries no cookie and gets no exit token.
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host: hostParam } = await params
  const host = normalizeHost(decodeURIComponent(hostParam))
  const store = await cookies()
  const visitor = readVisitorCookie(store.get(SITE_VISITOR_COOKIE)?.value, host)
  const exit = visitor ? signVisitorExit(host) : null
  const to = exit ? `${appOrigin()}/auth/site-exit?h=${encodeURIComponent(host)}&t=${encodeURIComponent(exit)}` : `https://${host}/`
  const res = NextResponse.redirect(to, 303)
  res.cookies.set(SITE_VISITOR_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('Referrer-Policy', 'no-referrer')
  return res
}
