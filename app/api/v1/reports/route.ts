import { reportInput } from '@/lib/contract'
import { asCaller, authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { reportContent } from '@/app/(main)/feed/report-actions'
import { isError } from '@/lib/action-result'

// POST /api/v1/reports (LIVE-723, App Store 1.2): report a post, comment, event, member, dispatch
// or guestbook note from the app. Runs the web's reportContent as the caller, so the target check,
// the duplicate guard and the moderation queue are the same ones the report dialog feeds.

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const limited = await rateLimited(request, 'reports', { limit: 20, window: '10 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const { targetType, targetId, reason, details } = readInput(reportInput, await request.json().catch(() => null))
    const res = await asCaller(auth, () => reportContent(targetType, targetId, reason, details))
    if (isError(res)) {
      if (/already reported/i.test(res.error)) return fail('conflict', res.error)
      if (/invalid report target/i.test(res.error)) return fail('not_found', 'That could not be found.')
      return fail('internal', res.error)
    }
    return ok({ reported: true as const })
  } catch (e) {
    return failFrom(e)
  }
}
