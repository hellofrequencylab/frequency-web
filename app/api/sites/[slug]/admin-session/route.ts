// IS THE READER THIS WEBSITE'S ADMIN? ON FREQUENCY'S OWN HOST (SCAN-970). A website previewed at
// /sites/<slug> on Frequency asks here, with the reader's own session, before it shows its admin links
// (components/sites/site-admin-gate.tsx). The answer is whether the reader may edit this Space (owner, an
// active editor-or-above member, or platform staff: getSpaceCapabilities). Same origin only, never cached.
//
//   GET /api/sites/<slug>/admin-session   →  { admin: boolean }

import { NextResponse } from 'next/server'
import { getMyProfileId } from '@/lib/auth'
import { getSiteSpace } from '@/lib/sites/site-cache'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const headers = { 'Cache-Control': 'private, no-store' }
  const profileId = await getMyProfileId()
  if (!profileId) return NextResponse.json({ admin: false }, { headers })
  const space = await getSiteSpace(slug)
  const admin = !!space && (await getSpaceCapabilities(space, profileId)).canEditProfile
  return NextResponse.json({ admin }, { headers })
}
