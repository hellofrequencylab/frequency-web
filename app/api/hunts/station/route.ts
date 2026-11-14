// The merchant redemption station (FH-022): staff look up a player's reward token, hand the reward over
// once, or void it. A POST on purpose: looking never redeems. Dark by default: HUNTS_REWARDS_ENABLED
// (which needs claims and HUNTS_ENABLED) answers 404 until the owner turns it on. Every refusal for a
// caller who is not staff of the Hunt is the same plain "not found", never a reason that says whether a
// grant exists.
//
//   POST /api/hunts/station
//   { action: 'preview' | 'redeem' | 'void', token, idempotencyKey?, reason? }

import { getCallerProfile } from '@/lib/auth'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { signingSecret } from '@/lib/signing-secret'
import { mayRedeem, readRedeemToken, redeemGrant, redeemMessage, stationView, voidGrant } from '@/lib/hunts/redemption'
import { loadGrant, loadStationFacts } from '@/lib/hunts/redemption-store'
import { huntRpc } from '@/lib/hunts/staff-store'

export const dynamic = 'force-dynamic'

const badRequest = () => Response.json({ ok: false, reason: 'bad_request' }, { status: 400 })
const notFound = () => Response.json({ ok: false, reason: 'not_found' }, { status: 404 })

export async function POST(request: Request) {
  if (!huntSwitchOn('rewards')) return new Response('Not found.', { status: 404 })
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
  const { action, token, idempotencyKey, reason } = body
  if (action !== 'preview' && action !== 'redeem' && action !== 'void') return badRequest()
  if (typeof token !== 'string' || !token || token.length > 2000) return badRequest()
  if (action !== 'preview' && (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 200)) return badRequest()
  if (action === 'void' && (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 280)) return badRequest()

  const nowEpoch = Math.floor(Date.now() / 1000)
  const read = readRedeemToken(signingSecret('hunt-reward-token', ['HUNTS_PROOF_SECRET']), token, nowEpoch)
  if (!read.ok) return Response.json({ ok: false, reason: read.reason === 'expired' ? 'expired' : 'not_found' }, { status: read.reason === 'expired' ? 409 : 404 })

  const grant = await loadGrant(read.grantId)
  if (!grant) return notFound()
  const facts = await loadStationFacts(caller.id, grant.hunt_id)
  if (!facts || !mayRedeem(facts, grant.hunt_id, nowEpoch)) return notFound()

  if (action === 'preview') return Response.json({ ok: true, view: stationView(grant, nowEpoch) })

  if (action === 'redeem') {
    const out = await redeemGrant(huntRpc(), { staffId: caller.id, grantId: grant.id, venueSpaceId: facts.venueSpaceId, idempotencyKey: idempotencyKey as string })
    return Response.json({ ok: out.result === 'redeemed', result: out.result, message: redeemMessage(out.result), replayed: out.replayed }, { status: out.result === 'redeemed' ? 200 : 409 })
  }

  const out = await voidGrant(huntRpc(), { actorId: caller.id, grantId: grant.id, reason: reason as string, idempotencyKey: idempotencyKey as string })
  return Response.json({ ok: out.result === 'voided', result: out.result, message: redeemMessage(out.result), replayed: out.replayed }, { status: out.result === 'voided' ? 200 : 409 })
}
