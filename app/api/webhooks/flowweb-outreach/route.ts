// FlowWeb lead-hunt outreach (LIVE-2251). FlowWeb's relay POSTs one finished message here, signed with
// FLOWWEB_OUTREACH_SECRET as hex HMAC-SHA256 of `${x-flowweb-timestamp}.${body}` in x-flowweb-signature.
// Until the secret is set every request is refused (401); until FLOWWEB_OUTREACH_ENABLED is on a verified
// request answers { status: 'off' } and nothing is sent. Gates and rules: lib/flowweb/outreach.ts.

import { NextResponse } from 'next/server'
import { envStringOrNull } from '@/lib/env/string'
import { parseItem, sendOutreach, verifySignature } from '@/lib/flowweb/outreach'
import { realOutreachDeps } from '@/lib/flowweb/outreach-io'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const secret = envStringOrNull('FLOWWEB_OUTREACH_SECRET') ?? ''
  const body = await req.text()
  const ts = req.headers.get('x-flowweb-timestamp') ?? ''
  const sig = req.headers.get('x-flowweb-signature') ?? ''
  if (!verifySignature(secret, ts, body, sig)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return NextResponse.json({ status: 'refused', reason: 'the body is not JSON' }, { status: 400 })
  }
  const item = parseItem(raw)
  if ('error' in item) return NextResponse.json({ status: 'refused', reason: item.error }, { status: 400 })
  try {
    const out = await sendOutreach(item, realOutreachDeps)
    log.info('flowweb.outreach', { id: item.id, status: out.status })
    return NextResponse.json(out, { status: out.status === 'refused' ? 422 : 200 })
  } catch (err) {
    log.error('flowweb.outreach_failed', { id: item.id, error: (err as Error)?.message ?? String(err) })
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}
