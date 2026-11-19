// FlowWeb lead hunts: the claim-link builder (LIVE-2251). FlowWeb's sender POSTs one build item here
// before it mails the organizer from the founder's own mailbox, signed with FLOWWEB_CLAIM_SECRET as hex
// HMAC-SHA256 of `${x-flowweb-timestamp}.${body}` in x-flowweb-signature. Frequency never sends these
// messages. Until the secret is set every request is refused (401); until FLOWWEB_CLAIM_ENABLED is on a
// verified request answers { status: 'off' } and nothing is built. Gates: lib/flowweb/claim.ts.

import { NextResponse } from 'next/server'
import { envStringOrNull } from '@/lib/env/string'
import { buildClaim, parseItem, verifySignature } from '@/lib/flowweb/claim'
import { realClaimDeps } from '@/lib/flowweb/claim-io'
import { log } from '@/lib/log'
import { readCappedText } from '@/lib/net/capped-body'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** One claim item is a few hundred bytes of JSON. The body is read before the signature can be
 *  checked, so anything past this is refused unread rather than buffered (SEC-030). */
const MAX_CLAIM_BODY_BYTES = 64 * 1024

export async function POST(req: Request) {
  const secret = envStringOrNull('FLOWWEB_CLAIM_SECRET') ?? ''
  const body = await readCappedText(req, MAX_CLAIM_BODY_BYTES)
  if (body === null) return NextResponse.json({ error: 'payload too large' }, { status: 413 })
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
    const out = await buildClaim(item, realClaimDeps)
    log.info('flowweb.claim', { id: item.id, status: out.status })
    return NextResponse.json(out, { status: out.status === 'refused' ? 422 : 200 })
  } catch (err) {
    log.error('flowweb.claim_failed', { id: item.id, error: (err as Error)?.message ?? String(err) })
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}
