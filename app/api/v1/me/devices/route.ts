import { authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited } from '@/lib/contract/respond'
import { deviceRelayEnabled, listManagedDevices } from '@/lib/devices/relay-store'

// GET /api/v1/me/devices (LIVE-1155, ADR-1870, docs/LOYALTY.md section 8): the devices the caller may
// control over the internet relay. A device is listed when the caller is its personal owner, or the
// owner or an active admin of the Space it is registered to (public.relay_manageable_devices, the
// same rule the realtime.messages policy applies when the phone joins `channel`).
//
// PRIVACY: the caller's own list. There is no id parameter, so there is nothing to enumerate. While
// DEVICE_RELAY_ENABLED is off the list is empty and relayAvailable is false.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'me-devices')
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    if (!deviceRelayEnabled()) return ok({ items: [], relayAvailable: false })
    return ok({ items: await listManagedDevices(auth.caller.id), relayAvailable: true })
  } catch (e) {
    return failFrom(e)
  }
}
