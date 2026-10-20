import { fail, ok, rateLimited } from '@/lib/contract/respond'
import { consoleStaffGate, scannerDevicesEnabled } from '@/lib/devices/store'
import { FirmwareError, latestFirmware, type FirmwareRelease } from '@/lib/devices/firmware'

// GET /api/devices/firmware: the newest published CyberUnicorn 5000 firmware, for the "Update
// firmware" button on /admin/cyberunicorn. Reads GitHub releases tagged `cu5k-v<version>` through
// lib/devices/firmware.ts (the browser cannot read release assets itself: no CORS), validates the
// release's manifest.json, and answers { release } or { release: null } when none is published yet.
// `release.app.url` points at ./app, which serves the checked app.bin.
//
// Platform staff only: consoleStaffGate (lib/devices/store.ts: getCallerProfile, then isStaff), the
// gate the USB console runs behind. 404 while SCANNER_DEVICES_ENABLED is off, like the page itself.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'device-firmware', { limit: 30 })
  if (limited) return limited
  if (!scannerDevicesEnabled()) return fail('not_found')
  const staff = await consoleStaffGate()
  if (!staff) return fail('forbidden', 'Only platform staff can update CyberUnicorn firmware.')
  try {
    const release: FirmwareRelease | null = await latestFirmware()
    return ok({ release })
  } catch (e) {
    return fail('internal', e instanceof FirmwareError ? e.message : undefined)
  }
}
