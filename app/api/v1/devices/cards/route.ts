import { SITE_URL } from '@/lib/site'
import { rateLimited } from '@/lib/contract/respond'
import { admitDevice, deviceFail, deviceJson } from '@/lib/devices/http'
import { normalizeHandle } from '@/lib/devices/credentials'
import { issueCardForHandle } from '@/lib/devices/store'

// POST /api/v1/devices/cards (LIVE-1056, docs/LOYALTY.md "Counter scanners"): the counter scanner
// writes a new member card. Device-authenticated; the card is valid at the device's OWN Space only.
// Body { member_handle }. Reply { ok, token, url, member }: the device writes `url` (SITE_URL/c/<token>)
// to the card as an NDEF URI, so the same card opens the member's rewards on a phone. The token is
// returned this once; only its hash is stored.
//
// public-endpoint: no member session calls this, so it does not run authorizeCaller. The caller is a
// DEVICE, authenticated by admitDevice (lib/devices/http.ts) from the X-Frequency-Device header, and
// every read and write below is pinned to that device's own Space. The reply is the device wire's flat
// JSON, not the member envelope (docs/LOYALTY.md section 7).

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (await rateLimited(request, 'device-cards')) return deviceFail(429, 'rate_limited', { 'retry-after': '30' })
  const admitted = await admitDevice(request, 'device-cards', { limit: 10 })
  if ('response' in admitted) return admitted.response
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const handle = normalizeHandle(body?.member_handle)
    if (!handle) return deviceFail(400, 'invalid_input')
    const issued = await issueCardForHandle(admitted.device, handle)
    if (!issued.ok) {
      if (issued.reason === 'failed') return deviceFail(500, 'internal')
      return deviceJson({ ok: false, reason: issued.reason })
    }
    return deviceJson({
      ok: true,
      token: issued.token,
      url: `${SITE_URL}/c/${issued.token}`,
      member: { display_name: issued.displayName },
    })
  } catch {
    return deviceFail(500, 'internal')
  }
}
