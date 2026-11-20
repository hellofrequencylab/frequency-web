import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'node:crypto'

// The Resend webhook is EXACTLY ONCE (scan2 L2-05). What is locked here, all network-free:
//   1. CLAIM FIRST: the svix-id is inserted into email_webhook_events before any side effect. A
//      duplicate (23505) answers 200 { duplicate: true } and appends NOTHING; any other claim error
//      answers 500 before any append, so Resend retries into a working claim.
//   2. THE ROW IS APPENDED LAST: a suppression failure 503s BEFORE recordEmailEvent runs (claim
//      released so the retry re-processes); a recordEmailEvent failure 503s having written nothing;
//      a timeline failure after a successful append is log-and-200, never a retry.
//   3. Same svix-id delivered twice appends ONE email_events row.

const H = vi.hoisted(() => ({
  claimed: new Set<string>(),
  claimError: null as { code?: string; message?: string } | null,
  released: [] as string[],
  recorded: [] as { email: string; eventType: string }[],
  suppressed: [] as string[],
  suppressThrows: false,
  recordThrows: false,
  timelineThrows: false,
  priorTransient: 0,
  rootSpaceId: 'root-space' as string | null,
  scoped: [] as { email: string; reason: string; spaceId?: string }[],
  requeued: [] as string[],
  requeueThrows: false,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'email_webhook_events') throw new Error(`unexpected table ${table}`)
      return {
        insert: async (row: { event_id: string }) => {
          if (H.claimError) return { error: H.claimError }
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
  priorTransientBounces: async () => H.priorTransient,
  recordEmailEvent: async (input: { email: string; eventType: string }) => {
    if (H.recordThrows) throw new Error('email_events insert failed')
    H.recorded.push({ email: input.email, eventType: input.eventType })
  },
  suppress: async (email: string, reason: string, spaceId?: string) => {
    if (H.suppressThrows) throw new Error('suppression insert failed')
    H.suppressed.push(email)
    H.scoped.push({ email, reason, spaceId })
  },
  }
})
vi.mock('@/lib/spaces/email', () => ({
  handleSpaceSendWebhook: async () => {},
  handleSpaceSendEngagement: async () => {
    if (H.timelineThrows) throw new Error('timeline write failed')
  },
}))

// EMAIL-070: the requeue's own lookups and enqueue are covered in lib/comms/quota-requeue.test.ts.
// Here the reason check is the real one and the requeue records which provider id it was asked for.
vi.mock('@/lib/comms/quota-requeue', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/comms/quota-requeue')>()
  return {
    failedForDailyQuota: real.failedForDailyQuota,
    requeueQuotaFailedEmail: async (db: unknown, providerId: string) => {
      // The route hands in its own service-role client; the requeue never opens one.
      if (!db || typeof (db as { from?: unknown }).from !== 'function') throw new Error('no db client passed')
      if (H.requeueThrows) throw new Error('attempt lookup failed')
      H.requeued.push(providerId)
      return 'requeued'
    },
  }
})

vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => H.rootSpaceId }))

import { POST } from './route'

const SECRET_KEY = crypto.randomBytes(24)
const SECRET = `whsec_${SECRET_KEY.toString('base64')}`

