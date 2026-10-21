import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { normalizeHost } from '@/lib/sites/host'
import { SITE_VISITOR_COOKIE, readVisitorCookie } from '@/lib/sites/site-visitor'

// WHO IS READING THIS WEBSITE (LIVE-1207). `/_s/me` on the website's own host, asked by the header's profile
// menu from the browser. Answers the display cookie's name, handle and photo, or null. Same-origin only: no
// CORS grant, so no other page can read it. Private, never cached, and the cached page render never touches
// the cookie, which is why the header asks instead of the page knowing.
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host: hostParam } = await params
  const host = normalizeHost(decodeURIComponent(hostParam))
  const store = await cookies()
  const visitor = readVisitorCookie(store.get(SITE_VISITOR_COOKIE)?.value, host)
  return NextResponse.json(
    { account: visitor ? { name: visitor.name, handle: visitor.handle, avatarUrl: visitor.avatarUrl } : null },
    { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } },
  )
}
