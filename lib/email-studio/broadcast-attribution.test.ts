import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  broadcastStatusFor,
  findBroadcastSend,
  recordBroadcastSendOutcome,
  type BroadcastAttributionDb,
} from './broadcast-attribution'

// EMAIL-077: the outreach_sends lookup and status write behind broadcast attribution. Network-free.

type Row = { id: string; campaign_id: string | null; status: string; email: string; resend_id: string | null }

const H = vi.hoisted(() => ({
  rows: [] as { id: string; campaign_id: string | null; status: string; email: string; resend_id: string | null }[],
  updates: [] as { id: string; patch: Record<string, unknown> }[],
  error: null as { message: string } | null,
}))

// The db the webhook passes in. This module never opens a service-role client of its own.
const db = {
  from: (table: string) => {
    if (table !== 'outreach_sends') throw new Error(`unexpected table ${table}`)
    const eqs: [keyof Row, unknown][] = []
    let ins: [keyof Row, unknown[]] | null = null
    const q = {
      select: () => q,
      eq: (c: keyof Row, v: unknown) => { eqs.push([c, v]); return q },
      in: (c: keyof Row, v: unknown[]) => { ins = [c, v]; return q },
      limit: async (n: number) => {
        if (H.error) return { data: null, error: H.error }
        const within = ins
        const hit = H.rows.filter((r) => eqs.every(([c, v]) => r[c] === v) && (!within || within[1].includes(r[within[0]])))
        return { data: hit.slice(0, n), error: null }
      },
      update: (patch: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => {
          if (H.error) return { error: H.error }
          H.updates.push({ id, patch })
          return { error: null }
        },
      }),
    }
    return q
  },
} as unknown as BroadcastAttributionDb

beforeEach(() => {
  H.rows = [
    { id: 'os-1', campaign_id: 'camp-1', status: 'sent', email: 'm@x.com', resend_id: 'bc_1' },
    { id: 'os-2', campaign_id: 'camp-1', status: 'sent', email: 'other@x.com', resend_id: 'bc_1' },
    { id: 'os-3', campaign_id: 'camp-2', status: 'sent', email: 'm@x.com', resend_id: 'bc_2' },
  ]
  H.updates.length = 0
  H.error = null
})

describe('findBroadcastSend', () => {
  it('finds the row for this broadcast and this recipient', async () => {
    expect(await findBroadcastSend(db, 'bc_1', 'm@x.com')).toEqual({ id: 'os-1', campaignId: 'camp-1', status: 'sent' })
    expect(await findBroadcastSend(db, 'bc_2', 'm@x.com')).toEqual({ id: 'os-3', campaignId: 'camp-2', status: 'sent' })
  })

  it('matches the lowercased address when Resend reports it differently', async () => {
    expect((await findBroadcastSend(db, 'bc_1', ' M@X.com '))?.id).toBe('os-1')
  })

  it('returns null for an unknown broadcast or recipient', async () => {
    expect(await findBroadcastSend(db, 'bc_9', 'm@x.com')).toBeNull()
    expect(await findBroadcastSend(db, 'bc_1', 'nobody@x.com')).toBeNull()
  })

  it('throws on a database error so the webhook redelivers', async () => {
    H.error = { message: 'db down' }
    await expect(findBroadcastSend(db, 'bc_1', 'm@x.com')).rejects.toThrow(/lookup failed/)
  })
})

describe('recordBroadcastSendOutcome', () => {
  it('maps only delivered, bounced and complained to a status', () => {
    expect(broadcastStatusFor('delivered')).toBe('delivered')
    expect(broadcastStatusFor('bounced')).toBe('bounced')
    expect(broadcastStatusFor('complained')).toBe('complained')
    expect(broadcastStatusFor('opened')).toBeNull()
    expect(broadcastStatusFor('clicked')).toBeNull()
  })

  it('moves the row to the provider outcome', async () => {
    expect(await recordBroadcastSendOutcome(db, { id: 'os-1', campaignId: 'camp-1', status: 'sent' }, 'delivered')).toBe(true)
    expect(H.updates).toEqual([{ id: 'os-1', patch: expect.objectContaining({ status: 'delivered' }) }])
  })

  it('never lets a late delivery overwrite a bounce or complaint, and opens change nothing', async () => {
    expect(await recordBroadcastSendOutcome(db, { id: 'os-1', campaignId: 'camp-1', status: 'bounced' }, 'delivered')).toBe(false)
    expect(await recordBroadcastSendOutcome(db, { id: 'os-1', campaignId: 'camp-1', status: 'sent' }, 'opened')).toBe(false)
    expect(H.updates).toEqual([])
  })

  it('still records a complaint that follows a delivery', async () => {
    expect(await recordBroadcastSendOutcome(db, { id: 'os-1', campaignId: 'camp-1', status: 'delivered' }, 'complained')).toBe(true)
  })

  it('throws on a failed write so the webhook redelivers', async () => {
    H.error = { message: 'db down' }
    await expect(recordBroadcastSendOutcome(db, { id: 'os-1', campaignId: 'camp-1', status: 'sent' }, 'bounced')).rejects.toThrow(/status write failed/)
  })
})
