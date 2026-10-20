import 'server-only'
import { rateLimitOk } from '@/lib/rate-limit'
import { DEVICE_HEADER } from './credentials'
import { authenticateDevice, scannerDevicesEnabled, touchDevice, type ScannerDevice } from './store'

// THE DEVICE WIRE (LIVE-1125, docs/LOYALTY.md "Counter scanners"). The /api/v1/devices/* routes are a
// separate, small contract from the member app's (lib/contract/respond.ts): a microcontroller parses a
// flat JSON body, so every answer is `{ ok, reason?, … }` at the top level, never the `{ data, error }`
// envelope. The firmware reads it this way:
//   · 404            the device endpoints are not switched on here (SCANNER_DEVICES_ENABLED off);
//   · 401            the device header is missing, malformed, unknown, wrong or revoked;
//   · 400 / 429      a bad body, or too many requests (Retry-After: 30);
//   · 5xx            worth retrying from the offline queue;
//   · 200 ok:false   a real answer the counter shows (an unknown card, already checked in today).
// No CORS, no cookies: a device is not a browser.

/** A device reply: flat JSON, never cached. */
export function deviceJson(body: Record<string, unknown>, status = 200, extra?: HeadersInit): Response {
  const h = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private' })
  if (extra) new Headers(extra).forEach((v, k) => h.set(k, v))
  return new Response(JSON.stringify(body), { status, headers: h })
}

export function deviceFail(status: number, reason: string, extra?: HeadersInit): Response {
  return deviceJson({ ok: false, reason }, status, extra)
}

/**
 * The front half every device route runs after its address limit (`rateLimited`, lib/contract/respond.ts,
 * BEFORE the credential read, so a stream of forged headers does not buy a database read each): the
 * switch, the device credential, then a per-device limit. Returns the device, or the Response to send.
 */
export async function admitDevice(
  request: Request,
  endpoint: string,
  perDevice: { limit: number },
): Promise<{ device: ScannerDevice } | { response: Response }> {
  if (!scannerDevicesEnabled()) return { response: deviceFail(404, 'not_enabled') }
  const retry = { 'retry-after': '30' }
  const device = await authenticateDevice(request.headers.get(DEVICE_HEADER))
  if (!device) return { response: deviceFail(401, 'device_unauthorized') }
  if (!(await rateLimitOk(`v1:${endpoint}:device`, device.id, perDevice.limit, '1 m', { whenUnconfigured: 'allow' }))) {
    return { response: deviceFail(429, 'rate_limited', retry) }
  }
  await touchDevice(device.id)
  return { device }
}
