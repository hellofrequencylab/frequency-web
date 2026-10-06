import { authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited } from '@/lib/contract/respond'
import { toPracticeView } from '@/lib/contract/views'
import { getMemberAdoptions, getPracticesToLogToday } from '@/lib/practices'

// GET /api/v1/practices?timezone= (LIVE-716): the caller's active practices, newest first, each
// with whether today is already logged. "Today" is the member's own day (home zone first, then
// the device zone), the same day the log keys on.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'practices')
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const tz = new URL(request.url).searchParams.get('timezone')?.slice(0, 64) || null
    const [adoptions, toLog] = await Promise.all([
      getMemberAdoptions(auth.caller.id),
      getPracticesToLogToday(auth.caller.id, tz),
    ])
    const open = new Set(toLog.map((p) => p.id))
    return ok({
      items: adoptions.map((a) => ({
        ...toPracticeView(a.practice),
        loggedToday: !open.has(a.practice.id),
        source: a.source,
        cue: a.cue,
      })),
      nextCursor: null,
    })
  } catch (e) {
    return failFrom(e)
  }
}
