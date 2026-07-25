import { describe, it, expect } from 'vitest'
import { parseInboundEmailPayload } from './inbox'

// The flat-inbox READ model (groupIntoThreads and friends) is retired (ADR-820) — the Conversations
// workspace over the comms spine is the one operator inbox. What stays under test is the inbound
// webhook fallback's PURE payload parser.

describe('parseInboundEmailPayload', () => {
  it('reads a Resend-style { data: { from, subject, text } } payload', () => {
    const parsed = parseInboundEmailPayload({
      type: 'email.inbound',
      data: { from: 'Ada Lovelace <ADA@Example.com>', subject: '  Re: hello  ', text: '  hi there  ' },
    })
    expect(parsed).toEqual({ from: 'ada@example.com', subject: 'Re: hello', text: 'hi there' })
  })

  it('reads a from object { address } and a flat payload', () => {
    expect(parseInboundEmailPayload({ from: { address: 'x@y.com' } })).toMatchObject({ from: 'x@y.com' })
  })

  it('falls back to html when there is no text, and nulls a blank subject', () => {
    const parsed = parseInboundEmailPayload({ data: { from: 'a@b.com', html: '<p>body</p>', subject: '   ' } })
    expect(parsed?.text).toBe('<p>body</p>')
    expect(parsed?.subject).toBeNull()
  })

  it('returns null without a usable from-address', () => {
    expect(parseInboundEmailPayload({ data: { subject: 'x' } })).toBeNull()
    expect(parseInboundEmailPayload({ data: { from: 'not-an-email' } })).toBeNull()
    expect(parseInboundEmailPayload(null)).toBeNull()
    expect(parseInboundEmailPayload('nope')).toBeNull()
  })
})
