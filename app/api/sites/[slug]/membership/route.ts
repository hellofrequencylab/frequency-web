// THE READER'S MEMBERSHIP IN ONE SPACE, FOR ITS WEBSITE HEADER (LIVE-699). A Space website is cached and
// anonymous on its own host, so its header asks here, with the reader's Frequency session, whether the
// reader is a member of THIS Space (components/sites/site-member-badge.tsx). The answer is the tier name
// and its status, or null: nothing about any other Space, and nothing a signed-out reader could not get.
//
//   GET /api/sites/<slug>/membership   →  { membership: { tierName, status } | null, firstName: string | null }
//
// firstName is the reader's OWN first name (their display name's first word), for a site's account pill;
// null when signed out.
//
// Answered only to the Space's own website hosts (its free subdomain and its bound domain), with the
// one Origin echoed back and credentials allowed; any other Origin gets no CORS grant, so a page elsewhere
// cannot read it. The session is the reader's own cookie, which the browser only sends from a same-site
// page, so a custom domain reads "no membership" by construction. Private, never cached.

import { NextResponse } from 'next/server'
import { getCachedViewerProfile, getMyProfileId } from '@/lib/auth'
import { getSiteSpace } from '@/lib/sites/site-cache'
import { boundSiteDomain } from '@/lib/sites/site-domain'
import { siteSubdomainHost } from '@/lib/sites/host'
import { siteMemberOrigin } from '@/lib/sites/site-member'
import { getMyMembership } from '@/lib/spaces/memberships'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const space = await getSiteSpace(slug)
  if (!space) return NextResponse.json({ membership: null }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
  const allowed = siteMemberOrigin(request.headers.get('origin'), [siteSubdomainHost(space.slug), await boundSiteDomain(space)])
  const headers: Record<string, string> = { 'Cache-Control': 'private, no-store', Vary: 'Origin, Cookie' }
  if (allowed) {
    headers['Access-Control-Allow-Origin'] = allowed
    headers['Access-Control-Allow-Credentials'] = 'true'
  }
  // THE GATE: the reader's own session, or nothing. A signed-out call answers null before any membership
  // read; a signed-in one only ever reads the caller's own row in this Space (getMyMembership).
  const profileId = await getMyProfileId()
  if (!profileId) return NextResponse.json({ membership: null, firstName: null }, { headers })
  const mine = await getMyMembership(space.id)
  const viewer = await getCachedViewerProfile()
  const firstName = viewer?.display_name?.trim().split(/\s+/)[0]?.slice(0, 40) || null
  return NextResponse.json({ membership: mine ? { tierName: mine.tierName, status: mine.status } : null, firstName }, { headers })
}
