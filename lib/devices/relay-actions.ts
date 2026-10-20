'use server'

// INTERNET RELAY actions for the staff console (/admin/cyberunicorn, LIVE-1155, docs/LOYALTY.md
// section 8). Platform staff only: the read runs behind consoleStaffGate inside ./relay-store.ts.
// The browser side of the relay is lib/device/relay-transport.ts.

import { type ActionResult, ok, fail } from '@/lib/action-result'
import { consoleStaffGate } from './store'
import { deviceRelayEnabled, listRelayDevicesForStaff, setRelayEnabledForStaff, type ConsoleRelayDevice } from './relay-store'

/** Every active CyberUnicorn the console can try to drive over the internet, newest contact first. */
export async function listRelayDevicesForConsole(): Promise<ActionResult<ConsoleRelayDevice[]>> {
  if (!(await consoleStaffGate())) return fail('Only Frequency staff can drive a CyberUnicorn over the internet.')
  if (!deviceRelayEnabled()) return fail('The internet relay is not switched on for this site yet.')
  const devices = await listRelayDevicesForStaff()
  if (devices === null) return fail('Only Frequency staff can drive a CyberUnicorn over the internet.')
  return ok(devices)
}

/** Switch a device's relay on or off. The realtime policy lets staff join only while it is on. */
export async function setConsoleRelay(deviceId: string, on: boolean): Promise<ActionResult<{ on: boolean }>> {
  if (typeof deviceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(deviceId)) return fail('That CyberUnicorn was not found.')
  if (!deviceRelayEnabled()) return fail('The internet relay is not switched on for this site yet.')
  try {
    if (!(await setRelayEnabledForStaff(deviceId, on === true))) return fail('That CyberUnicorn was not found.')
  } catch {
    return fail('Could not change the relay. Try again.')
  }
  return ok({ on: on === true })
}