function signedRequest(svixId: string, event: Record<string, unknown>): Request {
  const body = JSON.stringify(event)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const sig = crypto.createHmac('sha256', SECRET_KEY).update(`${svixId}.${timestamp}.${body}`).digest('base64')
  return new Request('https://example.test/api/webhooks/resend', {
    method: 'POST',
    headers: {
      'svix-id': svixId,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${sig}`,
      'content-type': 'application/json',
    },
    body,
  })
}

const opened = { type: 'email.opened', data: { to: 'a@x.com', email_id: 're_1' } }
const bounced = { type: 'email.bounced', data: { to: ['b@x.com'], email_id: 're_2' } }

beforeEach(() => {
  process.env.RESEND_WEBHOOK_SECRET = SECRET
  H.claimed.clear()
  H.claimError = null
  H.released.length = 0
  H.recorded.length = 0
  H.suppressed.length = 0
  H.suppressThrows = false
  H.recordThrows = false
  H.timelineThrows = false
  H.priorTransient = 0
  H.rootSpaceId = 'root-space'
  H.scoped.length = 0
  H.requeued.length = 0
  H.requeueThrows = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('POST /api/webhooks/resend', () => {
  it('records a first delivery once', async () => {
    const res = await POST(signedRequest('msg_1', opened))
    expect(res.status).toBe(200)
    expect(H.recorded).toEqual([{ email: 'a@x.com', eventType: 'opened' }])
    expect(H.claimed.has('msg_1')).toBe(true)
  })

  it('the same svix-id twice appends ONE email_events row and acks the retry as a duplicate', async () => {
    const first = await POST(signedRequest('msg_dup', opened))
    expect(first.status).toBe(200)
    const second = await POST(signedRequest('msg_dup', opened))
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ ok: true, duplicate: true })
    expect(H.recorded).toHaveLength(1)
  })

  it('a claim error answers 500 before any append', async () => {
    H.claimError = { code: '57P01', message: 'connection lost' }
    const res = await POST(signedRequest('msg_err', bounced))
    expect(res.status).toBe(500)
    expect(H.recorded).toEqual([])
    expect(H.suppressed).toEqual([])
    expect(H.released).toEqual([]) // nothing was inserted, nothing to release
  })

  it('a suppression failure 503s BEFORE the row is appended and releases the claim', async () => {
    H.suppressThrows = true
    const res = await POST(signedRequest('msg_sup', bounced))
    expect(res.status).toBe(503)
    expect(H.recorded).toEqual([]) // the row is appended LAST, so a retry appends it once
    expect(H.released).toEqual(['msg_sup'])
    // The retry (suppression working again) is processed, not answered as a duplicate.
    H.suppressThrows = false
    const retry = await POST(signedRequest('msg_sup', bounced))
    expect(retry.status).toBe(200)
    expect(H.suppressed).toEqual(['b@x.com'])
    expect(H.recorded).toHaveLength(1)
  })

  it('a Transient bounce (full mailbox) records the event but does not suppress the address', async () => {
    const soft = { type: 'email.bounced', data: { to: ['c@x.com'], email_id: 're_3', bounce: { type: 'Transient', subType: 'MailboxFull' } } }
    const res = await POST(signedRequest('msg_soft', soft))
    expect(res.status).toBe(200)
    expect(H.suppressed).toEqual([])
    expect(H.recorded).toEqual([{ email: 'c@x.com', eventType: 'bounced' }])
  })

  it('a third Transient bounce in the window suppresses', async () => {
    H.priorTransient = 2
    const soft = { type: 'email.bounced', data: { to: ['c@x.com'], email_id: 're_4', bounce: { type: 'Transient' } } }
    const res = await POST(signedRequest('msg_soft3', soft))
    expect(res.status).toBe(200)
    expect(H.suppressed).toEqual(['c@x.com'])
  })

  it('a Permanent bounce suppresses on the first event', async () => {
    const hard = { type: 'email.bounced', data: { to: ['d@x.com'], email_id: 're_5', bounce: { type: 'Permanent' } } }
    await POST(signedRequest('msg_hard', hard))
    expect(H.suppressed).toEqual(['d@x.com'])
  })

  it('a recordEmailEvent failure 503s with the claim released (nothing was written)', async () => {
    H.recordThrows = true
    const res = await POST(signedRequest('msg_rec', opened))
    expect(res.status).toBe(503)
    expect(H.released).toEqual(['msg_rec'])
  })

  it('a timeline failure AFTER the append is log-and-200, never a retry', async () => {
    H.timelineThrows = true
    const res = await POST(signedRequest('msg_tl', opened))
    expect(res.status).toBe(200)
    expect(H.recorded).toHaveLength(1)
    expect(H.released).toEqual([])
  })

  it('rejects a bad signature before touching the ledger', async () => {
    const req = signedRequest('msg_bad', opened)
    const tampered = new Request(req.url, {
      method: 'POST',
      headers: { ...Object.fromEntries(req.headers), 'svix-signature': 'v1,AAAA' },
      body: JSON.stringify(opened),
    })
    const res = await POST(tampered)
    expect(res.status).toBe(401)
    expect(H.claimed.size).toBe(0)
  })
  // EMAIL-076: campaigns go out as Resend broadcasts, so an opt-out made on Resend's page comes back
  // as contact.updated and must land as a ROOT-Space suppression (never a global one).
  describe('contact.updated', () => {
    const optOut = { type: 'contact.updated', data: { email: 'c@x.com', unsubscribed: true } }

    it('mirrors a Resend opt-out as a root-Space unsubscribe suppression', async () => {
      const res = await POST(signedRequest('msg_c1', optOut))
      expect(res.status).toBe(200)
      expect(H.scoped).toEqual([{ email: 'c@x.com', reason: 'unsubscribe', spaceId: 'root-space' }])
      expect(H.recorded).toEqual([])
    })

    it('does nothing for a contact that is still subscribed', async () => {
      const res = await POST(signedRequest('msg_c2', { type: 'contact.updated', data: { email: 'c@x.com', unsubscribed: false } }))
      expect(res.status).toBe(200)
      expect(H.scoped).toEqual([])
    })

    it('503s and releases the claim when the suppression write fails, so Resend redelivers', async () => {
      H.suppressThrows = true
      const res = await POST(signedRequest('msg_c3', optOut))
      expect(res.status).toBe(503)
      expect(H.released).toEqual(['msg_c3'])
    })

    it('never writes a global suppression when there is no root Space', async () => {
      H.rootSpaceId = null
      const res = await POST(signedRequest('msg_c4', optOut))
      expect(res.status).toBe(200)
      expect(H.scoped).toEqual([])
    })
  })

  // EMAIL-070: Resend accepted the send, then dropped it for the daily limit.
  describe('email.failed for the daily quota', () => {
    const quotaFailed = { type: 'email.failed', data: { to: ['r@x.com'], email_id: 're_q1', failed: { reason: 'reached_daily_quota' } } }

    it('requeues the send behind that provider id and still records the event', async () => {
      const res = await POST(signedRequest('msg_q1', quotaFailed))
      expect(res.status).toBe(200)
      expect(H.requeued).toEqual(['re_q1'])
      expect(H.recorded).toEqual([{ email: 'r@x.com', eventType: 'failed' }])
    })

    it('does not requeue a failure for any other reason', async () => {
      const other = { type: 'email.failed', data: { to: 'r@x.com', email_id: 're_q2', failed: { reason: 'invalid_recipient' } } }
      const res = await POST(signedRequest('msg_q2', other))
      expect(res.status).toBe(200)
      expect(H.requeued).toEqual([])
    })

    it('a redelivered webhook does not requeue twice', async () => {
      await POST(signedRequest('msg_q3', quotaFailed))
      const again = await POST(signedRequest('msg_q3', quotaFailed))
      expect(await again.json()).toMatchObject({ duplicate: true })
      expect(H.requeued).toEqual(['re_q1'])
    })

    it('503s and releases the claim when the requeue cannot be written, appending nothing', async () => {
      H.requeueThrows = true
      const res = await POST(signedRequest('msg_q4', quotaFailed))
      expect(res.status).toBe(503)
      expect(H.released).toEqual(['msg_q4'])
      expect(H.recorded).toEqual([])
    })
  })
})
