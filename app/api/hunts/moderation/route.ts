// Pause, resume or close a Trail (FH-018S): the emergency switch. Dark by default: HUNTS_AUTHORING_ENABLED
// (which needs HUNTS_ENABLED) answers 404 until the owner turns it on. Who may is decided on the server
// for each call from the Hunt's roles and owner Space (lib/hunts/moderation-actions.ts, decide), never by
// being on the page; a caller who may not gets the same plain "not found" as for a Trail that is not there.
//
//   POST /api/hunts/moderation
//   { huntId, action: 'pause' | 'resume' | 'close', note?, idempotencyKey }

import { getCallerProfile } from '@/lib/auth'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { isModerationAction, mayModerate, moderateHunt, moderationMessage } from '@/lib/hunts/moderation-actions'
import { loadModerationFacts } from '@/lib/hunts/moderation-store'
import { huntRpc } from '@/lib/hunts/staff-store'

export const dynamic = 'force-dynamic'

const badRequest = () => Response.json({ ok: false, reason: 'bad_request' }, { status: 400 })
const notFound = () => Response.json({ ok: false, reason: 'not_found' }, { status: 404 })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  if (!huntSwitchOn('authoring')) return new Response('Not found.', { status: 404 })
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
  const { huntId, action, note, idempotencyKey } = body
  if (typeof huntId !== 'string' || !UUID.test(huntId)) return badRequest()
  if (!isModerationAction(action)) return badRequest()
  if (note !== undefined && (typeof note !== 'string' || note.length > 280)) return badRequest()
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 200) return badRequest()

  const facts = await loadModerationFacts(caller.id, huntId)
  if (!facts || !mayModerate(facts, action, huntId, Math.floor(Date.now() / 1000))) return notFound()

  const out = await moderateHunt(huntRpc(), { actorId: caller.id, huntId, action, note: note ?? '', idempotencyKey })
  const ok = out.result === 'moderated'
  return Response.json({ ok, result: out.result, message: moderationMessage(out.result, action), replayed: out.replayed }, { status: ok ? 200 : 409 })
}
