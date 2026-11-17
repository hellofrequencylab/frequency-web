import { NextRequest, NextResponse } from 'next/server'
import { track } from '@/lib/analytics/track'
import { currentViewerAllowsAnalytics } from '@/lib/analytics/audience'
import { rateLimitOk } from '@/lib/rate-limit'
import { cleanBriefBatch } from '@/lib/how/brief-events'

// Engagement sink for the link-only partner pages, /how, /facilities and /lab (docs/HOW-BRIEF.md). The page's readers are mostly
// signed out, which the member-tied /api/track and /api/observe drop by design. This route accepts
// ONLY the closed how.* list (lib/how/brief-events.ts), writes anonymous rows to engagement_events
// through track() (actor null, no GA mirror), and applies the same request analytics policy as the
// rest of the site (consent cookies, region, Global Privacy Control, staff exclusion). No cookies
// are set; the session id is a random per-tab value. Always 204 so the beacon never retries.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return new NextResponse(null, { status: 400 }) }
  if (req.headers.get('sec-gpc') === '1') return new NextResponse(null, { status: 204 })
  const batch = cleanBriefBatch(body)
  if (!batch) return new NextResponse(null, { status: 204 })
  if (!(await currentViewerAllowsAnalytics())) return new NextResponse(null, { status: 204 })
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown'
  // A real reader produces well under this; a looping script hits the ceiling and is silently dropped.
  if (!(await rateLimitOk('how-brief', `${batch.sid}:${ip}`, 300, '10 m', { whenUnconfigured: 'allow' }))) {
    return new NextResponse(null, { status: 204 })
  }
  await Promise.all(batch.events.map((e) =>
    track(e.name, { ...e.props, sid: batch.sid, ref: batch.ref ?? '', page: batch.page, client_t: e.t }, null, { mirrorGa: false }),
  ))
  return new NextResponse(null, { status: 204 })
}
