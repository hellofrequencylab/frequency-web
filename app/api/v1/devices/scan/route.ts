import { rateLimited } from '@/lib/contract/respond'
import { claimOnce } from '@/lib/rate-limit'
import { admitDevice, deviceFail, deviceJson } from '@/lib/devices/http'
import { normalizeCardToken, normalizeUid } from '@/lib/devices/credentials'
import { scanCard } from '@/lib/devices/scan'

// POST /api/v1/devices/scan (LIVE-1125, docs/LOYALTY.md "Counter scanners"): a Space's counter scanner
// read a member's NFC card. Auth is the DEVICE header (`X-Frequency-Device: <id>.<secret>`), never a
// member session: the device pins the Space, the card pins the member, and lib/devices/scan.ts runs the
// Space's own check-in through captureNode, the pipeline the member's phone runs at the door code.
//
// A board with no Wi-Fi relays its scan through the computer it is plugged into (the CyberUnicorn console,
// build plan phase 5). That request carries `X-Frequency-Device-Id` and `X-Frequency-Signature` instead of
// the secret: the board signed the exact body, so the computer never holds the secret. A signed scan must
// carry `scanned_at` within RELAY_WINDOW_S of this server's clock and a `nonce` not seen from that device
// inside the window, so a captured request cannot be replayed (cyberpunkunicorn-os/apps/remote/PROTOCOL.md).
//
// Body: { card_token, uid?, queued?, scanned_at?, nonce? }. `queued` and `scanned_at` mark a scan replayed from
// the device's offline queue; they are accepted and ignored, because a check-in is credited on the
// member's day as the SERVER resolves it, never a day the device claims.
//
// public-endpoint: no member session calls this, so it does not run authorizeCaller. The caller is a
// DEVICE, authenticated by admitDevice (lib/devices/http.ts) from the X-Frequency-Device header, and
// every read and write below is pinned to that device's own Space. The reply is the device wire's flat
// JSON, not the member envelope (docs/LOYALTY.md section 7).

export const dynamic = 'force-dynamic'

/** How far a relayed scan's `scanned_at` may sit from this server's clock, in seconds. */
const RELAY_WINDOW_S = 300

export async function POST(request: Request) {
  if (await rateLimited(request, 'device-scan')) return deviceFail(429, 'rate_limited', { 'retry-after': '30' })
  const raw = await request.text().catch(() => '')
  const admitted = await admitDevice(request, 'device-scan', { limit: 30 }, { signedBody: raw })
  if ('response' in admitted) return admitted.response
  try {
    let body: Record<string, unknown> | null = null
    try {
      const parsed: unknown = JSON.parse(raw)
      body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
    } catch {
      body = null
    }
    if (admitted.signed) {
      const at = Number(body?.scanned_at)
      const nonce = body?.nonce
      if (!Number.isFinite(at) || Math.abs(Date.now() / 1000 - at) > RELAY_WINDOW_S) return deviceFail(400, 'stale_scan')
      if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(nonce)) return deviceFail(400, 'invalid_input')
      if (!(await claimOnce(`device-scan:${admitted.device.id}:${nonce}`, RELAY_WINDOW_S * 2))) return deviceFail(409, 'replayed')
    }
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
