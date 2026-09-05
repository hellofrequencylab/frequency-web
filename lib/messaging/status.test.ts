import { describe, it, expect } from 'vitest'
import {
  MESSAGING_STATUS_META,
  MESSAGING_STATUS_LEGEND,
  messagingStatusMeta,
  campaignStatusToMessaging,
  funnelStatusToMessaging,
  isSendingLeaseStale,
  SENDING_LEASE_MINUTES,
  SENDING_LEASE_MS,
  type MessagingStatus,
} from './status'

// Lock the ONE status vocabulary the Messaging console shows for both Campaigns and
// Funnels: every raw DB status normalizes into a legend entry, and every legend entry
// has a glyph + tone (the ✅/⏳/⚠️/🔴 presentation standard).
describe('messaging status', () => {
  it('gives every status a glyph, tone, and label', () => {
    for (const key of Object.keys(MESSAGING_STATUS_META) as MessagingStatus[]) {
      const meta = MESSAGING_STATUS_META[key]
      expect(meta.glyph).toBeTruthy()
      expect(meta.label).toBeTruthy()
      expect(meta.tone).toBeTruthy()
      expect(meta.key).toBe(key)
    }
  })

  it('legend rows are all real statuses', () => {
    for (const row of MESSAGING_STATUS_LEGEND) {
      expect(MESSAGING_STATUS_META[row.key]).toBe(row)
    }
  })

  it('normalizes campaign statuses', () => {
    expect(campaignStatusToMessaging('sent')).toBe('sent')
    expect(campaignStatusToMessaging('DELIVERED')).toBe('sent')
    expect(campaignStatusToMessaging('scheduled')).toBe('scheduled')
    expect(campaignStatusToMessaging('sending')).toBe('live')
    expect(campaignStatusToMessaging('failed')).toBe('failed')
    expect(campaignStatusToMessaging('')).toBe('draft')
    expect(campaignStatusToMessaging('anything-else')).toBe('draft')
  })

  // scan2 L6-10: a 'sending' row whose lease expired is a dead sender, shown as 'stalled', not 'live'.
  it('shows a sending row with an expired lease as stalled, a fresh or missing lease as live', () => {
    const now = Date.now()
    const fresh = new Date(now - SENDING_LEASE_MS / 2).toISOString()
    const stale = new Date(now - SENDING_LEASE_MS - 1_000).toISOString()
    expect(campaignStatusToMessaging('sending', fresh)).toBe('live')
    expect(campaignStatusToMessaging('sending', stale)).toBe('stalled')
    expect(campaignStatusToMessaging('sending', null)).toBe('live')
    expect(campaignStatusToMessaging('sent', stale)).toBe('sent') // the lease only speaks for 'sending'
    expect(isSendingLeaseStale(stale)).toBe(true)
    expect(isSendingLeaseStale('not a date')).toBe(false)
    expect(MESSAGING_STATUS_META.stalled.tone).toBe('warning')
    expect(SENDING_LEASE_MINUTES).toBe(15)
  })

  it('normalizes funnel statuses', () => {
    expect(funnelStatusToMessaging('active')).toBe('live')
    expect(funnelStatusToMessaging('archived')).toBe('archived')
    expect(funnelStatusToMessaging('draft')).toBe('draft')
    expect(funnelStatusToMessaging('unknown')).toBe('draft')
  })

  it('messagingStatusMeta falls back to draft for an unknown status', () => {
    expect(messagingStatusMeta('nope' as MessagingStatus).key).toBe('draft')
  })
})
