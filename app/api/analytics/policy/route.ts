import { NextResponse } from 'next/server'
import { currentViewerAllowsAnalytics } from '@/lib/analytics/audience'

export const dynamic = 'force-dynamic'

/** No identity or categories leave this endpoint; account decisions must never enter a shared cache. */
export async function GET() {
  let allowed = false
  try { allowed = await currentViewerAllowsAnalytics() === true } catch { /* unknown policy is denied */ }
  return NextResponse.json({ allowed }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' },
  })
}
