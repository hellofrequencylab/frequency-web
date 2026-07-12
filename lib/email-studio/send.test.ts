import { describe, it, expect } from 'vitest'
import {
  nextCampaignStatus,
  exceedsEmailSizeGuard,
  emailHtmlByteLength,
  emailSizeWarning,
  EMAIL_SIZE_WARN_BYTES,
  type CampaignStatus,
  type CampaignAction,
} from './send'

describe('nextCampaignStatus', () => {
  it('walks the happy path draft -> scheduled -> sending -> sent', () => {
    expect(nextCampaignStatus('draft', 'schedule')).toBe('scheduled')
    expect(nextCampaignStatus('scheduled', 'send')).toBe('sending')
    expect(nextCampaignStatus('sending', 'complete')).toBe('sent')
  })

  it('allows an immediate send from draft (no scheduling step)', () => {
    expect(nextCampaignStatus('draft', 'send')).toBe('sending')
  })

  it('cancels a scheduled campaign', () => {
    expect(nextCampaignStatus('scheduled', 'cancel')).toBe('cancelled')
  })

  it('pauses an in-flight send and resumes it', () => {
    expect(nextCampaignStatus('sending', 'pause')).toBe('paused')
    expect(nextCampaignStatus('paused', 'resume')).toBe('sending')
  })

  it('lets a scheduled campaign pause and a paused campaign cancel', () => {
    expect(nextCampaignStatus('scheduled', 'pause')).toBe('paused')
    expect(nextCampaignStatus('paused', 'cancel')).toBe('cancelled')
  })

  it('treats sent and cancelled as terminal (no transition out)', () => {
    const actions: CampaignAction[] = ['schedule', 'send', 'complete', 'pause', 'resume', 'cancel']
    for (const a of actions) {
      expect(nextCampaignStatus('sent', a)).toBeNull()
      expect(nextCampaignStatus('cancelled', a)).toBeNull()
    }
  })

  it('refuses illegal transitions', () => {
    expect(nextCampaignStatus('draft', 'complete')).toBeNull()
    expect(nextCampaignStatus('draft', 'resume')).toBeNull()
    expect(nextCampaignStatus('draft', 'pause')).toBeNull()
    expect(nextCampaignStatus('sending', 'schedule')).toBeNull()
    expect(nextCampaignStatus('sending', 'send')).toBeNull()
    expect(nextCampaignStatus('scheduled', 'complete')).toBeNull()
    expect(nextCampaignStatus('paused', 'send')).toBeNull()
  })

  it('returns null for an unknown current status', () => {
    expect(nextCampaignStatus('bogus', 'send')).toBeNull()
    expect(nextCampaignStatus('', 'schedule')).toBeNull()
  })

  it('never advances into draft or an undefined status', () => {
    const statuses: CampaignStatus[] = ['draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled']
    const actions: CampaignAction[] = ['schedule', 'send', 'complete', 'pause', 'resume', 'cancel']
    for (const s of statuses) {
      for (const a of actions) {
        const nextStatus = nextCampaignStatus(s, a)
        if (nextStatus !== null) {
          expect(statuses).toContain(nextStatus)
          expect(nextStatus).not.toBe('draft')
        }
      }
    }
  })
})

describe('email size guard', () => {
  it('measures UTF-8 byte length (not string length)', () => {
    expect(emailHtmlByteLength('abc')).toBe(3)
    // A multi-byte character counts as more than one byte.
    expect(emailHtmlByteLength('—')).toBeGreaterThan(1)
  })

  it('passes a small email', () => {
    expect(exceedsEmailSizeGuard('<p>hello</p>')).toBe(false)
  })

  it('flags an email over ~95 KB', () => {
    const big = 'x'.repeat(EMAIL_SIZE_WARN_BYTES + 1)
    expect(exceedsEmailSizeGuard(big)).toBe(true)
  })

  it('does not flag an email exactly at the threshold', () => {
    const atLimit = 'x'.repeat(EMAIL_SIZE_WARN_BYTES)
    expect(exceedsEmailSizeGuard(atLimit)).toBe(false)
  })

  it('reports the size in KB and warns about the Gmail clip, with no em dash', () => {
    const msg = emailSizeWarning(100 * 1024)
    expect(msg).toContain('100 KB')
    expect(msg).toContain('102 KB')
    expect(msg).not.toContain('—')
  })
})
