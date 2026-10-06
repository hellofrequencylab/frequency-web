import { z } from 'zod'
import { authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { joinCircleAsMember, leaveCircleAsMember } from '@/lib/circles/join'

// /api/v1/circles/{id}/membership (LIVE-716): join (POST) and leave (DELETE) as the caller, through
// the same lib/circles/join.ts helpers the web's joinCircle and leaveCircle actions call. The join
// never passes `invited` (SCAN-774): access, capacity and paid tiers are checked there.

export const dynamic = 'force-dynamic'

async function handle(request: Request, params: Promise<{ id: string }>, join: boolean) {
  const limited = await rateLimited(request, 'circle-membership', { limit: 30, window: '10 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const id = readInput(z.uuid(), (await params).id)
    const res = join
      ? await joinCircleAsMember(auth.caller.id, id, { invited: false })
      : await leaveCircleAsMember(auth.caller.id, id)
    if ('error' in res) return fail(join ? 'forbidden' : 'internal', res.error)
    return ok({ member: join })
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
