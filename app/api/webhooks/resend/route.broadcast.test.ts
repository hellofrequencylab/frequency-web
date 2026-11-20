import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'node:crypto'

// EMAIL-077: a campaign sent as a Resend broadcast reports delivery, opens and clicks back to its
// campaign. Resend echoes data.broadcast_id on every event; the webhook maps it plus the recipient to
// the campaign's outreach_sends row (lib/email-studio/broadcast-attribution.ts, faked here), moves the
// row's status, and writes the campaign id on the email_events row. Network-free.

const H = vi.hoisted(() => ({
  claimed: new Set<string>(),
  released: [] as string[],
  recorded: [] as { email: string; eventType: string; campaignId: string | null }[],
  lookups: [] as { broadcastId: string; email: string }[],
  outcomes: [] as { id: string; type: string }[],
  send: null as { id: string; campaignId: string | null; status: string } | null,
  lookupThrows: false,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'email_webhook_events') throw new Error(`unexpected table ${table}`)
      return {
        insert: async (row: { event_id: string }) => {
          if (H.claimed.has(row.event_id)) return { error: { code: '23505', message: 'duplicate key' } }
          H.claimed.add(row.event_id)
          return { error: null }
        },
        delete: () => ({
          eq: async (_c: string, v: string) => {
            H.released.push(v)
            H.claimed.delete(v)
            return { error: null }
          },
        }),
      }
    },
  }),
}))
vi.mock('@/lib/suppression', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/suppression')>()
  return {
    classifyBounce: real.classifyBounce,
    bounceSuppressionReason: real.bounceSuppressionReason,
    priorTransientBounces: async () => 0,
    recordEmailEvent: async (input: { email: string; eventType: string; campaignId?: string | null }) => {
      H.recorded.push({ email: input.email, eventType: input.eventType, campaignId: input.campaignId ?? null })
    },
    suppress: async () => {},
  }
})
vi.mock('@/lib/spaces/email', () => ({ handleSpaceSendWebhook: async () => false, handleSpaceSendEngagement: async () => {} }))
vi.mock('@/lib/spaces/email-tracking', () => ({ recordSpaceSendEventFromResend: async () => {}, spaceEventKindForResend: () => null }))
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => 'root-space' }))
vi.mock('@/lib/email-studio/broadcast-attribution', () => ({
  findBroadcastSend: async (broadcastId: string, email: string) => {
    if (H.lookupThrows) throw new Error('broadcast send lookup failed: db down')
    H.lookups.push({ broadcastId, email })
    return H.send
  },
  recordBroadcastSendOutcome: async (send: { id: string }, type: string) => {
    H.outcomes.push({ id: send.id, type })
    return true
  },
}))

import { POST } from './route'

const SECRET_KEY = crypto.randomBytes(24)
const SECRET = `whsec_${SECRET_KEY.toString('base64')}`

function signedRequest(svixId: string, event: Record<string, unknown>): Request {
  const body = JSON.stringify(event)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const sig = crypto.createHmac('sha256', SECRET_KEY).update(`${svixId}.${timestamp}.${body}`).digest('base64')
  return new Request('https://example.test/api/webhooks/resend', {
    method: 'POST',
    headers: { 'svix-id': svixId, 'svix-timestamp': timestamp, 'svix-signature': `v1,${sig}`, 'content-type': 'application/json' },
    body,
  })
}

const CAMPAIGN = 'c0a80121-7ac0-4e1c-9a1b-6f1e2d3c4b5a'
const event = (type: string, extra: Record<string, unknown> = {}) => ({
  type: `email.${type}`,
  data: { to: ['m@x.com'], email_id: 're_b1', broadcast_id: 'bc_1', ...extra },
})

beforeEach(() => {
  process.env.RESEND_WEBHOOK_SECRET = SECRET
  H.claimed.clear()
  H.released.length = 0
  H.recorded.length = 0
  H.lookups.length = 0
  H.outcomes.length = 0
  H.send = { id: 'os-1', campaignId: CAMPAIGN, status: 'sent' }
  H.lookupThrows = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('POST /api/webhooks/resend, broadcast events (EMAIL-077)', () => {
  it('maps a delivery to its campaign send row and records the campaign on the event', async () => {
    const res = await POST(signedRequest('msg_b1', event('delivered')))
    expect(res.status).toBe(200)
    expect(H.lookups).toEqual([{ broadcastId: 'bc_1', email: 'm@x.com' }])
    expect(H.outcomes).toEqual([{ id: 'os-1', type: 'delivered' }])
    expect(H.recorded).toEqual([{ email: 'm@x.com', eventType: 'delivered', campaignId: CAMPAIGN }])
  })

  it('attributes opens and clicks to the campaign too', async () => {
    await POST(signedRequest('msg_b2', event('opened')))
    await POST(signedRequest('msg_b3', event('clicked')))
    expect(H.recorded.map((r) => [r.eventType, r.campaignId])).toEqual([['opened', CAMPAIGN], ['clicked', CAMPAIGN]])
  })

  it('a campaign tag on the event still wins over the broadcast lookup', async () => {
    const tagged = 'd1b2c3d4-0000-4000-8000-000000000001'
    await POST(signedRequest('msg_b4', event('opened', { tags: { campaign_id: tagged } })))
    expect(H.recorded[0].campaignId).toBe(tagged)
  })

  it('records the event without a campaign when no send row carries the broadcast id', async () => {
    H.send = null
    const res = await POST(signedRequest('msg_b5', event('delivered')))
    expect(res.status).toBe(200)
    expect(H.outcomes).toEqual([])
    expect(H.recorded).toEqual([{ email: 'm@x.com', eventType: 'delivered', campaignId: null }])
  })

  it('leaves a plain email (no broadcast_id) alone', async () => {
    await POST(signedRequest('msg_b6', { type: 'email.delivered', data: { to: 'p@x.com', email_id: 're_p1' } }))
    expect(H.lookups).toEqual([])
    expect(H.recorded).toEqual([{ email: 'p@x.com', eventType: 'delivered', campaignId: null }])
  })

  it('503s and releases the claim when the lookup fails, appending nothing', async () => {
    H.lookupThrows = true
    const res = await POST(signedRequest('msg_b7', event('delivered')))
    expect(res.status).toBe(503)
    expect(H.released).toEqual(['msg_b7'])
    expect(H.recorded).toEqual([])
  })
})
