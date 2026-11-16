// A player asks for a reward on their own run (FH-031S): the first route that grants one. POST, own
// run only, dark behind HUNTS_REWARDS_ENABLED. Every grant goes through lib/hunts/finale-store.ts
// `grantRunReward`, so a completion reward on a Trail that ends at an Event is refused for a player the
// Event does not admit, before the database is called. Finishing a Trail never stands in for a seat.
//
//   POST /api/hunts/rewards/grant   { runId, rewardKey }   ->   { ok, result, message }

import { getCallerProfile } from '@/lib/auth'
import { grantRunReward } from '@/lib/hunts/finale-store'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { finaleRefusalMessage } from '@/lib/hunts/rally-finale'
import { grantMessage } from '@/lib/hunts/rewards'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KEY = /^[a-z0-9_-]{1,40}$/

const badRequest = () => Response.json({ ok: false, reason: 'bad_request' }, { status: 400 })

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
    body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return badRequest()
  }
  const { runId, rewardKey } = body
  if (typeof runId !== 'string' || !UUID.test(runId) || typeof rewardKey !== 'string' || !KEY.test(rewardKey)) return badRequest()

  let out: Awaited<ReturnType<typeof grantRunReward>>
  try {
    out = await grantRunReward({ profileId: caller.id, runId, rewardKey })
  } catch {
    return Response.json({ ok: false, reason: 'unavailable' }, { status: 503 })
  }
  // A run that is not the caller's and a reward that does not exist read the same: not found.
  if (out.result === 'run_not_found' || out.result === 'reward_not_found') return Response.json({ ok: false, reason: 'not_found' }, { status: 404 })
  const message = 'reason' in out ? finaleRefusalMessage(out.reason) : grantMessage(out)
  return Response.json({ ok: out.result === 'granted' || out.result === 'already_granted', result: out.result, message })
}
