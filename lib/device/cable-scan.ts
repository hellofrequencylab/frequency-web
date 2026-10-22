import type { ScanRelay } from './types'

// SCANS THROUGH THE CABLE, the computer's half (build plan phase 5, cyberpunkunicorn-os/apps/remote/
// PROTOCOL.md "Scans through the cable"). A CyberUnicorn with no Wi-Fi signs a member's scan and hands it
// to the console over USB. This posts the board's exact bytes to the scan endpoint with the board's own
// signature (the computer never holds the secret) and returns what goes back in `frequency.relay_reply`.
// Same origin as the console, so no CORS. `status` 0 means the server was not reached: the board queues.

/** The server's answer, trimmed to the fields the board reads so the reply line stays under 512 bytes. */
export type RelayAnswer = { status: number; body: Record<string, unknown> }

const KEEP = ['ok', 'reason', 'member', 'zapsAwarded', 'loyalty', 'greeting', 'perk'] as const

export async function forwardScan(relay: ScanRelay, endpoint = '/api/v1/devices/scan', fetcher: typeof fetch = fetch): Promise<RelayAnswer> {
  if (!relay.body || !relay.device_id || !relay.signature) return { status: 0, body: { ok: false, reason: 'bad_relay' } }
  try {
    const res = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-frequency-device-id': relay.device_id,
        'x-frequency-signature': relay.signature,
      },
      body: relay.body,
      credentials: 'omit',
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const body: Record<string, unknown> = {}
    for (const k of KEEP) if (json[k] !== undefined) body[k] = json[k]
    const member = body.member as { display_name?: unknown } | null | undefined
    if (member && typeof member.display_name === 'string') body.member = { display_name: member.display_name.slice(0, 60) }
    return { status: res.status, body }
  } catch {
    return { status: 0, body: { ok: false, reason: 'offline' } }
  }
}

/** One plain line for a scan answer's reason, for the console's check-in list. */
export function scanReasonText(reason: unknown): string {
  switch (reason) {
    case 'unknown_card':
      return 'Not a card for this Space'
    case 'card_mismatch':
      return 'That card was copied onto another chip'
    case 'card_paused':
      return 'Its owner paused this card'
    case 'already_captured':
      return 'Already checked in today'
    case 'checkin_not_set_up':
      return 'Check-in is not set up for this Space'
    case 'device_unauthorized':
      return 'This scanner was revoked. Set it up again.'
    case 'stale_scan':
      return 'The board clock is off. Reconnect it.'
    case 'replayed':
      return 'That scan was already sent'
    case 'rate_limited':
      return 'Too many scans. Wait a moment.'
    case 'offline':
      return 'Could not reach Frequency. The board saved it for later.'
    case 'not_enabled':
      return 'Counter scanners are switched off'
    default:
      return typeof reason === 'string' && reason ? reason.replace(/_/g, ' ') : 'Not checked in'
  }
}
