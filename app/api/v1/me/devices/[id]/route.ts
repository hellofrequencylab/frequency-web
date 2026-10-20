import { z } from 'zod'
import { deviceRelayPatchInput } from '@/lib/contract'
import { authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { deviceRelayEnabled, updateRelaySetting } from '@/lib/devices/relay-store'

// PATCH /api/v1/me/devices/{id} (LIVE-1155, ADR-1870, docs/LOYALTY.md section 8): the owner's
// server-side switch for one device's internet relay. Body { relayEnabled?, allowedCmds?, owner? }:
// turn the relay on or off (off also stops the next token mint and the next join), narrow the
// command allow-list the device enforces, or `owner: "me"` to become the device's personal owner.
//
// Authorization is re-checked on the server for every write: updateRelaySetting writes only when
// public.relay_manageable_devices lists the device for the caller. A device the caller does not
// manage is not_found, the same as one that does not exist.

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimited(request, 'me-device', { limit: 30, window: '1 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    if (!deviceRelayEnabled()) return fail('not_found', 'The internet relay is not open here yet.')
    const id = readInput(z.uuid(), (await params).id)
    const patch = readInput(deviceRelayPatchInput, await request.json().catch(() => null))
    const device = await updateRelaySetting(auth.caller.id, id, patch)
    if (!device) return fail('not_found', 'That device could not be found.')
    return ok(device)
  } catch (e) {
    return failFrom(e)
  }
}
