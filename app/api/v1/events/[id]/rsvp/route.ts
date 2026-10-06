import { z } from 'zod'
import { rsvpInput } from '@/lib/contract'
import { asCaller, authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { createClient } from '@/lib/supabase/server'
import { setRsvpStatus } from '@/app/(main)/events/actions'

// /api/v1/events/{id}/rsvp (LIVE-716): POST { status } sets the caller's RSVP, DELETE cancels it
// (not_going). Both run the web's setRsvpStatus, which holds the gate (open, the booking window,
// host approval, capacity and the waitlist) and the side effects. The answer is the stored row, so
// a full event comes back as `waitlist` and an approval event as `pending`.

export const dynamic = 'force-dynamic'

async function handle(request: Request, params: Promise<{ id: string }>, intent: 'going' | 'maybe' | 'not_going' | null) {
  const limited = await rateLimited(request, 'rsvp', { limit: 30, window: '10 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const id = readInput(z.uuid(), (await params).id)
    const status = intent ?? readInput(rsvpInput, await request.json().catch(() => null)).status
    return await asCaller(auth, async () => {
      const res = await setRsvpStatus(id, status)
      if (!res) return fail('forbidden', 'RSVPs are closed for this event.')
      if ('error' in res) return fail('internal', res.error)
      const { data: row } = await (await createClient())
        .from('event_rsvps')
        .select('status, approval_status')
        .eq('event_id', id)
        .eq('profile_id', auth.caller.id)
        .maybeSingle()
      return ok({ status: row?.status ?? null, approvalStatus: row?.approval_status ?? null })
    })
  } catch (e) {
    return failFrom(e)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(request, params, null)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(request, params, 'not_going')
}
