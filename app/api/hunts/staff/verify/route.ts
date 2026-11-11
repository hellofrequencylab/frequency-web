// The Hunt staff door (FH-020S): a venue's staff post the one-time code a player shows, and a good
// proof credits that player's mission at assurance `staff`. It is a POST on purpose: a scan or a GET
// never credits (docs/hunts/README.md). Dark by default: HUNTS_CLAIMS_ENABLED (which needs
// HUNTS_ENABLED) answers 404 until the owner turns it on. Every refusal is a plain code, never a
// reason that says whether a Hunt, run or token exists to someone who is not staff there.
//
//   POST /api/hunts/staff/verify
//   { token }. Older callers can also send scope fields and missionKey, which must match.

import { getCallerProfile } from '@/lib/auth'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { signingSecret } from '@/lib/signing-secret'
import { readSignedStaffScope } from '@/lib/hunts/staff-proof'
import { verifyAtDoor } from '@/lib/hunts/staff-review'
import { huntRpc, loadStaffFacts } from '@/lib/hunts/staff-store'

export const dynamic = 'force-dynamic'

const badRequest = () => Response.json({ ok: false, reason: 'bad_request' }, { status: 400 })
const notFound = () => Response.json({ ok: false, reason: 'not_found' }, { status: 404 })

export async function POST(request: Request) {
  if (!huntSwitchOn('claims')) return new Response('Not found.', { status: 404 })
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ ok: false, reason: 'forbidden' }, { status: 403 })
  }

  const caller = await getCallerProfile()
  if (!caller) return Response.json({ ok: false, reason: 'signed_out' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return badRequest()
    body = parsed as Record<string, unknown>
  } catch {
    return badRequest()
  }
  const { token } = body
  if (typeof token !== 'string' || !token || token.length > 2000) return badRequest()

  const secret = signingSecret('hunt-staff-proof', ['HUNTS_PROOF_SECRET'])
  const scope = readSignedStaffScope(secret, token)
  if (!scope || Object.entries(scope).some(([key, value]) => body[key] !== undefined && body[key] !== value)) return notFound()

  const facts = await loadStaffFacts(caller.id, scope)
  if (!facts || (body.missionKey !== undefined && body.missionKey !== facts.missionKey)) return notFound()

  const out = await verifyAtDoor(
    { secret, rpc: huntRpc(), loadFacts: async () => facts },
    { staffId: caller.id, token, scope, missionKey: facts.missionKey, nowEpoch: Math.floor(Date.now() / 1000) },
  )
  if (out.ok) return Response.json({ ok: true, replayed: out.replayed })
  if (out.reason === 'forbidden' || out.reason === 'not_found') return notFound()
  return Response.json({ ok: false, reason: out.reason }, { status: 409 })
}
