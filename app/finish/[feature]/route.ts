// /finish/<feature> (LIVE-2481): where a feature builder's sign-in lands. It saves the hold (the draft the visitor
// built before they had an account) into the real feature under their own session, drops the hold, and sends them
// back to the builder page, which shows what they made and what they could build next. A visit with no session goes
// to sign-in and comes back here; a visit with no hold just opens the builder.

import { NextResponse, type NextRequest } from 'next/server'
import { getMyProfileId } from '@/lib/auth'
import { feature as featureEntry, finishHref, isFeatureId } from '@/lib/feature-builder/catalog'
import { applyFeature } from '@/lib/feature-builder/apply'
import { clearFeatureHold, readFeatureHold } from '@/lib/feature-builder/hold'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ feature: string }> }) {
  const profileId = await getMyProfileId()
  const { feature } = await params
  if (!isFeatureId(feature)) return NextResponse.redirect(new URL('/', request.url))
  if (!profileId) return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(finishHref(feature))}`, request.url))
  const page = featureEntry(feature).href
  const hold = await readFeatureHold()
  if (!hold || hold.feature !== feature) return NextResponse.redirect(new URL(page, request.url))
  const result = await applyFeature(profileId, feature, hold.draft)
  if (!result.ok) return NextResponse.redirect(new URL(`${page}?e=save`, request.url))
  await clearFeatureHold()
  return NextResponse.redirect(new URL(`${page}?done=1`, request.url))
}
