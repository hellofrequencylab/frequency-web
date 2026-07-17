import { describe, it, expect } from 'vitest'
import {
  nextCampaignStatus,
  exceedsEmailSizeGuard,
  emailHtmlByteLength,
  emailSizeWarning,
  sanitizeFromName,
  sanitizeFromAddress,
  buildCampaignFrom,
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

describe('from-name sanitize + header build', () => {
  const BASE = 'Frequency <noreply@send.frequencylocal.com>'

  it('keeps a plain display name intact', () => {
    expect(sanitizeFromName('Riverside Studio')).toBe('Riverside Studio')
  })

  it('strips CR / LF / tabs so a name can never inject a header line', () => {
    const out = sanitizeFromName('Riverside\r\nBcc: attacker@evil.com')
    expect(out).not.toContain('\r')
    expect(out).not.toContain('\n')
    expect(out).not.toContain('\t')
    // The injected header keyword is de-fanged (the newline and the ":" that would form a header are gone).
    expect(out).not.toContain(':')
  })

  it('removes address delimiters and separators (" < > \\ @ , ; :)', () => {
    const out = sanitizeFromName('Ann "The Boss" <ann@evil.com>, x')
    for (const ch of ['"', '<', '>', '@', ',', ';', ':', '\\']) {
      expect(out).not.toContain(ch)
    }
    expect(out).toContain('Ann')
  })

  it('collapses whitespace, trims, and bounds the length to 78 chars', () => {
    expect(sanitizeFromName('  Alex   Rivera  ')).toBe('Alex Rivera')
    expect(sanitizeFromName('x'.repeat(200)).length).toBe(78)
  })

  it('returns empty for a non-string or a name with nothing usable', () => {
    expect(sanitizeFromName(null)).toBe('')
    expect(sanitizeFromName(undefined)).toBe('')
    expect(sanitizeFromName(42)).toBe('')
    expect(sanitizeFromName('   ')).toBe('')
    expect(sanitizeFromName('@<>"')).toBe('')
  })

  it('builds a From header that swaps only the display name, keeping the verified address', () => {
    expect(buildCampaignFrom('Riverside Studio', BASE)).toBe('Riverside Studio <noreply@send.frequencylocal.com>')
  })

  it('falls back to the base From when the name is blank / unusable (pre-migration safe)', () => {
    expect(buildCampaignFrom('', BASE)).toBe(BASE)
    expect(buildCampaignFrom(null, BASE)).toBe(BASE)
    expect(buildCampaignFrom('   ', BASE)).toBe(BASE)
  })

  it('sanitizes the name before assembling the header (no injection reaches the From)', () => {
    const from = buildCampaignFrom('Bad\nName <evil@x.com>', BASE)
    // The newline and the address delimiters are stripped, so the attacker address can never take over the
    // From; the verified envelope address is preserved.
    expect(from).not.toContain('\n')
    expect(from).not.toContain('evil@x.com')
    expect(from).not.toContain('<evil')
    expect(from.startsWith('Bad Name')).toBe(true)
    expect(from.endsWith('<noreply@send.frequencylocal.com>')).toBe(true)
  })
})

describe('from-address sanitize + broadcast envelope', () => {
  it('accepts a clean, well-formed address', () => {
    expect(sanitizeFromAddress('daniel@danieltyack.com')).toBe('daniel@danieltyack.com')
    expect(sanitizeFromAddress('  hello@frequencylocal.com  ')).toBe('hello@frequencylocal.com')
  })

  it('rejects header-injection, malformed, and non-string values', () => {
    expect(sanitizeFromAddress('daniel@danieltyack.com\r\nBcc: evil@x.com')).toBe('')
    expect(sanitizeFromAddress('not-an-email')).toBe('') // no @
    expect(sanitizeFromAddress('a@b')).toBe('') // no dotted domain
    expect(sanitizeFromAddress('a b@c.com')).toBe('') // whitespace
    expect(sanitizeFromAddress('"x"<y@z.com>')).toBe('') // delimiters
    expect(sanitizeFromAddress(null)).toBe('')
    expect(sanitizeFromAddress(42)).toBe('')
  })

  it('builds the broadcast From from a BARE address base, swapping the display name on top', () => {
    // A per-campaign from_address is a bare addr-spec; buildCampaignFrom must keep it and prepend the name.
    expect(buildCampaignFrom('Daniel Tyack', 'daniel@danieltyack.com')).toBe('Daniel Tyack <daniel@danieltyack.com>')
  })

  it('returns the bare address unchanged when no display name is set', () => {
    expect(buildCampaignFrom('', 'daniel@danieltyack.com')).toBe('daniel@danieltyack.com')
  })
})
