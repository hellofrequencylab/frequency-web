import { z } from 'zod'
import { asCaller, authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { checkInEvent } from '@/app/(main)/events/actions'

// POST /api/v1/events/{id}/check-in (LIVE-716): check in at a gathering through the web's
// checkInEvent (the window in the event's own zone, the host's switch, a real seat, exactly once).
// The event QR opens /q/<code>, which resolves to the event; the app posts its id here. A refusal
// is `ok: false` with the reason, as on the web.

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimited(request, 'event-check-in', { limit: 20, window: '10 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const id = readInput(z.uuid(), (await params).id)
    const res = await asCaller(auth, () => checkInEvent(id))
    return ok({
      ok: res.ok,
      alreadyCheckedIn: !!res.alreadyCheckedIn,
      zapsAwarded: res.zapsAwarded ?? 0,
      reason: res.reason ?? null,
    })
  } catch (e) {
    return failFrom(e)
  }
}
