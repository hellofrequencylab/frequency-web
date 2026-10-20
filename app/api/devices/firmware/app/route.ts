import { fail, rateLimited } from '@/lib/contract/respond'
import { consoleStaffGate, scannerDevicesEnabled } from '@/lib/devices/store'
import { FirmwareError, fetchFirmwareApp } from '@/lib/devices/firmware'

// GET /api/devices/firmware/app?tag=cu5k-v<version>: the app image (app.bin) of one published
// CyberUnicorn 5000 release, as raw bytes for the browser flasher (lib/device/flasher.ts), which
// writes it at 0x10000 over Web Serial. lib/devices/firmware.ts downloads it from the GitHub release
// and checks its size and sha256 against that release's manifest before a byte is sent; the checksum
// travels in `x-firmware-sha256` so the flasher checks it again on its side.
//
// Platform staff only: consoleStaffGate (lib/devices/store.ts: getCallerProfile, then isStaff), the
// gate the USB console runs behind. 404 while SCANNER_DEVICES_ENABLED is off, and for a tag that is
// not a published cu5k release. Errors use the {data, error} envelope; success is
// application/octet-stream. Outside /api/v1 on purpose: this serves the staff console, not the app
// contract, and the app contract answers only JSON envelopes.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'device-firmware-app', { limit: 10 })
  if (limited) return limited
  if (!scannerDevicesEnabled()) return fail('not_found')
  const staff = await consoleStaffGate()
  if (!staff) return fail('forbidden', 'Only platform staff can update CyberUnicorn firmware.')
  const tag = new URL(request.url).searchParams.get('tag') ?? ''
  try {
    const app = await fetchFirmwareApp(tag)
    if (!app) return fail('not_found', 'That firmware release is not published.')
    return new Response(app.bytes as BodyInit, {
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(app.bytes.byteLength),
        'content-disposition': `attachment; filename="cyberunicorn-${app.version}-app.bin"`,
        'cache-control': 'private, no-store',
        'x-firmware-sha256': app.sha256,
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (e) {
    return fail('internal', e instanceof FirmwareError ? e.message : undefined)
  }
}
