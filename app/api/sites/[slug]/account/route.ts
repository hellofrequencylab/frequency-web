// THE READER'S OWN ACCOUNT, FOR A SPACE WEBSITE'S HEADER. A Space website is cached and anonymous, so its
// header asks here, with the reader's Frequency session, whether someone is signed in and who (name, handle,
// photo) for the profile menu (components/sites/network-header-tools.tsx). Answered like the membership route
// beside it: only to the Space's own website hosts, the one Origin echoed back with credentials, private and
// never cached. The browser only sends the session from a same-site page, so a custom domain reads "signed
// out" by construction and the header keeps offering Log in and Sign up.
//
//   GET /api/sites/<slug>/account   →  { account: { name, handle, avatarUrl } | null }

import { NextResponse } from 'next/server'
import { getMyProfileId } from '@/lib/auth'
import { getSiteSpace } from '@/lib/sites/site-cache'
import { boundSiteDomain } from '@/lib/sites/site-domain'
import { siteSubdomainHost } from '@/lib/sites/host'
import { siteMemberOrigin } from '@/lib/sites/site-member'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const space = await getSiteSpace(slug)
  const headers: Record<string, string> = { 'Cache-Control': 'private, no-store', Vary: 'Origin, Cookie' }
  if (!space) return NextResponse.json({ account: null }, { status: 404, headers })
  const allowed = siteMemberOrigin(request.headers.get('origin'), [siteSubdomainHost(space.slug), await boundSiteDomain(space)])
  if (allowed) {
    headers['Access-Control-Allow-Origin'] = allowed
    headers['Access-Control-Allow-Credentials'] = 'true'
  }
  // THE GATE: the reader's own session, or nothing. Only the caller's own public profile fields are read.
  const profileId = await getMyProfileId()
  if (!profileId) return NextResponse.json({ account: null }, { headers })
  const { data } = await createAdminClient().from('profiles').select('display_name, handle, avatar_url').eq('id', profileId).maybeSingle()
  const row = data as { display_name?: string | null; handle?: string | null; avatar_url?: string | null } | null
  if (!row) return NextResponse.json({ account: null }, { headers })
  return NextResponse.json({ account: { name: row.display_name?.trim() || row.handle || 'You', handle: row.handle ?? null, avatarUrl: row.avatar_url ?? null } }, { headers })
}
