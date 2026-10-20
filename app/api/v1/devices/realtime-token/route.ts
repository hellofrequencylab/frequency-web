import { rateLimited } from '@/lib/contract/respond'
import { admitDevice, deviceFail, deviceJson } from '@/lib/devices/http'
import { deviceRelayEnabled, mintRelayToken } from '@/lib/devices/relay-store'

// POST /api/v1/devices/realtime-token (LIVE-1120, ADR-1870, docs/LOYALTY.md section 8): a registered
// device asks for a short-lived Supabase Realtime token so it can join its own private channel
// `device:<id>` and be controlled from the owner's phone over the internet. Same device wire as
// /devices/scan (flat { ok, reason? } JSON, Retry-After on a 429). Body: none.
//
//   · 404 not_enabled      DEVICE_RELAY_ENABLED (or SCANNER_DEVICES_ENABLED) is off here;
//   · 401                  the device credential failed (the device re-mints on its next try);
//   · 503 not_configured   the signing secret is missing in this deployment;
//   · 200 ok:false relay_disabled   the device's manager has the relay switched off;
//   · 200 ok:true          { token, expires_at, channel, realtime_url, apikey, allowed_cmds }.
//
// public-endpoint: no member session calls this, so it does not run authorizeCaller. The caller is a
// DEVICE, authenticated by admitDevice (lib/devices/http.ts) from the X-Frequency-Device header. The
// token is signed for THAT device's id only (never a body field), as role anon, and the realtime
// policy admits it to `device:<its id>` only while the device is active and its relay is on.

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (await rateLimited(request, 'device-realtime-token')) return deviceFail(429, 'rate_limited', { 'retry-after': '30' })
  if (!deviceRelayEnabled()) return deviceFail(404, 'not_enabled')
  const admitted = await admitDevice(request, 'device-realtime-token', { limit: 10 })
  if ('response' in admitted) return admitted.response
  try {
    const reply = await mintRelayToken(admitted.device)
    if (!reply.ok && reply.reason === 'not_configured') return deviceFail(503, 'not_configured')
    return deviceJson({ ...reply })
  } catch {
    return deviceFail(500, 'internal')
  }
}
