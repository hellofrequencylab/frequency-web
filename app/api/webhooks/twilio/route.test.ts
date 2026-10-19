import { describe, it, expect, beforeEach, vi } from 'vitest'

// The Twilio inbound webhook (ADR-256, ADR-1790). Locked here, network-free:
//   1. A bad or absent signature is a 401 and touches nothing.
//   2. STOP records a global opt-out on the phone; START lifts it on the ledger; HELP and any
//      other text only ack. Every verified inbound reply is empty TwiML (text/xml), the shape
//      Twilio expects from an inbound-message webhook.
//   3. A delivery-status callback (MessageStatus, no Body) is a JSON 200 and touches consent.

const H = vi.hoisted(() => ({
  verified: true,
  stops: [] as { phone?: string | null; source?: string }[],
  starts: [] as { phone: string; source?: string }[],
}))

vi.mock('@/lib/webhook-verify', () => ({
  verifyTwilioSignature: () => H.verified,
}))
vi.mock('@/lib/crm/contact-consent', () => ({
  recordGlobalStop: async (input: { phone?: string | null; source?: string }) => {
    H.stops.push(input)
    return { emailStopped: false, smsProfilesStopped: 1 }
  },
  recordSmsRestart: async (input: { phone: string; source?: string }) => {
    H.starts.push(input)
    return 1
  },
}))

import { POST } from './route'

function inbound(body: string, from = '+15555550123') {
  return new Request('https://frequencylocal.com/api/webhooks/twilio', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'sig' },
    body: new URLSearchParams({ From: from, Body: body, MessageSid: 'SM1' }).toString(),
  })
}

beforeEach(() => {
  H.verified = true
  H.stops = []
  H.starts = []
  process.env.TWILIO_AUTH_TOKEN = 'token'
})

describe('Twilio webhook', () => {
  it('rejects a bad signature before touching anything', async () => {
    H.verified = false
    const res = await POST(inbound('STOP'))
    expect(res.status).toBe(401)
    expect(H.stops).toHaveLength(0)
  })

  it('rejects every request when no auth token is set (fail-closed)', async () => {
    delete process.env.TWILIO_AUTH_TOKEN
    const res = await POST(inbound('STOP'))
    expect(res.status).toBe(401)
  })

  it('STOP records a global opt-out and answers empty TwiML', async () => {
    const res = await POST(inbound(' Stop '))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/xml')
    expect(res.headers.get('x-frequency-handled')).toBe('stop')
    expect(await res.text()).toContain('<Response></Response>')
    expect(H.stops).toEqual([{ phone: '+15555550123', reason: 'stop_reply', source: 'sms_webhook' }])
    expect(H.starts).toHaveLength(0)
  })

  it('START lifts the stop on the ledger and answers empty TwiML', async () => {
    for (const word of ['START', 'unstop', 'Yes']) {
      H.starts = []
      const res = await POST(inbound(word))
      expect(res.headers.get('x-frequency-handled')).toBe('start')
      expect(H.starts).toEqual([{ phone: '+15555550123', source: 'sms_webhook' }])
    }
    expect(H.stops).toHaveLength(0)
  })

  it('HELP and any other text only ack', async () => {
    expect((await POST(inbound('HELP'))).headers.get('x-frequency-handled')).toBe('help')
    expect((await POST(inbound('see you tonight'))).headers.get('x-frequency-handled')).toBe('ack')
    expect(H.stops).toHaveLength(0)
    expect(H.starts).toHaveLength(0)
  })

  it('a delivery-status callback is a JSON ack that touches no consent', async () => {
    const req = new Request('https://frequencylocal.com/api/webhooks/twilio', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'sig' },
      body: new URLSearchParams({ MessageSid: 'SM1', MessageStatus: 'delivered' }).toString(),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(H.stops).toHaveLength(0)
    expect(H.starts).toHaveLength(0)
  })
})
