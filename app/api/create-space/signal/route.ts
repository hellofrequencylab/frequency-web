// THE CREATE A SPACE SIGNAL SINK (LIVE-1970, ADR-1933). The signed-out builder posts its nine funnel events here
// (lib/create-space/signal.ts), and they land in the engagement ledger through track(), the one sink, with no actor:
// there is no account yet. /api/track drops an anonymous post by design (every row there is keyed to a member), so
// the builder has this door of its own, which accepts only the nine events with their closed props, keyed exactly
// once per tab and event, so nothing typed can be stored and nothing can be counted twice. Rate limited by IP;
// fail-open when the limiter is unconfigured, because a dropped signal costs a count, never a person. Always 204.

import { NextRequest, NextResponse } from 'next/server'
import { track } from '@/lib/analytics/track'
import { parseSignalBody, signalKey } from '@/lib/create-space/signal'
import { rateLimitOk } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const MAX_BODY = 2_000
const ok = () => new NextResponse(null, { status: 204 })

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!(await rateLimitOk('create-space-signal', ip, 240, '10m', { whenUnconfigured: 'allow' }))) return ok()
  const text = await req.text().catch(() => '')
  if (!text || text.length > MAX_BODY) return ok()
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return ok() }
  const body = parseSignalBody(raw)
  if (!body) return ok()
  await track(body.event, body.props, null, { idempotencyKey: signalKey(body.v, body.event, body.props) })
  return ok()
}
