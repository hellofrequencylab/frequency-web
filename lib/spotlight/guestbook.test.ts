import { describe, it, expect } from 'vitest'
import {
  normalizeGuestbookMessage,
  GUESTBOOK_MESSAGE_MAX,
  GUESTBOOK_MESSAGE_MIN,
} from './guestbook.shared'

// The guestbook sign action is a thin wrapper over this pure normalizer plus the RLS-backed
// session write (unique slot + hourly count). The normalizer is the text boundary: whatever
// it returns is what the schema's 1..500 bound receives, so these tests lock that a note is
// always trimmed, control-free, single-spaced, and clamped — or rejected as null, never a
// thrown error.

describe('normalizeGuestbookMessage', () => {
  it('returns null for non-string / garbage input (never throws)', () => {
    for (const junk of [null, undefined, 42, {}, ['hi'], true]) {
      expect(normalizeGuestbookMessage(junk)).toBeNull()
    }
  })

  it('trims and collapses runs of spaces', () => {
    expect(normalizeGuestbookMessage('  so   good  to  see  you  ')).toBe('so good to see you')
  })

  it('collapses newline runs to one and normalizes CRLF', () => {
    expect(normalizeGuestbookMessage('line one\r\n\r\n\n   line two')).toBe('line one\nline two')
  })

  it('strips control characters but keeps the text', () => {
    expect(normalizeGuestbookMessage('hey \u0000 there\u001b[31m')).toBe('hey there[31m')
  })

  it('rejects a note that is too short once cleaned', () => {
    expect(normalizeGuestbookMessage('')).toBeNull()
    expect(normalizeGuestbookMessage('   ')).toBeNull()
    expect(normalizeGuestbookMessage('\x07\x07a')).toBeNull()
    expect('a'.repeat(GUESTBOOK_MESSAGE_MIN).length).toBe(2) // the bound the cases above sit under
  })

  it('clamps to GUESTBOOK_MESSAGE_MAX', () => {
    const long = 'x'.repeat(GUESTBOOK_MESSAGE_MAX + 200)
    expect(normalizeGuestbookMessage(long)).toHaveLength(GUESTBOOK_MESSAGE_MAX)
  })

  it('keeps an ordinary note byte-identical', () => {
    expect(normalizeGuestbookMessage('Great show last week. See you at the next one!')).toBe(
      'Great show last week. See you at the next one!',
    )
  })
})
