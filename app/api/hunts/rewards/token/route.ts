// A player asks for the one-use token to show at a station (FH-022). POST, own grant only, and only
// while the grant can still be handed over. The same plain "not found" for a grant that is not theirs,
// so a grant id never says whether it exists. Dark behind HUNTS_REWARDS_ENABLED.
//
//   POST /api/hunts/rewards/token   { grantId }   ->   { ok: true, token, expiresAtEpoch }

import { getCallerProfile } from '@/lib/auth'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { signingSecret } from '@/lib/signing-secret'
import { issueRedeemToken } from '@/lib/hunts/redemption'
import { loadOwnGrant } from '@/lib/hunts/redemption-store'

export const dynamic = 'force-dynamic'

const badRequest = () => Response.json({ ok: false, reason: 'bad_request' }, { status: 400 })

export async function POST(request: Request) {
  if (!huntSwitchOn('rewards')) return new Response('Not found.', { status: 404 })
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ ok: false, reason: 'forbidden' }, { status: 403 })
  }
  const caller = await getCallerProfile()
  if (!caller) return Response.json({ ok: false, reason: 'signed_out' }, { status: 401 })

  let grantId: unknown
  try {
    const parsed: unknown = await request.json()
    grantId = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).grantId : undefined
  } catch {
    return badRequest()
  }
  if (typeof grantId !== 'string' || grantId.length < 8 || grantId.length > 80) return badRequest()

  const nowEpoch = Math.floor(Date.now() / 1000)
  const grant = await loadOwnGrant(caller.id, grantId)
  if (!grant) return Response.json({ ok: false, reason: 'not_found' }, { status: 404 })
  const lapsed = grant.expires_at !== null && Date.parse(grant.expires_at) <= nowEpoch * 1000
  if (grant.state !== 'granted' || lapsed) return Response.json({ ok: false, reason: grant.state === 'granted' ? 'expired' : grant.state }, { status: 409 })

  const { token, expiresAtEpoch } = issueRedeemToken({ secret: signingSecret('hunt-reward-token', ['HUNTS_PROOF_SECRET']), grantId: grant.id, now: nowEpoch })
  return Response.json({ ok: true, token, expiresAtEpoch })
}
