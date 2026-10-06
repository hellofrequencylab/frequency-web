import { z } from 'zod'
import { practiceLogInput } from '@/lib/contract'
import { asCaller, authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import type { ActionResult } from '@/lib/action-result'
import { logPracticeAction, unlogPracticeAction } from '@/app/(main)/practices/actions'

// /api/v1/practices/{id}/log (LIVE-716): POST logs today's practice, DELETE undoes today's log.
// Both are the web's actions: a one-tap log only (a timed practice is refused, it logs from its
// session), the per-member rate window, exactly once per day, the zaps and the streak.

export const dynamic = 'force-dynamic'

async function handle(request: Request, params: Promise<{ id: string }>, log: boolean) {
  const limited = await rateLimited(request, 'practice-log', { limit: 30, window: '10 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const id = readInput(z.uuid(), (await params).id)
    const input = readInput(practiceLogInput, (await request.json().catch(() => null)) ?? {})
    const res = await asCaller<ActionResult<object>>(auth, () =>
      log
        ? logPracticeAction(id, input.circleId ?? null, input.timezone ?? null)
        : unlogPracticeAction(id, input.timezone ?? null),
    )
    if ('error' in res) {
      const code = /^Slow down/.test(res.error) ? 'rate_limited' : /timer/.test(res.error) ? 'conflict' : 'forbidden'
      return fail(code, res.error)
    }
    return ok(res.data)
  } catch (e) {
    return failFrom(e)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(request, params, true)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(request, params, false)
}
