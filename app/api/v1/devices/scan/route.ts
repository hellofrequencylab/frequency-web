import { rateLimited } from '@/lib/contract/respond'
import { admitDevice, deviceFail, deviceJson } from '@/lib/devices/http'
import { normalizeCardToken, normalizeUid } from '@/lib/devices/credentials'
import { scanCard } from '@/lib/devices/scan'

// POST /api/v1/devices/scan (LIVE-1113, docs/LOYALTY.md "Counter scanners"): a Space's counter scanner
// read a member's NFC card. Auth is the DEVICE header (`X-Frequency-Device: <id>.<secret>`), never a
// member session: the device pins the Space, the card pins the member, and lib/devices/scan.ts runs the
// Space's own check-in through captureNode, the pipeline the member's phone runs at the door code.
//
// Body: { card_token, uid?, queued?, scanned_at? }. `queued` and `scanned_at` mark a scan replayed from
// the device's offline queue; they are accepted and ignored, because a check-in is credited on the
// member's day as the SERVER resolves it, never a day the device claims.
//
// public-endpoint: no member session calls this, so it does not run authorizeCaller. The caller is a
// DEVICE, authenticated by admitDevice (lib/devices/http.ts) from the X-Frequency-Device header, and
// every read and write below is pinned to that device's own Space. The reply is the device wire's flat
// JSON, not the member envelope (docs/LOYALTY.md section 7).

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (await rateLimited(request, 'device-scan')) return deviceFail(429, 'rate_limited', { 'retry-after': '30' })
  const admitted = await admitDevice(request, 'device-scan', { limit: 30 })
  if ('response' in admitted) return admitted.response
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const cardToken = normalizeCardToken(body?.card_token)
    if (!cardToken) return deviceFail(400, 'invalid_input')
    const rawUid = body?.uid
    const uid = rawUid == null || rawUid === '' ? null : normalizeUid(rawUid)
    if (rawUid != null && rawUid !== '' && !uid) return deviceFail(400, 'invalid_input')
    const reply = await scanCard(admitted.device, { cardToken, uid })
    return deviceJson({ ...reply })
  } catch {
    return deviceFail(500, 'internal')
  }
}
