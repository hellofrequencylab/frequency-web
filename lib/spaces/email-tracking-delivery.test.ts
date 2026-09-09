import { describe, it, expect, beforeEach, vi } from 'vitest'

// PER-SPACE DELIVERY EVENTS (LIVE-236). `space_email_events` was read by the Marketing panel and the
// member detail, and written only by the self-hosted pixel / click / reply seams. The PROVIDER events
// never reached it, and worse: the Resend webhook called the Space seam only for bounces and
// complaints, so a Space send's status went queued -> sent and stopped. Nothing set `delivered`, and
// getSpaceEmailStats counts outreach_sends by status, so every operator read "Delivered 0" forever.
//
// Locks the two halves of the fix that are testable without a database: the PURE Resend-to-kind map
// (an unmapped type must write nothing at all) and the writer's attribution rule (a pure platform
// email, whose id no outreach_sends row owns, writes nothing and invents no Space).

const { insert, sendRow } = vi.hoisted(() => ({ insert: vi.fn(), sendRow: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'space_email_events') {
        return { insert: (rows: unknown[]) => { insert(rows); return Promise.resolve({ error: null }) } }
      }
      if (table === 'outreach_sends') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: sendRow() }) }) }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))
vi.mock('@/lib/signing-secret', () => ({ signingSecret: () => 'test-secret' }))

const { spaceEventKindForResend, recordSpaceSendEventFromResend } = await import('./email-tracking')

beforeEach(() => {
  vi.clearAllMocks()
  sendRow.mockReturnValue({ id: 'send_1', space_id: 'space_1', email: 'Someone@Example.com' })
})

describe('spaceEventKindForResend', () => {
  it('maps every provider event the per-Space log carries', () => {
    expect(spaceEventKindForResend('delivered')).toBe('delivered')
    expect(spaceEventKindForResend('opened')).toBe('open')
    expect(spaceEventKindForResend('clicked')).toBe('click')
    expect(spaceEventKindForResend('bounced')).toBe('bounced')
    expect(spaceEventKindForResend('complained')).toBe('complained')
  })

  it('maps nothing else, so an unknown provider event writes no row', () => {
    for (const t of ['sent', 'queued', 'delivery_delayed', '', null, undefined, 'DELIVERED ']) {
      expect(spaceEventKindForResend(t as string)).toBeNull()
    }
  })
})

describe('recordSpaceSendEventFromResend', () => {
  it('writes one event attributed to the Space that owns the send', async () => {
    const wrote = await recordSpaceSendEventFromResend('re_1', 'delivered')
    expect(wrote).toBe(true)
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0][0][0]).toMatchObject({
      space_id: 'space_1',
      send_id: 'send_1',
      kind: 'delivered',
      contact_email: 'someone@example.com',
    })
  })

  it('writes NOTHING for a pure platform email (no Space send owns the id)', async () => {
    sendRow.mockReturnValue(null)
    expect(await recordSpaceSendEventFromResend('re_unknown', 'delivered')).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })

  it('writes nothing for an unmapped event type, and never looks up a send', async () => {
    expect(await recordSpaceSendEventFromResend('re_1', 'delivery_delayed')).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })

  it('writes nothing without a provider id', async () => {
    expect(await recordSpaceSendEventFromResend(null, 'delivered')).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })
})
