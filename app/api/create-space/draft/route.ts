import { parseHandoff } from '@/lib/create-space/handoff'
import { saveDraft } from '@/lib/create-space/draft-io'
import { isLeadToken, isZone } from '@/lib/create-space/lead'
import { clientIp, rateLimitOk } from '@/lib/rate-limit'

// THE LAST SAVE OF A CREATE A SPACE DRAFT, sent by sendBeacon on pagehide (ADR-1933, LIVE-1967). The same write the
// saveDraftLead action makes, for the moment a tab closes with changes the debounced save had not sent yet. Always 204
// with no body: a beacon reads nothing back, and the response must say nothing about any address.
//
// Body: JSON {draft, token, tz, own, website}, the same fields as the action. A body over 10KB, one that does not
// parse, a draft without an address or a filled honeypot all end in the same 204 and no write.
export const dynamic = 'force-dynamic'

const NO_CONTENT = () => new Response(null, { status: 204 })
const MAX_BODY = 10_000

export async function POST(req: Request) {
  if (!(await rateLimitOk('create-space-draft', clientIp(req), 30, '10 m', { whenUnconfigured: 'allow' }))) return NO_CONTENT()
  let body: Record<string, unknown>
  try {
    const text = await req.text()
    if (text.length > MAX_BODY) return NO_CONTENT()
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') return NO_CONTENT()
    body = parsed as Record<string, unknown>
  } catch {
    return NO_CONTENT()
  }
  if (typeof body.website === 'string' && body.website.length > 0) return NO_CONTENT()
  const draft = parseHandoff(typeof body.draft === 'string' ? body.draft : null)
  if (!draft || !draft.email.trim()) return NO_CONTENT()
  if (!(await rateLimitOk('create-space-draft-mail', draft.email.trim().toLowerCase(), 20, '1 h', { whenUnconfigured: 'allow' }))) return NO_CONTENT()
  await saveDraft({
    draft,
    token: isLeadToken(body.token) ? body.token : null,
    tz: isZone(body.tz) ? body.tz : null,
    ownPhoto: body.own === 1 || body.own === '1',
  }).catch(() => null)
  return NO_CONTENT()
}
