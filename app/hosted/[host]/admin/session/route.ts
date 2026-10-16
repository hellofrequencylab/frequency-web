import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { resolveHostedSpace } from '@/lib/sites/hosted'
import { normalizeHost } from '@/lib/sites/host'
import { SITE_ADMIN_COOKIE } from '@/lib/sites/site-admin-pass'
import { siteAdminAllowed } from '@/lib/sites/site-admin'

// IS THE READER THIS WEBSITE'S ADMIN? (SCAN-970). `/admin/session` on the website's own host, rewritten here by
// the proxy. The cached site pages ask it after they load (components/sites/site-admin-gate.tsx) and show
// their admin links only on `{ admin: true }`. The answer is the same gate the admin pages use
// (siteAdminAllowed): a valid pass for THIS host and Space, held by someone who still runs it. Never cached.
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host: hostParam } = await params
  const host = normalizeHost(decodeURIComponent(hostParam))
  const headers = { 'Cache-Control': 'private, no-store' }
  const token = (await cookies()).get(SITE_ADMIN_COOKIE)?.value
  if (!token) return NextResponse.json({ admin: false }, { headers })
  const space = await resolveHostedSpace(host)
  const admin = !!space && (await siteAdminAllowed(token, host, space))
  return NextResponse.json({ admin }, { headers })
}
