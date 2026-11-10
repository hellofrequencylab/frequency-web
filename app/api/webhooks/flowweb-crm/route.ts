// FlowWeb leads in the CRM (LIVE-2256). FlowWeb's daemon POSTs one draft's whole state here after the
// founder marks it (sent, they replied, they said no) and once a day, signed with FLOWWEB_OUTCOMES_SECRET
// as hex HMAC-SHA256 of `${x-flowweb-timestamp}.${body}` in x-flowweb-signature (the flowweb-claim
// scheme). Frequency keeps the lead as a root-Space contact with one CRM conversation that holds every
// draft, send, reply and outcome, and answers where the lead is. Frequency never sends any of it.
// Until the secret is set every request is refused (401); until FLOWWEB_CRM_ENABLED is on a verified
// request answers { status: 'off' } and nothing is written. Logic: lib/flowweb/crm.ts and crm-io.ts.

import { NextResponse } from 'next/server'
import { envFlag, envStringOrNull } from '@/lib/env/string'
import { verifySignature } from '@/lib/flowweb/claim'
import { parseCrmItem } from '@/lib/flowweb/crm'
import { syncFlowwebLead } from '@/lib/flowweb/crm-io'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const secret = envStringOrNull('FLOWWEB_OUTCOMES_SECRET') ?? ''
  const body = await req.text()
  const ts = req.headers.get('x-flowweb-timestamp') ?? ''
  const sig = req.headers.get('x-flowweb-signature') ?? ''
  if (!verifySignature(secret, ts, body, sig)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!envFlag('FLOWWEB_CRM_ENABLED')) return NextResponse.json({ status: 'off' })
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return NextResponse.json({ status: 'refused', reason: 'the body is not JSON' }, { status: 400 })
  }
  const item = parseCrmItem(raw)
  if ('error' in item) return NextResponse.json({ status: 'refused', reason: item.error }, { status: 400 })
  const ownerId = envStringOrNull('FLOWWEB_CRM_OWNER_PROFILE_ID') ?? envStringOrNull('CRM_INBOX_OWNER_PROFILE_ID')
  if (!ownerId) return NextResponse.json({ status: 'no_owner', reason: 'FLOWWEB_CRM_OWNER_PROFILE_ID is not set' }, { status: 409 })
  const rootId = await loadRootSpaceId()
  if (!rootId) return NextResponse.json({ status: 'error', reason: 'the root Space is not set' }, { status: 500 })
  try {
    const out = await syncFlowwebLead(item, { rootId, ownerId })
    log.info('flowweb.crm', { tag: item.tag, lead_status: out.leadStatus, added: out.added })
    const site = new URL(req.url).origin
    return NextResponse.json({
      status: out.status,
      contact_id: out.contactId,
      conversation_id: out.conversationId,
      conversation_url: `${site}/admin/crm/conversations?id=${out.conversationId}`,
      lead_status: out.leadStatus,
      signed_up: out.signedUp,
      added: out.added,
    })
  } catch (err) {
    log.error('flowweb.crm_failed', { tag: item.tag, error: (err as Error)?.message ?? String(err) })
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}
