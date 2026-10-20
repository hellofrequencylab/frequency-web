import { describe, expect, it, vi } from 'vitest'
import { forwardScan, scanReasonText } from './cable-scan'

// Build plan phase 5: the console forwards the board's signed bytes untouched and trims the answer.

const relay = { nonce: '9f86d081', device_id: '4b3f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f', body: '{"card_token":"x","nonce":"9f86d081"}', signature: 'v1=ab' }

describe('forwardScan', () => {
  it('posts the exact body with the device id and signature, and keeps only what the board reads', async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, member: { display_name: 'Maya', email: 'no' }, zapsAwarded: 25, loyalty: null, extra: 'x'.repeat(900) }), { status: 200 }),
    )
    const out = await forwardScan(relay, '/api/v1/devices/scan', fetcher as unknown as typeof fetch)
    expect(out).toEqual({ status: 200, body: { ok: true, member: { display_name: 'Maya' }, zapsAwarded: 25, loyalty: null } })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/devices/scan')
    expect(init.body).toBe(relay.body)
    expect(init.headers).toMatchObject({ 'x-frequency-device-id': relay.device_id, 'x-frequency-signature': 'v1=ab' })
  })

  it('answers status 0 when the server is unreachable or the relay is incomplete', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect((await forwardScan(relay, undefined, down as unknown as typeof fetch)).status).toBe(0)
    expect((await forwardScan({ nonce: 'n' }, undefined, down as unknown as typeof fetch)).status).toBe(0)
    expect(down).toHaveBeenCalledTimes(1)
  })

  it('passes a refusal through with its status', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: false, reason: 'device_unauthorized' }), { status: 401 }))
    expect(await forwardScan(relay, undefined, fetcher as unknown as typeof fetch)).toEqual({ status: 401, body: { ok: false, reason: 'device_unauthorized' } })
    expect(scanReasonText('already_captured')).toBe('Already checked in today')
  })
})
