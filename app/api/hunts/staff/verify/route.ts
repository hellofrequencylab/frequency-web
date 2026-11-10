// The Hunt staff door (FH-020S): a venue's staff post the one-time code a player shows, and a good
// proof credits that player's mission at assurance `staff`. It is a POST on purpose: a scan or a GET
// never credits (docs/hunts/README.md). Dark by default: HUNTS_CLAIMS_ENABLED (which needs
// HUNTS_ENABLED) answers 404 until the owner turns it on. Every refusal is a plain code, never a
// reason that says whether a Hunt, run or token exists to someone who is not staff there.
//
//   POST /api/hunts/staff/verify
//   { token, huntId, placementId, venueSpaceId, runId, missionKey }

import { getCallerProfile } from '@/lib/auth'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { signingSecret } from '@/lib/signing-secret'
import { verifyAtDoor } from '@/lib/hunts/staff-review'
import { huntRpc, loadStaffFacts } from '@/lib/hunts/staff-store'

export const dynamic = 'force-dynamic'

const str = (v: unknown, max = 600): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null)

export async function POST(request: Request) {
  if (!huntSwitchOn('claims')) return new Response('Not found.', { status: 404 })

  const caller = await getCallerProfile()
  if (!caller) return Response.json({ ok: false, reason: 'signed_out' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ ok: false, reason: 'bad_request' }, { status: 400 })
  }
  const token = str(body.token, 2000)
  const huntId = str(body.huntId, 64)
  const placementId = str(body.placementId, 64)
  const venueSpaceId = str(body.venueSpaceId, 64)
  const runId = str(body.runId, 64)
  const missionKey = str(body.missionKey, 40)
  if (!token || !huntId || !placementId || !venueSpaceId || !runId || !missionKey) {
    return Response.json({ ok: false, reason: 'bad_request' }, { status: 400 })
  }

  const scope = { huntId, placementId, venueSpaceId, runId }
  const out = await verifyAtDoor(
    { secret: signingSecret('hunt-staff-proof', ['HUNTS_PROOF_SECRET']), rpc: huntRpc(), loadFacts: () => loadStaffFacts(caller.id, scope) },
    { staffId: caller.id, token, scope, missionKey, nowEpoch: Math.floor(Date.now() / 1000) },
  )
  if (out.ok) return Response.json({ ok: true, replayed: out.replayed })
  const status = out.reason === 'forbidden' || out.reason === 'not_found' ? 404 : 409
  return Response.json({ ok: false, reason: status === 404 ? 'not_found' : out.reason }, { status })
}
