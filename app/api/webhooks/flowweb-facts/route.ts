// FlowWeb facts sheet (LIVE-2259). FlowWeb's daemon GETs this once a day, signed with FLOWWEB_OUTCOMES_SECRET
// as hex HMAC-SHA256 of `${x-flowweb-timestamp}.` (the body is empty for a GET; the flowweb-claim scheme).
// It answers the beta end, launch day, plan prices and launcher minutes, the only numbers and dates a
// FlowWeb draft may quote. Until the secret is set every request is refused (401). FAIL-LOUD: a failed
// pricing read answers 500, so FlowWeb keeps its last good sheet instead of storing code defaults.
// Logic: lib/flowweb/facts.ts.

import { NextResponse } from 'next/server'
import { envStringOrNull } from '@/lib/env/string'
import { verifySignature } from '@/lib/flowweb/claim'
import { buildFacts } from '@/lib/flowweb/facts'
import { getPricingValues } from '@/lib/pricing/settings'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const secret = envStringOrNull('FLOWWEB_OUTCOMES_SECRET') ?? ''
  const ts = req.headers.get('x-flowweb-timestamp') ?? ''
  const sig = req.headers.get('x-flowweb-signature') ?? ''
  if (!verifySignature(secret, ts, '', sig)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const facts = buildFacts(await getPricingValues(), new Date())
    log.info('flowweb.facts', { prices: Object.keys(facts.prices).length })
    return NextResponse.json(facts)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    log.error('flowweb.facts_failed', { error: message })
    return NextResponse.json({ error: 'the facts could not be read' }, { status: 500 })
  }
}
