import { pushDeviceInput, pushDeviceRevokeInput } from '@/lib/contract'
import { authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { registerPushDevice, revokePushDevice } from '@/lib/push-devices'

// /api/v1/push/devices (LIVE-720): where a native build registers its push token.
//
//   POST   { platform, provider, token, appVersion? } registers or refreshes the device for the
//          caller. Call it after the OS grants notification permission and on each cold start.
//   DELETE { token } revokes it (sign-out, or notifications turned off in the app).
//
// The profile is always the verified caller's; the body cannot name one. Sends go through
// sendPushToProfile (lib/push.ts) after the one send gate, so a member's notification settings
// apply to the app exactly as to the browser.

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const limited = await rateLimited(request, 'push-devices', { limit: 30, window: '1 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const input = readInput(pushDeviceInput, await request.json().catch(() => null))
    await registerPushDevice(auth.caller.id, input)
    return ok({ registered: true })
  } catch (e) {
    return failFrom(e)
  }
}

export async function DELETE(request: Request) {
  const limited = await rateLimited(request, 'push-devices', { limit: 30, window: '1 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const { token } = readInput(pushDeviceRevokeInput, await request.json().catch(() => null))
    await revokePushDevice(auth.caller.id, token)
    return ok({ registered: false })
  } catch (e) {
    return failFrom(e)
  }
}
