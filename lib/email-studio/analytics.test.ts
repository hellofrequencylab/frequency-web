import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeRates, getCampaignMetrics, type EventCounts } from './analytics'

// A tiny stand-in for the supabase admin client. Two read shapes matter to the analytics layer:
//   • campaigns:     .from('campaigns').select(...).eq('id', x).maybeSingle()
//   • email_events:  .from('email_events').select(...).eq('campaign_id', x)   (awaited directly)
type TaggedEvent = { event_type: string; email: string | null; created_at: string }
type CampaignRow = { sent_at: string | null; recipient_count: number | null } | null

let mockCampaign: CampaignRow = null
let mockEvents: TaggedEvent[] = []

function fakeAdminClient() {
  return {
    from(table: string) {
      if (table === 'campaigns') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: mockCampaign, error: null }) }),
          }),
        }
      }
      // email_events — the exact-attribution read, awaited directly.
      return { select: () => ({ eq: async () => ({ data: mockEvents, error: null }) }) }
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdminClient() }))

// computeRates is the pure, zero-safe rate math behind the per-campaign panel. These tests pin
// the two things that matter: the fractions are correct, and every divide-by-zero is guarded.

const counts = (over: Partial<EventCounts> = {}): EventCounts => ({
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  unsubscribed: 0,
  complained: 0,
  ...over,
})

describe('computeRates', () => {
  it('returns all-zero rates for all-zero counts (no NaN / Infinity)', () => {
    const r = computeRates(counts())
    expect(r).toEqual({ openRate: 0, clickRate: 0, bounceRate: 0 })
    expect(Number.isFinite(r.openRate)).toBe(true)
    expect(Number.isFinite(r.clickRate)).toBe(true)
    expect(Number.isFinite(r.bounceRate)).toBe(true)
  })

  it('computes open and click rate against DELIVERED', () => {
    const r = computeRates(counts({ sent: 100, delivered: 80, opened: 40, clicked: 20 }))
    expect(r.openRate).toBeCloseTo(0.5) // 40 / 80
    expect(r.clickRate).toBeCloseTo(0.25) // 20 / 80
  })

  it('computes bounce rate against SENT', () => {
    const r = computeRates(counts({ sent: 200, delivered: 190, bounced: 10 }))
    expect(r.bounceRate).toBeCloseTo(0.05) // 10 / 200
  })

  it('guards open/click when delivered is 0 even if opens/clicks exist', () => {
    // Defensive: a stray open with no delivery must not divide by zero.
    const r = computeRates(counts({ sent: 5, delivered: 0, opened: 3, clicked: 1 }))
    expect(r.openRate).toBe(0)
    expect(r.clickRate).toBe(0)
  })

  it('guards bounce when sent is 0', () => {
    const r = computeRates(counts({ sent: 0, bounced: 2 }))
    expect(r.bounceRate).toBe(0)
  })

  it('yields a rate of exactly 1 when every delivered mail is opened', () => {
    const r = computeRates(counts({ sent: 10, delivered: 10, opened: 10 }))
    expect(r.openRate).toBe(1)
  })

  it('keeps the three rates independent (different denominators)', () => {
    const r = computeRates(counts({ sent: 100, delivered: 50, opened: 25, clicked: 5, bounced: 10 }))
    expect(r.openRate).toBeCloseTo(0.5) // 25 / 50
    expect(r.clickRate).toBeCloseTo(0.1) // 5 / 50
    expect(r.bounceRate).toBeCloseTo(0.1) // 10 / 100
  })
})

// getCampaignMetrics is the attribution seam this fix hardened: exact when the campaign's send
// tagged its events, an honest recipient_count fallback (never the old over-count) when it did not.
describe('getCampaignMetrics attribution', () => {
  beforeEach(() => {
    mockCampaign = null
    mockEvents = []
  })

  it('counts EXACTLY from campaign-tagged events (never the segment window)', async () => {
    mockCampaign = { sent_at: '2026-07-01T00:00:00.000Z', recipient_count: 4 }
    // A real 4-recipient send: 4 sent, 4 delivered, 2 opened, 1 clicked — tagged to THIS campaign.
    mockEvents = [
      { event_type: 'sent', email: 'a@x.com', created_at: '2026-07-01T00:00:00.000Z' },
      { event_type: 'sent', email: 'b@x.com', created_at: '2026-07-01T00:00:00.000Z' },
      { event_type: 'sent', email: 'c@x.com', created_at: '2026-07-01T00:00:00.000Z' },
      { event_type: 'sent', email: 'd@x.com', created_at: '2026-07-01T00:00:00.000Z' },
      { event_type: 'delivered', email: 'a@x.com', created_at: '2026-07-01T00:01:00.000Z' },
      { event_type: 'delivered', email: 'b@x.com', created_at: '2026-07-01T00:01:00.000Z' },
      { event_type: 'delivered', email: 'c@x.com', created_at: '2026-07-01T00:01:00.000Z' },
      { event_type: 'delivered', email: 'd@x.com', created_at: '2026-07-01T00:01:00.000Z' },
      { event_type: 'opened', email: 'a@x.com', created_at: '2026-07-01T01:00:00.000Z' },
      { event_type: 'opened', email: 'b@x.com', created_at: '2026-07-01T01:00:00.000Z' },
      { event_type: 'clicked', email: 'a@x.com', created_at: '2026-07-01T02:00:00.000Z' },
    ]
    const m = await getCampaignMetrics('camp-1')
    expect(m.attributionMode).toBe('exact')
    expect(m.hasSent).toBe(true)
    expect(m.sent).toBe(4)
    expect(m.delivered).toBe(4) // exactly the send size, NOT an over-attributed 25
    expect(m.opened).toBe(2)
    expect(m.clicked).toBe(1)
    expect(m.openRate).toBeCloseTo(0.5) // 2 / 4
    expect(m.clickRate).toBeCloseTo(0.25) // 1 / 4
    expect(m.attributedRecipients).toBe(4) // four distinct addresses
  })

  it('falls back to recipient_count for an untagged (legacy) send WITHOUT over-counting', async () => {
    // Sent before exact attribution shipped: no tagged events at all.
    mockCampaign = { sent_at: '2026-01-01T00:00:00.000Z', recipient_count: 4 }
    mockEvents = []
    const m = await getCampaignMetrics('legacy-1')
    expect(m.attributionMode).toBe('legacy')
    expect(m.hasSent).toBe(true)
    expect(m.sent).toBe(4) // the REAL send size, from recipient_count
    expect(m.delivered).toBe(4) // never the fabricated heuristic count
    expect(m.opened).toBe(0)
    expect(m.clicked).toBe(0)
    expect(m.openRate).toBe(0) // engagement is unavailable, surfaced as 0 (the UI hides it)
    expect(m.clickRate).toBe(0)
    expect(m.attributedRecipients).toBe(4)
  })

  it('reports hasSent=false for a draft / unsent campaign (no sent_at)', async () => {
    mockCampaign = { sent_at: null, recipient_count: 0 }
    const m = await getCampaignMetrics('draft-1')
    expect(m.hasSent).toBe(false)
    expect(m.delivered).toBe(0)
    expect(m.attributionMode).toBe('exact')
  })

  it('fails soft to an empty, unsent shape when the campaign is missing', async () => {
    mockCampaign = null
    const m = await getCampaignMetrics('missing-1')
    expect(m.hasSent).toBe(false)
    expect(m.sent).toBe(0)
    expect(m.delivered).toBe(0)
  })
})
