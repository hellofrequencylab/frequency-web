import { authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited } from '@/lib/contract/respond'
import { toPracticeView } from '@/lib/contract/views'
import { getPublicPractice } from '@/lib/practices'

// GET /api/v1/practices/{id or slug} (LIVE-716): one public practice, the same read as its page.

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimited(request, 'practice')
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const ref = (await params).id
    if (!/^[A-Za-z0-9-]{1,200}$/.test(ref)) return fail('invalid_input', 'That is not a practice id or slug.')
    const practice = await getPublicPractice(ref)
    if (!practice) return fail('not_found', 'That practice could not be found.')
    return ok(toPracticeView(practice))
  } catch (e) {
    return failFrom(e)
  }
}
