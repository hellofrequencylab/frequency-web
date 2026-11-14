// Report a Trail (FH-018S): a signed-in member tells the people running a Trail that it is unsafe or
// wrong. Dark by default: HUNTS_ENABLED answers 404 until the owner turns it on. One open report per
// person per Trail; a repeated tap with the same key replays the first answer. The reply says whether the
// report was taken, never who else reported.
//
//   POST /api/hunts/report
//   { slug, reason, details?, idempotencyKey }

import { getCallerProfile } from '@/lib/auth'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { fileHuntReport, moderationMessage } from '@/lib/hunts/moderation-actions'
import { visibleHuntIdBySlug } from '@/lib/hunts/moderation-store'
import { huntRpc } from '@/lib/hunts/staff-store'

export const dynamic = 'force-dynamic'

const badRequest = () => Response.json({ ok: false, reason: 'bad_request' }, { status: 400 })

export async function POST(request: Request) {
  if (!huntSwitchOn('enabled')) return new Response('Not found.', { status: 404 })
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
  const { slug, reason, details, idempotencyKey } = body
  if (typeof slug !== 'string' || !slug || slug.length > 80) return badRequest()
  if (typeof reason !== 'string' || !reason) return badRequest()
  if (details !== undefined && typeof details !== 'string') return badRequest()
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 200) return badRequest()

  const huntId = await visibleHuntIdBySlug(slug)
  if (!huntId) return Response.json({ ok: false, result: 'hunt_not_found', message: moderationMessage('hunt_not_found') }, { status: 404 })

  const out = await fileHuntReport(huntRpc(), { reporterId: caller.id, huntId, reason, details: details ?? '', idempotencyKey })
  const ok = out.result === 'reported' || out.result === 'already_reported'
  return Response.json({ ok, result: out.result, message: moderationMessage(out.result), replayed: out.replayed }, { status: ok ? 200 : out.result === 'hunt_not_found' ? 404 : 409 })
}
