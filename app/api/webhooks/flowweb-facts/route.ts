// FlowWeb facts sheet (LIVE-2259). FlowWeb's daemon GETs this once a day, signed with its own secret (FLOWWEB_FACTS_SECRET, else the shared one, lib/flowweb/secret.ts)
// as hex HMAC-SHA256 of `${x-flowweb-timestamp}.` (the body is empty for a GET; the flowweb-claim scheme).
// It answers the beta end, launch day, plan prices and launcher minutes, the only numbers and dates a
// FlowWeb draft may quote. Until the secret is set every request is refused (401). FAIL-LOUD: a failed
// pricing read answers 500, so FlowWeb keeps its last good sheet instead of storing code defaults.
// Logic: lib/flowweb/facts.ts.

import { NextResponse } from 'next/server'
import { verifySignature } from '@/lib/flowweb/claim'
import { clientIp, rateLimitOk, tooMany } from '@/lib/rate-limit'
import { flowwebSecret } from '@/lib/flowweb/secret'
import { buildFacts } from '@/lib/flowweb/facts'
import { getPricingValues } from '@/lib/pricing/settings'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  // Throttled per address before any work (SCAN-1239): the sender is one Mac, so this only ever refuses a
  // stranger. 'allow' when KV is unset: the signature below is the gate, this only bounds the noise.
  if (!(await rateLimitOk('flowweb-facts', clientIp(req), 120, '1 m', { whenUnconfigured: 'allow' }))) return tooMany()
  const secret = flowwebSecret('facts')
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
