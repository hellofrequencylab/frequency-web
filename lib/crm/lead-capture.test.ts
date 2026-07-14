import { describe, it, expect } from 'vitest'
import {
  LEAD_DOORS,
  isLeadDoor,
  doorLabel,
  isMailableDoor,
  consentStateForDoor,
  normalizeEmail,
  normalizePhoneKey,
  encodeLeadGrab,
  parseLeadGrab,
  buildEntryPointRow,
  type PendingLeadGrab,
} from './lead-capture'

// PURE-engine tests for the capture-now / claim-on-join lead-grab engine (CRM Phase 3). These lock the
// three invariants the DB also enforces: entry-point immutability (a set-once, well-formed door row),
// deterministic dedupe/claim keys (email + phone), and the consent posture (capture != marketing
// consent unless the door is consent-native). No IO — network-free.

describe('door taxonomy', () => {
  it('recognizes exactly the five doors', () => {
    expect([...LEAD_DOORS]).toEqual(['space_qr', 'warm_intro', 'event', 'lead_magnet', 'share_back'])
    for (const d of LEAD_DOORS) expect(isLeadDoor(d)).toBe(true)
    expect(isLeadDoor('nope')).toBe(false)
    expect(isLeadDoor(null)).toBe(false)
    expect(doorLabel('space_qr')).toBe('QR scan')
  })
})

describe('consent posture (capture != marketing consent)', () => {
  it('a default Space-QR grab is NOT mailable; an offer-unlock flips it', () => {
    expect(isMailableDoor('space_qr')).toBe(false)
    expect(isMailableDoor('space_qr', { offerUnlocked: true })).toBe(true)
  })

  it('a lead magnet is consent-native (mailable); event + share-back are not', () => {
    expect(isMailableDoor('lead_magnet')).toBe(true)
    expect(isMailableDoor('event')).toBe(false)
    expect(isMailableDoor('share_back')).toBe(false)
  })

  it('a warm intro is mailable only once accepted (double opt-in)', () => {
    expect(isMailableDoor('warm_intro')).toBe(false)
    expect(isMailableDoor('warm_intro', { introAccepted: true })).toBe(true)
  })

  it('default sealed lead stays unknown; mailable door lifts unknown -> subscribed', () => {
    expect(consentStateForDoor('space_qr', 'unknown')).toBe('unknown')
    expect(consentStateForDoor('lead_magnet', 'unknown')).toBe('subscribed')
    expect(consentStateForDoor('space_qr', 'unknown', { offerUnlocked: true })).toBe('subscribed')
  })

  it('NEVER re-subscribes an unsubscribed lead and never downgrades a subscriber', () => {
    expect(consentStateForDoor('lead_magnet', 'unsubscribed')).toBe('unsubscribed')
    expect(consentStateForDoor('space_qr', 'unsubscribed', { offerUnlocked: true })).toBe('unsubscribed')
    expect(consentStateForDoor('event', 'subscribed')).toBe('subscribed')
  })
})

describe('deterministic dedupe + claim keys', () => {
  it('normalizes email to a lowercased trimmed key, rejecting non-addresses', () => {
    expect(normalizeEmail('  Jo@Example.COM ')).toBe('jo@example.com')
    expect(normalizeEmail('not-an-email')).toBeNull()
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
  })

  it('phone key is the last 10 digits regardless of formatting / country code', () => {
    expect(normalizePhoneKey('+1 (415) 555-0134')).toBe('4155550134')
    expect(normalizePhoneKey('415.555.0134')).toBe('4155550134')
    expect(normalizePhoneKey('555-0134')).toBe('5550134')
    expect(normalizePhoneKey('')).toBeNull()
    // the same human number in two formats resolves to ONE key (dedupe correctness)
    expect(normalizePhoneKey('001-415-555-0134')).toBe(normalizePhoneKey('(415) 555 0134'))
  })
})

describe('pending lead-grab cookie round-trip', () => {
  it('encodes + parses a valid grab', () => {
    const grab: PendingLeadGrab = { s: 'space-1', d: 'space_qr', c: 'code-1', w: 'The Lab', by: 'owner-1', o: true, l: 'Free class' }
    const enc = encodeLeadGrab(grab)
    expect(enc.length).toBeGreaterThan(0)
    expect(parseLeadGrab(enc)).toEqual(grab)
  })

  it('rejects a grab with no space or a bad door', () => {
    expect(encodeLeadGrab({ s: '', d: 'space_qr' } as PendingLeadGrab)).toBe('')
    expect(encodeLeadGrab({ s: 'x', d: 'bogus' } as unknown as PendingLeadGrab)).toBe('')
    expect(parseLeadGrab('')).toBeNull()
    expect(parseLeadGrab('not-json')).toBeNull()
    expect(parseLeadGrab(encodeURIComponent(JSON.stringify({ s: 'x', d: 'bogus' })))).toBeNull()
  })
})

describe('immutable entry-point row (set-once, well-formed)', () => {
  it('builds a normalized row and is deterministic for the same input', () => {
    const input = {
      spaceId: 'space-1',
      contactId: 'contact-1',
      door: 'space_qr' as const,
      label: '  Free  class  ',
      where: '  The Lab  ',
      capturedByProfileId: 'owner-1',
      codeId: 'code-1',
    }
    const a = buildEntryPointRow(input)
    const b = buildEntryPointRow(input)
    expect(a).toEqual(b)
    expect(a?.kind).toBe('space_qr')
    expect(a?.label).toBe('Free class')
    expect(a?.captured_where).toBe('The Lab')
    expect(a?.space_id).toBe('space-1')
    expect(a?.contact_id).toBe('contact-1')
  })

  it('falls back to the door label and null met-context when unset', () => {
    const row = buildEntryPointRow({ spaceId: 's', contactId: 'c', door: 'lead_magnet' })
    expect(row?.label).toBe('Lead magnet')
    expect(row?.captured_where).toBeNull()
    expect(row?.captured_by_profile_id).toBeNull()
    expect(row?.code_id).toBeNull()
  })

  it('returns null for an invalid input (missing ids or unknown door)', () => {
    expect(buildEntryPointRow({ spaceId: '', contactId: 'c', door: 'space_qr' })).toBeNull()
    expect(buildEntryPointRow({ spaceId: 's', contactId: '', door: 'space_qr' })).toBeNull()
    expect(buildEntryPointRow({ spaceId: 's', contactId: 'c', door: 'bogus' as unknown as never })).toBeNull()
  })
})
